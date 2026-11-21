package httpapi

import (
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        int       `json:"id"`
	Login     string    `json:"login"`
	Role      string    `json:"role"`
	RoleName  string    `json:"role_name"`
	Email     string    `json:"email"`
	IsActive  bool      `json:"is_active"`
	DriverID  *int      `json:"driver_id"`
	ClientID  *int      `json:"client_id"`
	LinkedTo  *string   `json:"linked_to"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	items, err := queryList(r.Context(), s, `SELECT u.id, u.login, ro.code, ro.name, COALESCE(u.email, ''),
		u.is_active, d.id, c.id,
		COALESCE(d.last_name || ' ' || left(d.first_name, 1) || '. ' || left(d.middle_name, 1) || '.', c.name),
		u.created_at
		FROM users u JOIN roles ro ON ro.id = u.role_id
		LEFT JOIN drivers d ON d.user_id = u.id
		LEFT JOIN clients c ON c.user_id = u.id
		ORDER BY ro.id, u.login`,
		func(row interface{ Scan(...any) error }, u *User) error {
			return row.Scan(&u.ID, &u.Login, &u.Role, &u.RoleName, &u.Email, &u.IsActive,
				&u.DriverID, &u.ClientID, &u.LinkedTo, &u.CreatedAt)
		})
	respond(w, items, err)
}

type userInput struct {
	Login    string `json:"login"`
	Password string `json:"password"`
	Role     string `json:"role"`
	Email    string `json:"email"`
	IsActive bool   `json:"is_active"`
	DriverID *int   `json:"driver_id"`
	ClientID *int   `json:"client_id"`
}

func (in *userInput) validate(f fieldErrors, creating bool) {
	in.Login = strings.TrimSpace(in.Login)
	if !validLogin(in.Login) {
		f.add("login", "Логин: латинские буквы, цифры и символы _ . -, от 3 до 50 символов")
	}
	if creating || in.Password != "" {
		if !validPassword(in.Password) {
			f.add("password", "Пароль: не короче 8 символов, буквы и цифры")
		}
	}
	switch in.Role {
	case RoleAdmin, RoleDispatcher:
	case RoleDriver:
		if in.DriverID == nil {
			f.add("driver_id", "Для роли «Водитель» выберите водителя")
		}
	case RoleClient:
		if in.ClientID == nil {
			f.add("client_id", "Для роли «Клиент» выберите клиента")
		}
	default:
		f.add("role", "Выберите роль")
	}
	if in.Email != "" && !reEmail.MatchString(in.Email) {
		f.add("email", "Некорректный адрес электронной почты")
	}
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	var in userInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	in.validate(f, true)
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, err)
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer tx.Rollback(ctx)
	var id int
	if err := tx.QueryRow(ctx, `INSERT INTO users (login, password_hash, role_id, email, is_active)
		VALUES ($1, $2, (SELECT id FROM roles WHERE code = $3), NULLIF($4, ''), TRUE) RETURNING id`,
		in.Login, string(hash), in.Role, strings.TrimSpace(in.Email)).Scan(&id); err != nil {
		writeErr(w, err)
		return
	}
	if in.Role == RoleDriver {
		_, err = tx.Exec(ctx, `UPDATE drivers SET user_id = $1 WHERE id = $2`, id, *in.DriverID)
	} else if in.Role == RoleClient {
		_, err = tx.Exec(ctx, `UPDATE clients SET user_id = $1 WHERE id = $2`, id, *in.ClientID)
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// updateUser изменяет учётную запись. При смене роли, пароля или блокировке
// все активные сессии пользователя завершаются.
func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var in userInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	in.validate(f, false)
	if id == sessionFrom(r).UserID && (!in.IsActive || in.Role != RoleAdmin) {
		f.add("role", "Нельзя заблокировать себя или снять с себя роль администратора")
	}
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE users SET login = $1, role_id = (SELECT id FROM roles WHERE code = $2),
		email = NULLIF($3, ''), is_active = $4 WHERE id = $5`,
		in.Login, in.Role, strings.TrimSpace(in.Email), in.IsActive, id); err != nil {
		writeErr(w, err)
		return
	}
	if in.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
		if err == nil {
			_, err = tx.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, string(hash), id)
		}
		if err != nil {
			writeErr(w, err)
			return
		}
	}
	// Пересвязываем учётную запись с карточкой водителя или клиента.
	if _, err := tx.Exec(ctx, `UPDATE drivers SET user_id = NULL WHERE user_id = $1`, id); err != nil {
		writeErr(w, err)
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE clients SET user_id = NULL WHERE user_id = $1`, id); err != nil {
		writeErr(w, err)
		return
	}
	if in.Role == RoleDriver {
		_, err = tx.Exec(ctx, `UPDATE drivers SET user_id = $1 WHERE id = $2`, id, *in.DriverID)
	} else if in.Role == RoleClient {
		_, err = tx.Exec(ctx, `UPDATE clients SET user_id = $1 WHERE id = $2`, id, *in.ClientID)
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, err)
		return
	}
	s.cache.DropUserSessions(ctx, id)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	if id == sessionFrom(r).UserID {
		writeErr(w, conflict("Нельзя удалить собственную учётную запись"))
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM users WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		err = errNotFound
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	s.cache.DropUserSessions(r.Context(), id)
	w.WriteHeader(http.StatusNoContent)
}
