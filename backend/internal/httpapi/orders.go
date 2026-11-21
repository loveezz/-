package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Статусы заявки
const (
	StatusNew       = "new"
	StatusAssigned  = "assigned"
	StatusInTransit = "in_transit"
	StatusDelivered = "delivered"
	StatusCancelled = "cancelled"
)

type Order struct {
	ID               int       `json:"id"`
	ClientID         int       `json:"client_id"`
	ClientName       string    `json:"client_name"`
	ClientPhone      string    `json:"client_phone"`
	ClientINN        string    `json:"client_inn"`
	RouteID          int       `json:"route_id"`
	RouteCode        string    `json:"route_code"`
	FromCity         string    `json:"from_city"`
	ToCity           string    `json:"to_city"`
	CargoTypeID      int       `json:"cargo_type_id"`
	CargoTypeName    string    `json:"cargo_type_name"`
	Coefficient      float64   `json:"coefficient"`
	TariffID         int       `json:"tariff_id"`
	TariffName       string    `json:"tariff_name"`
	BodyTypeID       int       `json:"body_type_id"`
	BodyTypeName     string    `json:"body_type_name"`
	BasePrice        float64   `json:"base_price"`
	PricePerKm       float64   `json:"price_per_km"`
	MinPrice         float64   `json:"min_price"`
	CargoDescription string    `json:"cargo_description"`
	WeightKg         int       `json:"weight_kg"`
	VolumeM3         float64   `json:"volume_m3"`
	PickupAddress    string    `json:"pickup_address"`
	DeliveryAddress  string    `json:"delivery_address"`
	StartsAt         time.Time `json:"starts_at"`
	EndsAt           time.Time `json:"ends_at"`
	DistanceKm       int       `json:"distance_km"`
	Cost             float64   `json:"cost"`
	Status           string    `json:"status"`
	VehicleID        *int      `json:"vehicle_id"`
	VehiclePlate     *string   `json:"vehicle_plate"`
	VehicleModel     *string   `json:"vehicle_model"`
	DriverID         *int      `json:"driver_id"`
	DriverName       *string   `json:"driver_name"`
	DriverPhone      *string   `json:"driver_phone"`
	CreatedAt        time.Time `json:"created_at"`
	Events           []Event   `json:"events,omitempty"`
}

type Event struct {
	Status    string    `json:"status"`
	Comment   string    `json:"comment"`
	UserLogin *string   `json:"user_login"`
	CreatedAt time.Time `json:"created_at"`
}

const orderSelect = `SELECT o.id, o.client_id, c.name, c.phone, COALESCE(c.inn, ''),
	o.route_id, r.code, fc.name, tc.name,
	o.cargo_type_id, ct.name, ct.coefficient::float8,
	o.tariff_id, t.name, t.body_type_id, b.name, t.base_price::float8, t.price_per_km::float8, t.min_price::float8,
	o.cargo_description, o.weight_kg, o.volume_m3::float8, o.pickup_address, o.delivery_address,
	o.starts_at, o.ends_at, o.distance_km, o.cost::float8, o.status,
	o.vehicle_id, v.reg_number, v.model,
	o.driver_id, d.last_name || ' ' || d.first_name || ' ' || d.middle_name, d.phone,
	o.created_at
	FROM orders o
	JOIN clients c ON c.id = o.client_id
	JOIN routes r ON r.id = o.route_id
	JOIN cities fc ON fc.id = r.from_city_id
	JOIN cities tc ON tc.id = r.to_city_id
	JOIN cargo_types ct ON ct.id = o.cargo_type_id
	JOIN tariffs t ON t.id = o.tariff_id
	JOIN body_types b ON b.id = t.body_type_id
	LEFT JOIN vehicles v ON v.id = o.vehicle_id
	LEFT JOIN drivers d ON d.id = o.driver_id`

func scanOrder(row interface{ Scan(...any) error }) (Order, error) {
	var o Order
	err := row.Scan(&o.ID, &o.ClientID, &o.ClientName, &o.ClientPhone, &o.ClientINN,
		&o.RouteID, &o.RouteCode, &o.FromCity, &o.ToCity,
		&o.CargoTypeID, &o.CargoTypeName, &o.Coefficient,
		&o.TariffID, &o.TariffName, &o.BodyTypeID, &o.BodyTypeName, &o.BasePrice, &o.PricePerKm, &o.MinPrice,
		&o.CargoDescription, &o.WeightKg, &o.VolumeM3, &o.PickupAddress, &o.DeliveryAddress,
		&o.StartsAt, &o.EndsAt, &o.DistanceKm, &o.Cost, &o.Status,
		&o.VehicleID, &o.VehiclePlate, &o.VehicleModel,
		&o.DriverID, &o.DriverName, &o.DriverPhone, &o.CreatedAt)
	return o, err
}

