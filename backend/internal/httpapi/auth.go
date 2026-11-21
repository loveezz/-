package httpapi

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"gruzline/internal/cache"
)

type loginRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

// login выполняет вход: проверяет лимит попыток, пароль и активность учётной записи,
// создаёт сессию в Redis и устанавливает cookie.
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := readJSON(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	req.Login = strings.TrimSpace(req.Login)
	f := fieldErrors{}
	f.required("login", req.Login, "Логин")
	f.required("password", req.Password, "Пароль")
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}

	ctx := r.Context()
	failKey := strings.ToLower(req.Login) + ":" + clientIP(r)
	if s.cache.LoginBlocked(ctx, failKey) {
		writeError(w, http.StatusTooManyRequests,
			"Превышено число попыток входа. Повторите через 15 минут")
		return
	}

	var (
		userID   int
		hash     string
		role     string
		isActive bool
	)
	err := s.db.QueryRow(ctx, `
		SELECT u.id, u.password_hash, r.code, u.is_active
		FROM users u JOIN roles r ON r.id = u.role_id
		WHERE lower(u.login) = lower($1)`, req.Login).Scan(&userID, &hash, &role, &isActive)
	if errors.Is(err, pgx.ErrNoRows) ||
		(err == nil && bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil) {
		s.cache.LoginFailed(ctx, failKey)
		writeError(w, http.StatusUnauthorized, "Неверный логин или пароль")
		return
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	if !isActive {
		writeError(w, http.StatusForbidden, "Учётная запись заблокирована. Обратитесь к администратору")
		return
	}
	s.cache.LoginSucceeded(ctx, failKey)

	sess, err := s.buildSession(ctx, userID, req.Login, role)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := s.startSession(w, r, sess); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

// buildSession дополняет сессию идентификатором водителя или клиента.
func (s *Server) buildSession(ctx context.Context, userID int, login, role string) (cache.Session, error) {
	sess := cache.Session{UserID: userID, Login: login, Role: role}
	var id int
	switch role {
	case RoleDriver:
		if err := s.db.QueryRow(ctx, `SELECT id FROM drivers WHERE user_id = $1`, userID).Scan(&id); err == nil {
			sess.DriverID = &id
		}
	case RoleClient:
		if err := s.db.QueryRow(ctx, `SELECT id FROM clients WHERE user_id = $1`, userID).Scan(&id); err == nil {
			sess.ClientID = &id
		}
	}
	return sess, nil
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, sess cache.Session) error {
	token, err := s.cache.CreateSession(r.Context(), sess)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name: "session", Value: token, Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, MaxAge: int(cache.SessionTTL.Seconds()),
	})
	return nil
}

func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		return strings.TrimSpace(strings.Split(xf, ",")[0])
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	return host
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("session"); err == nil {
		s.cache.DeleteSession(r.Context(), c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

type meResponse struct {
	cache.Session
	DisplayName string `json:"display_name"`
	RoleName    string `json:"role_name"`
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	resp := meResponse{Session: *sess}
	_ = s.db.QueryRow(r.Context(), `SELECT name FROM roles WHERE code = $1`, sess.Role).Scan(&resp.RoleName)
	resp.DisplayName = resp.RoleName
	switch {
	case sess.DriverID != nil:
		_ = s.db.QueryRow(r.Context(), `SELECT last_name || ' ' || first_name || ' ' || middle_name
			FROM drivers WHERE id = $1`, *sess.DriverID).Scan(&resp.DisplayName)
	case sess.ClientID != nil:
		_ = s.db.QueryRow(r.Context(), `SELECT name FROM clients WHERE id = $1`, *sess.ClientID).Scan(&resp.DisplayName)
	}
	writeJSON(w, http.StatusOK, resp)
}

type registerRequest struct {
	Login     string `json:"login"`
	Password  string `json:"password"`
	Password2 string `json:"password2"`
	clientInput
}

// register — самостоятельная регистрация клиента. В одной транзакции
// создаются учётная запись и карточка клиента, затем открывается сессия.
func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := readJSON(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	req.Login = strings.TrimSpace(req.Login)
	f := fieldErrors{}
	if !validLogin(req.Login) {
		f.add("login", "Логин: латинские буквы, цифры и символы _ . -, от 3 до 50 символов")
	}
	if !validPassword(req.Password) {
		f.add("password", "Пароль: не короче 8 символов, буквы и цифры")
	}
	if req.Password != req.Password2 {
		f.add("password2", "Пароли не совпадают")
	}
	req.clientInput.validate(f)
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
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

	var userID, clientID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO users (login, password_hash, role_id, email)
		VALUES ($1, $2, (SELECT id FROM roles WHERE code = 'client'), NULLIF($3, ''))
		RETURNING id`, req.Login, string(hash), req.Email).Scan(&userID); err != nil {
		writeErr(w, err)
		return
	}
	if err := tx.QueryRow(ctx, insertClientSQL+` RETURNING id`, req.clientInput.args(&userID)...).Scan(&clientID); err != nil {
		writeErr(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, err)
		return
	}
	sess := cache.Session{UserID: userID, Login: req.Login, Role: RoleClient, ClientID: &clientID}
	if err := s.startSession(w, r, sess); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, sess)
}
