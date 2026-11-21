package httpapi

import (
	"net/http"
	"strings"
	"time"
)

type clientInput struct {
	ClientType    string `json:"client_type"`
	Name          string `json:"name"`
	INN           string `json:"inn"`
	ContactPerson string `json:"contact_person"`
	Phone         string `json:"phone"`
	Email         string `json:"email"`
	Address       string `json:"address"`
}

type Client struct {
	ID          int       `json:"id"`
	OrdersCount int       `json:"orders_count"`
	HasAccount  bool      `json:"has_account"`
	CreatedAt   time.Time `json:"created_at"`
	clientInput
}

const insertClientSQL = `INSERT INTO clients
	(client_type, name, inn, contact_person, phone, email, address, user_id)
	VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8)`

// validate проверяет и нормализует данные клиента.
func (c *clientInput) validate(f fieldErrors) {
	c.Name = strings.TrimSpace(c.Name)
	c.INN = strings.TrimSpace(c.INN)
	c.Email = strings.TrimSpace(c.Email)
	if c.ClientType != "P" && c.ClientType != "C" {
		f.add("client_type", "Выберите тип клиента")
	}
	f.required("name", c.Name, "Наименование / ФИО")
	f.maxLen("name", c.Name, 200)
	if c.INN != "" && !validINN(c.INN) {
		f.add("inn", "ИНН должен содержать 10 или 12 цифр с верной контрольной суммой")
	}
	if c.ClientType == "C" && c.INN == "" {
		f.add("inn", "Для юридического лица ИНН обязателен")
	}
	if c.ClientType == "C" && len(c.INN) == 12 {
		f.add("inn", "ИНН юридического лица состоит из 10 цифр")
	}
	if p := normalizePhone(c.Phone); p == "" {
		f.add("phone", "Телефон: 10 цифр после +7")
	} else {
		c.Phone = p
	}
	if c.Email != "" && !reEmail.MatchString(c.Email) {
		f.add("email", "Некорректный адрес электронной почты")
	}
	f.maxLen("address", c.Address, 255)
	f.maxLen("contact_person", c.ContactPerson, 150)
}

func (c *clientInput) args(userID *int) []any {
	return []any{c.ClientType, c.Name, c.INN, strings.TrimSpace(c.ContactPerson),
		c.Phone, c.Email, strings.TrimSpace(c.Address), userID}
}

const clientSelect = `SELECT c.id, c.client_type, c.name, COALESCE(c.inn, ''), c.contact_person,
	c.phone, c.email, c.address, c.user_id IS NOT NULL, c.created_at,
	(SELECT count(*) FROM orders o WHERE o.client_id = c.id)
	FROM clients c`

func scanClient(row interface{ Scan(...any) error }) (Client, error) {
	var c Client
	err := row.Scan(&c.ID, &c.ClientType, &c.Name, &c.INN, &c.ContactPerson, &c.Phone,
		&c.Email, &c.Address, &c.HasAccount, &c.CreatedAt, &c.OrdersCount)
	return c, err
}

// listClients — поиск клиентов по наименованию, ИНН или телефону.
func (s *Server) listClients(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"TRUE"}
	var args []any
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		args = append(args, "%"+strings.ToLower(v)+"%")
		n := itoa(len(args))
		where = append(where, "(lower(c.name) LIKE $"+n+" OR c.inn LIKE $"+n+
			" OR regexp_replace(c.phone, '\\D', '', 'g') LIKE $"+n+")")
	}
	if v := q.Get("type"); v == "P" || v == "C" {
		args = append(args, v)
		where = append(where, "c.client_type = $"+itoa(len(args)))
	}
	cond := " WHERE " + strings.Join(where, " AND ")
	var res page[Client]
	if err := s.db.QueryRow(r.Context(), `SELECT count(*) FROM clients c`+cond, args...).Scan(&res.Total); err != nil {
		writeErr(w, err)
		return
	}
	limit, offset := pageParams(r)
	args = append(args, limit, offset)
	rows, err := s.db.Query(r.Context(), clientSelect+cond+` ORDER BY c.name LIMIT $`+
		itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer rows.Close()
	res.Items = []Client{}
	for rows.Next() {
		c, err := scanClient(rows)
		if err != nil {
			writeErr(w, err)
			return
		}
		res.Items = append(res.Items, c)
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) getClient(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	c, err := scanClient(s.db.QueryRow(r.Context(), clientSelect+` WHERE c.id = $1`, id))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) createClient(w http.ResponseWriter, r *http.Request) {
	var in clientInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	in.validate(f)
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	var id int
	if err := s.db.QueryRow(r.Context(), insertClientSQL+` RETURNING id`, in.args(nil)...).Scan(&id); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (s *Server) updateClient(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var in clientInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	in.validate(f)
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	tag, err := s.db.Exec(r.Context(), `UPDATE clients SET client_type = $1, name = $2,
		inn = NULLIF($3, ''), contact_person = $4, phone = $5, email = $6, address = $7
		WHERE id = $8`, in.ClientType, in.Name, in.INN, strings.TrimSpace(in.ContactPerson),
		in.Phone, in.Email, strings.TrimSpace(in.Address), id)
	if err == nil && tag.RowsAffected() == 0 {
		err = errNotFound
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// deleteClient удаляет клиента; его заявки удаляются каскадно.
// Клиента, у которого есть рейсы в работе, удалить нельзя.
func (s *Server) deleteClient(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var active int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM orders
		WHERE client_id = $1 AND status IN ('assigned', 'in_transit')`, id).Scan(&active)
	if active > 0 {
		writeErr(w, conflict("У клиента есть заявки в работе — удаление невозможно"))
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM clients WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		err = errNotFound
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(r.Context(), "stats")
	w.WriteHeader(http.StatusNoContent)
}