// ownFilter ограничивает выборку собственными заявками клиента или рейсами водителя.
func ownFilter(r *http.Request, where []string, args []any) ([]string, []any) {
	s := sessionFrom(r)
	switch s.Role {
	case RoleClient:
		args = append(args, idOrZero(s.ClientID))
		where = append(where, "o.client_id = $"+itoa(len(args)))
	case RoleDriver:
		args = append(args, idOrZero(s.DriverID))
		where = append(where, "o.driver_id = $"+itoa(len(args)))
	}
	return where, args
}

func idOrZero(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

// listOrders — поиск заявок по клиенту, маршруту, дате, водителю и статусу.
func (s *Server) listOrders(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"TRUE"}
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "?", "$"+itoa(len(args))))
	}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		if n, err := strconv.Atoi(strings.TrimPrefix(v, "№")); err == nil {
			add("(o.id = ? OR c.inn LIKE '%' || ?::text || '%')", n)
		} else {
			add("(lower(c.name) LIKE ? OR lower(o.cargo_description) LIKE ?)", "%"+strings.ToLower(v)+"%")
		}
	}
	intParam := func(name, cond string) {
		if n, err := strconv.Atoi(q.Get(name)); err == nil && n > 0 {
			add(cond, n)
		}
	}
	intParam("client_id", "o.client_id = ?")
	intParam("route_id", "o.route_id = ?")
	intParam("driver_id", "o.driver_id = ?")
	intParam("vehicle_id", "o.vehicle_id = ?")
	intParam("cargo_type_id", "o.cargo_type_id = ?")
	intParam("from_city_id", "r.from_city_id = ?")
	if v := q.Get("status"); v != "" {
		statuses := strings.Split(v, ",")
		add("o.status = ANY(?)", statuses)
	}
	if d, err := time.Parse("2006-01-02", q.Get("date_from")); err == nil {
		add("o.starts_at >= ?", d)
	}
	if d, err := time.Parse("2006-01-02", q.Get("date_to")); err == nil {
		add("o.starts_at < ?", d.AddDate(0, 0, 1))
	}
	where, args = ownFilter(r, where, args)

	from := ` FROM orders o JOIN clients c ON c.id = o.client_id JOIN routes r ON r.id = o.route_id`
	cond := " WHERE " + strings.Join(where, " AND ")
	var res page[Order]
	var sum float64
	if err := s.db.QueryRow(r.Context(), `SELECT count(*), COALESCE(sum(o.cost), 0)::float8`+from+cond, args...).
		Scan(&res.Total, &sum); err != nil {
		writeErr(w, err)
		return
	}
	order := " ORDER BY o.starts_at DESC, o.id DESC"
	if q.Get("sort") == "asc" {
		order = " ORDER BY o.starts_at, o.id"
	}
	limit, offset := pageParams(r)
	args = append(args, limit, offset)
	rows, err := s.db.Query(r.Context(), orderSelect+cond+order+
		" LIMIT $"+itoa(len(args)-1)+" OFFSET $"+itoa(len(args)), args...)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer rows.Close()
	res.Items = []Order{}
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			writeErr(w, err)
			return
		}
		res.Items = append(res.Items, o)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": res.Items, "total": res.Total, "sum": sum})
}

// loadOrder читает заявку с проверкой права доступа.
func (s *Server) loadOrder(ctx context.Context, r *http.Request, id int) (Order, error) {
	where, args := ownFilter(r, []string{"o.id = $1"}, []any{id})
	o, err := scanOrder(s.db.QueryRow(ctx, orderSelect+" WHERE "+strings.Join(where, " AND "), args...))
	if err != nil {
		return o, err
	}
	rows, err := s.db.Query(ctx, `SELECT e.status, e.comment, u.login, e.created_at
		FROM order_events e LEFT JOIN users u ON u.id = e.user_id
		WHERE e.order_id = $1 ORDER BY e.created_at, e.id`, id)
	if err != nil {
		return o, err
	}
	defer rows.Close()
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.Status, &e.Comment, &e.UserLogin, &e.CreatedAt); err != nil {
			return o, err
		}
		o.Events = append(o.Events, e)
	}
	return o, rows.Err()
}

