package httpapi

import (
	"context"
	"log"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// SeedDemo создаёт демонстрационные учётные записи и заявки,
// если в базе ещё нет пользователей.
func (s *Server) SeedDemo(ctx context.Context) error {
	var n int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&n); err != nil || n > 0 {
		return err
	}
	users := []struct {
		login, password, role string
		driverID, clientID    int
	}{
		{"admin", "Admin123!", RoleAdmin, 0, 0},
		{"dispatcher", "Demo123!", RoleDispatcher, 0, 0},
		{"sokolov", "Demo123!", RoleDriver, 1, 0},
		{"kuznetsov", "Demo123!", RoleDriver, 2, 0},
		{"belov", "Demo123!", RoleDriver, 3, 0},
		{"uralsk", "Demo123!", RoleClient, 0, 1},
	}
	userIDs := map[string]int{}
	for _, u := range users {
		hash, err := bcrypt.GenerateFromPassword([]byte(u.password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		var id int
		if err := s.db.QueryRow(ctx, `INSERT INTO users (login, password_hash, role_id)
			VALUES ($1, $2, (SELECT id FROM roles WHERE code = $3)) RETURNING id`,
			u.login, string(hash), u.role).Scan(&id); err != nil {
			return err
		}
		userIDs[u.login] = id
		if u.driverID > 0 {
			s.db.Exec(ctx, `UPDATE drivers SET user_id = $1 WHERE id = $2`, id, u.driverID)
		}
		if u.clientID > 0 {
			s.db.Exec(ctx, `UPDATE clients SET user_id = $1 WHERE id = $2`, id, u.clientID)
		}
	}
	if err := s.seedOrders(ctx, userIDs["dispatcher"]); err != nil {
		return err
	}
	log.Println("созданы демонстрационные данные")
	return nil
}

type demoOrder struct {
	day, hour            int
	client, route, cargo int
	body, weight         int
	volume               float64
	desc                 string
	status               string
	vehicle, driver      int
}

func (s *Server) seedOrders(ctx context.Context, dispatcherID int) error {
	loc, err := time.LoadLocation("Asia/Yekaterinburg")
	if err != nil {
		loc = time.FixedZone("UTC+5", 5*3600)
	}
	now := s.now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	D, A, T, N, C := StatusDelivered, StatusAssigned, StatusInTransit, StatusNew, StatusCancelled
	orders := []demoOrder{
		{-21, 8, 1, 3, 5, 1, 14000, 50, "Кирпич облицовочный на поддонах", D, 1, 1},
		{-19, 7, 2, 4, 2, 3, 3500, 26, "Мясная продукция в упаковке", D, 4, 3},
		{-18, 9, 3, 9, 6, 4, 4200, 20, "Металлоконструкции каркаса", D, 5, 5},
		{-16, 6, 4, 5, 3, 2, 7000, 32, "Вакцины, режим +2…+8 °C", D, 3, 2},
		{-15, 10, 7, 4, 1, 1, 9000, 45, "Запчасти для спецтехники", D, 2, 4},
		{-13, 8, 1, 1, 5, 4, 4000, 16, "Арматура и профнастил", D, 5, 3},
		{-12, 7, 5, 2, 8, 5, 700, 10, "Мебель и коробки (переезд)", D, 7, 6},
		{-11, 6, 2, 6, 2, 3, 3800, 24, "Колбасные изделия", D, 8, 5},
		{-9, 5, 3, 8, 1, 1, 18000, 76, "Металлопрокат в бухтах", D, 1, 1},
		{-8, 9, 4, 3, 3, 2, 6000, 28, "Лекарственные препараты", D, 3, 2},
		{-7, 8, 6, 2, 4, 5, 350, 6, "Посуда и бытовая техника", D, 7, 6},
		{-6, 10, 7, 11, 1, 1, 12000, 55, "Оборудование в ящиках", D, 2, 4},
		{-5, 7, 1, 3, 5, 1, 16000, 60, "Сухие смеси на паллетах", D, 1, 1},
		{-4, 8, 2, 1, 2, 3, 2500, 18, "Хлебобулочные изделия", D, 4, 3},
		{-3, 6, 3, 10, 6, 4, 4400, 21, "Трубы стальные большого диаметра", D, 5, 5},
		{-2, 9, 4, 5, 3, 2, 5500, 25, "Медицинские препараты", D, 3, 2},
		{-2, 12, 6, 1, 8, 5, 400, 7, "Мебель (заказ отменён клиентом)", C, 0, 0},
		{-1, 8, 7, 4, 1, 1, 8000, 40, "Электротехническая продукция", D, 2, 4},
		{0, 8, 1, 3, 5, 1, 12000, 40, "Сухие строительные смеси на паллетах", T, 1, 1},
		{0, 9, 2, 1, 2, 3, 3000, 20, "Молочная продукция", T, 4, 3},
		{0, 14, 3, 6, 6, 4, 4000, 18, "Металлоконструкции", A, 5, 5},
		{0, 16, 5, 2, 8, 5, 600, 9, "Мебель (переезд)", N, 0, 0},
		{1, 7, 4, 5, 3, 2, 8000, 30, "Лекарственные препараты, +2…+8 °C", A, 3, 2},
		{1, 10, 7, 4, 1, 1, 15000, 70, "Оборудование в коробках", N, 0, 0},
		{1, 13, 1, 1, 5, 4, 3500, 15, "Пиломатериал обрезной", N, 0, 0},
		{2, 8, 6, 2, 4, 5, 300, 5, "Посуда и стекло", N, 0, 0},
		{2, 9, 2, 7, 2, 3, 3500, 25, "Овощи свежие", A, 8, 5},
		{3, 6, 3, 8, 7, 1, 18000, 60, "Лакокрасочные материалы (класс 3)", N, 0, 0},
		{3, 11, 1, 3, 1, 1, 10000, 45, "Сантехника в упаковке", A, 2, 4},
		{4, 8, 7, 11, 1, 1, 6000, 30, "Строительный инструмент", N, 0, 0},
		{5, 9, 4, 12, 3, 2, 5000, 20, "Фармацевтическая продукция", N, 0, 0},
		{6, 10, 5, 3, 8, 5, 900, 12, "Бытовая техника", N, 0, 0},
	}
	for _, d := range orders {
		q, err := s.buildQuote(ctx, quoteRequest{RouteID: d.route, CargoTypeID: d.cargo, BodyTypeID: d.body})
		if err != nil {
			return err
		}
		start := today.AddDate(0, 0, d.day).Add(time.Duration(d.hour) * time.Hour)
		end := start.Add(time.Duration(q.DurationHours * float64(time.Hour)))
		var vehicle, driver any
		if d.vehicle > 0 {
			vehicle, driver = d.vehicle, d.driver
		}
		var addr1, addr2 string
		_ = s.db.QueryRow(ctx, `SELECT 'г. ' || f.name || ', промзона, склад ' || ($2 % 9 + 1),
			'г. ' || t.name || ', ул. Складская, д. ' || ($2 % 40 + 2)
			FROM routes r JOIN cities f ON f.id = r.from_city_id JOIN cities t ON t.id = r.to_city_id
			WHERE r.id = $1`, d.route, d.weight/100+d.hour).Scan(&addr1, &addr2)
		// Дата оформления — за сутки с лишним до погрузки, но не позже текущего момента.
		created := start.Add(-time.Duration(30+d.hour) * time.Hour)
		if created.After(now.Add(-2 * time.Hour)) {
			created = now.Add(-time.Duration(2+d.hour%5) * time.Hour)
		}
		assignedAt := created.Add(time.Hour)
		var id int
		if err := s.db.QueryRow(ctx, `INSERT INTO orders (client_id, route_id, cargo_type_id, tariff_id,
			cargo_description, weight_kg, volume_m3, pickup_address, delivery_address, starts_at, ends_at,
			distance_km, cost, status, vehicle_id, driver_id, created_by, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
			d.client, d.route, d.cargo, q.TariffID, d.desc, d.weight, d.volume, addr1, addr2, start, end,
			q.DistanceKm, q.Total, d.status, vehicle, driver, dispatcherID, created).Scan(&id); err != nil {
			return err
		}
		events := []struct {
			st, c string
			at    time.Time
		}{{StatusNew, "Заявка оформлена", created}}
		if d.vehicle > 0 {
			events = append(events, struct {
				st, c string
				at    time.Time
			}{StatusAssigned, "Назначены транспорт и водитель", assignedAt})
		}
		if d.status == T || d.status == D {
			events = append(events, struct {
				st, c string
				at    time.Time
			}{T, "Груз принят, рейс начат", start.Add(20 * time.Minute)})
		}
		if d.status == D {
			events = append(events, struct {
				st, c string
				at    time.Time
			}{D, "Груз доставлен получателю", end.Add(-15 * time.Minute)})
		}
		if d.status == C {
			events = append(events, struct {
				st, c string
				at    time.Time
			}{C, "Отменена по просьбе клиента", assignedAt})
		}
		for _, e := range events {
			if _, err := s.db.Exec(ctx, `INSERT INTO order_events (order_id, status, comment, user_id, created_at)
				VALUES ($1, $2, $3, $4, $5)`, id, e.st, e.c, dispatcherID, e.at); err != nil {
				return err
			}
		}
	}
	return nil
}