func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	o, err := s.loadOrder(r.Context(), r, id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

type orderInput struct {
	ClientID         int     `json:"client_id"`
	RouteID          int     `json:"route_id"`
	CargoTypeID      int     `json:"cargo_type_id"`
	BodyTypeID       int     `json:"body_type_id"`
	CargoDescription string  `json:"cargo_description"`
	WeightKg         int     `json:"weight_kg"`
	VolumeM3         float64 `json:"volume_m3"`
	PickupAddress    string  `json:"pickup_address"`
	DeliveryAddress  string  `json:"delivery_address"`
	StartsAt         string  `json:"starts_at"`
}

// validateOrder проверяет параметры заявки и рассчитывает стоимость.
func (s *Server) validateOrder(ctx context.Context, in *orderInput) (Quote, time.Time, error) {
	f := fieldErrors{}
	if in.ClientID <= 0 {
		f.add("client_id", "Выберите клиента")
	}
	if in.WeightKg < 1 || in.WeightKg > 50000 {
		f.add("weight_kg", "Масса груза от 1 до 50 000 кг")
	}
	if in.VolumeM3 <= 0 || in.VolumeM3 > 120 {
		f.add("volume_m3", "Объём груза от 0,1 до 120 м³")
	}
	in.CargoDescription = strings.TrimSpace(in.CargoDescription)
	f.required("cargo_description", in.CargoDescription, "Описание груза")
	f.maxLen("cargo_description", in.CargoDescription, 255)
	f.required("pickup_address", in.PickupAddress, "Адрес погрузки")
	f.required("delivery_address", in.DeliveryAddress, "Адрес выгрузки")
	startsAt, err := time.Parse(time.RFC3339, in.StartsAt)
	switch {
	case err != nil:
		f.add("starts_at", "Укажите дату и время погрузки")
	case startsAt.Before(s.now().Add(-5 * time.Minute)):
		f.add("starts_at", "Дата погрузки не может быть в прошлом")
	case startsAt.After(s.now().AddDate(0, 6, 0)):
		f.add("starts_at", "Заявки принимаются не более чем на 6 месяцев вперёд")
	}
	if err := f.err(); err != nil {
		return Quote{}, startsAt, err
	}
	q, err := s.buildQuote(ctx, quoteRequest{RouteID: in.RouteID, CargoTypeID: in.CargoTypeID, BodyTypeID: in.BodyTypeID})
	if err != nil {
		return q, startsAt, err
	}
	// Проверка, что в парке есть транспорт подходящего кузова и грузоподъёмности.
	var fits bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM vehicles WHERE body_type_id = $1
		AND status = 'active' AND capacity_kg >= $2 AND volume_m3 >= $3)`,
		q.BodyTypeID, in.WeightKg, in.VolumeM3).Scan(&fits); err != nil {
		return q, startsAt, err
	}
	if !fits {
		return q, startsAt, badRequest("Нет транспорта для такого груза", map[string]string{
			"weight_kg": "В парке нет кузова «" + q.BodyTypeName + "» такой грузоподъёмности и объёма"})
	}
	return q, startsAt, nil
}

// createOrder — оформление заявки на перевозку с расчётом стоимости.
func (s *Server) createOrder(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	var in orderInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if sess.Role == RoleClient {
		in.ClientID = idOrZero(sess.ClientID)
	}
	ctx := r.Context()
	q, startsAt, err := s.validateOrder(ctx, &in)
	if err != nil {
		writeErr(w, err)
		return
	}
	endsAt := startsAt.Add(time.Duration(q.DurationHours * float64(time.Hour)))

	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer tx.Rollback(ctx)
	var id int
	err = tx.QueryRow(ctx, `INSERT INTO orders (client_id, route_id, cargo_type_id, tariff_id,
		cargo_description, weight_kg, volume_m3, pickup_address, delivery_address,
		starts_at, ends_at, distance_km, cost, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
		in.ClientID, q.RouteID, q.CargoTypeID, q.TariffID, in.CargoDescription, in.WeightKg, in.VolumeM3,
		strings.TrimSpace(in.PickupAddress), strings.TrimSpace(in.DeliveryAddress),
		startsAt, endsAt, q.DistanceKm, q.Total, sess.UserID).Scan(&id)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := addEvent(ctx, tx, id, StatusNew, "Заявка оформлена", sess.UserID); err != nil {
		writeErr(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(ctx, "stats", "routes")
	o, err := s.loadOrder(ctx, r, id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, o)
}

// updateOrder — редактирование заявки, пока транспорт не назначен.
func (s *Server) updateOrder(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var in orderInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	ctx := r.Context()
	q, startsAt, err := s.validateOrder(ctx, &in)
	if err != nil {
		writeErr(w, err)
		return
	}
	endsAt := startsAt.Add(time.Duration(q.DurationHours * float64(time.Hour)))
	tag, err := s.db.Exec(ctx, `UPDATE orders SET client_id = $1, route_id = $2, cargo_type_id = $3,
		tariff_id = $4, cargo_description = $5, weight_kg = $6, volume_m3 = $7, pickup_address = $8,
		delivery_address = $9, starts_at = $10, ends_at = $11, distance_km = $12, cost = $13
		WHERE id = $14 AND status = 'new'`,
		in.ClientID, q.RouteID, q.CargoTypeID, q.TariffID, in.CargoDescription, in.WeightKg, in.VolumeM3,
		strings.TrimSpace(in.PickupAddress), strings.TrimSpace(in.DeliveryAddress),
		startsAt, endsAt, q.DistanceKm, q.Total, id)
	if err == nil && tag.RowsAffected() == 0 {
		err = conflict("Изменять можно только новую заявку, для которой не назначен транспорт")
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(ctx, "stats")
	w.WriteHeader(http.StatusNoContent)
}

// deleteOrder удаляет новую или отменённую заявку.
func (s *Server) deleteOrder(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM orders WHERE id = $1 AND status IN ('new', 'cancelled')`, id)
	if err == nil && tag.RowsAffected() == 0 {
		err = conflict("Удалить можно только новую или отменённую заявку")
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(r.Context(), "stats", "routes")
	w.WriteHeader(http.StatusNoContent)
}

func addEvent(ctx context.Context, tx pgx.Tx, orderID int, status, comment string, userID int) error {
	_, err := tx.Exec(ctx, `INSERT INTO order_events (order_id, status, comment, user_id)
		VALUES ($1, $2, $3, $4)`, orderID, status, comment, userID)
	return err
}

// transitions — допустимые переходы статусов заявки.
var transitions = map[string][]string{
	StatusNew:       {StatusCancelled},
	StatusAssigned:  {StatusInTransit, StatusNew, StatusCancelled},
	StatusInTransit: {StatusDelivered},
}

type statusRequest struct {
	Status  string `json:"status"`
	Comment string `json:"comment"`
}

// changeStatus меняет статус заявки с проверкой допустимости перехода и прав роли.
func (s *Server) changeStatus(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var req statusRequest
	if err := readJSON(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	sess := sessionFrom(r)
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer tx.Rollback(ctx)

	var cur string
	var clientID int
	var driverID *int
	var startsAt time.Time
	if err := tx.QueryRow(ctx, `SELECT status, client_id, driver_id, starts_at FROM orders
		WHERE id = $1 FOR UPDATE`, id).Scan(&cur, &clientID, &driverID, &startsAt); err != nil {
		writeErr(w, err)
		return
	}
	allowed := false
	for _, st := range transitions[cur] {
		if st == req.Status {
			allowed = true
		}
	}
	if !allowed {
		writeErr(w, conflict("Недопустимая смена статуса заявки"))
		return
	}
	switch sess.Role {
	case RoleClient:
		if idOrZero(sess.ClientID) != clientID || req.Status != StatusCancelled || cur != StatusNew {
			writeErr(w, &apiError{Status: http.StatusForbidden,
				Message: "Клиент может отменить только свою заявку до назначения транспорта"})
			return
		}
	case RoleDriver:
		if driverID == nil || idOrZero(sess.DriverID) != *driverID ||
			(req.Status != StatusInTransit && req.Status != StatusDelivered) {
			writeErr(w, &apiError{Status: http.StatusForbidden,
				Message: "Водитель может отмечать только выполнение своих рейсов"})
			return
		}
	}
	if req.Status == StatusInTransit && startsAt.After(s.now().Add(24*time.Hour)) {
		writeErr(w, conflict("Рейс можно начать не ранее чем за сутки до погрузки"))
		return
	}

	query := `UPDATE orders SET status = $1 WHERE id = $2`
	if req.Status == StatusNew { // снятие назначения
		query = `UPDATE orders SET status = $1, vehicle_id = NULL, driver_id = NULL WHERE id = $2`
	}
	if _, err := tx.Exec(ctx, query, req.Status, id); err != nil {
		writeErr(w, err)
		return
	}
	comment := strings.TrimSpace(req.Comment)
	if comment == "" {
		comment = map[string]string{
			StatusNew: "Назначение транспорта снято", StatusCancelled: "Заявка отменена",
			StatusInTransit: "Груз принят, рейс начат", StatusDelivered: "Груз доставлен получателю",
		}[req.Status]
	}
	if err := addEvent(ctx, tx, id, req.Status, comment, sess.UserID); err != nil {
		writeErr(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(ctx, "stats")
	w.WriteHeader(http.StatusNoContent)
}
