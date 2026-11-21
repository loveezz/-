package httpapi

import (
	"net/http"
	"strconv"
	"time"
)

type DayLoad struct {
	Date   string `json:"date"`
	Orders int    `json:"orders"`
}

type NamedCount struct {
	Name  string  `json:"name"`
	Count int     `json:"count"`
	Sum   float64 `json:"sum"`
}

type Stats struct {
	OrdersToday    int          `json:"orders_today"`
	AwaitingAssign int          `json:"awaiting_assign"`
	InTransit      int          `json:"in_transit"`
	DeliveredMonth int          `json:"delivered_month"`
	RevenueMonth   float64      `json:"revenue_month"`
	KmMonth        int          `json:"km_month"`
	VehiclesOnLine int          `json:"vehicles_on_line"`
	VehiclesTotal  int          `json:"vehicles_total"`
	Week           []DayLoad    `json:"week"`
	ByStatus       []NamedCount `json:"by_status"`
	TopRoutes      []NamedCount `json:"top_routes"`
	ByCargo        []NamedCount `json:"by_cargo"`
}

// stats — показатели для главной страницы. Для водителя и клиента
// считаются только собственные рейсы и заявки. Результат кэшируется в Redis на минуту.
func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	ctx := r.Context()
	scope, arg := "TRUE", 0
	key := "stats:all"
	switch sess.Role {
	case RoleDriver:
		scope, arg = "o.driver_id = $1", idOrZero(sess.DriverID)
		key = "stats:driver:" + strconv.Itoa(arg)
	case RoleClient:
		scope, arg = "o.client_id = $1", idOrZero(sess.ClientID)
		key = "stats:client:" + strconv.Itoa(arg)
	}
	var st Stats
	if s.cache.GetJSON(ctx, key, &st) {
		writeJSON(w, http.StatusOK, st)
		return
	}
	args := []any{}
	if arg != 0 || scope != "TRUE" {
		args = append(args, arg)
	}
	loc, _ := time.LoadLocation("Asia/Yekaterinburg")
	if loc == nil {
		loc = time.Local
	}
	now := s.now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	p := func(n int) string { return "$" + strconv.Itoa(len(args)+n) }

	err := s.db.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE o.starts_at >= `+p(1)+` AND o.starts_at < `+p(1)+` + interval '1 day' AND o.status <> 'cancelled'),
		count(*) FILTER (WHERE o.status = 'new'),
		count(*) FILTER (WHERE o.status = 'in_transit'),
		count(*) FILTER (WHERE o.status = 'delivered' AND o.starts_at >= `+p(2)+`),
		COALESCE(sum(o.cost) FILTER (WHERE o.status = 'delivered' AND o.starts_at >= `+p(2)+`), 0)::float8,
		COALESCE(sum(o.distance_km) FILTER (WHERE o.status = 'delivered' AND o.starts_at >= `+p(2)+`), 0)
		FROM orders o WHERE `+scope, append(args, today, month)...).
		Scan(&st.OrdersToday, &st.AwaitingAssign, &st.InTransit, &st.DeliveredMonth, &st.RevenueMonth, &st.KmMonth)
	if err != nil {
		writeErr(w, err)
		return
	}
	_ = s.db.QueryRow(ctx, `SELECT count(*) FILTER (WHERE status = 'active'), count(*) FROM vehicles`).
		Scan(&st.VehiclesOnLine, &st.VehiclesTotal)

	// Загрузка по дням на неделю вперёд
	rows, err := s.db.Query(ctx, `SELECT to_char(d, 'YYYY-MM-DD'),
		(SELECT count(*) FROM orders o WHERE `+scope+` AND o.status <> 'cancelled'
		   AND o.starts_at >= d AND o.starts_at < d + interval '1 day')
		FROM generate_series(`+p(1)+`::timestamptz, `+p(1)+`::timestamptz + interval '6 days', interval '1 day') d`,
		append(args, today)...)
	if err != nil {
		writeErr(w, err)
		return
	}
	for rows.Next() {
		var d DayLoad
		if err := rows.Scan(&d.Date, &d.Orders); err == nil {
			st.Week = append(st.Week, d)
		}
	}
	rows.Close()

	named := func(sql string) []NamedCount {
		res := []NamedCount{}
		rows, err := s.db.Query(ctx, sql, args...)
		if err != nil {
			return res
		}
		defer rows.Close()
		for rows.Next() {
			var n NamedCount
			if rows.Scan(&n.Name, &n.Count, &n.Sum) == nil {
				res = append(res, n)
			}
		}
		return res
	}
	st.ByStatus = named(`SELECT o.status, count(*), COALESCE(sum(o.cost), 0)::float8 FROM orders o
		WHERE ` + scope + ` GROUP BY o.status`)
	st.TopRoutes = named(`SELECT fc.name || ' — ' || tc.name, count(*), COALESCE(sum(o.cost), 0)::float8
		FROM orders o JOIN routes r ON r.id = o.route_id
		JOIN cities fc ON fc.id = r.from_city_id JOIN cities tc ON tc.id = r.to_city_id
		WHERE ` + scope + ` AND o.status <> 'cancelled'
		GROUP BY fc.name, tc.name ORDER BY count(*) DESC, 1 LIMIT 5`)
	st.ByCargo = named(`SELECT ct.name, count(*), COALESCE(sum(o.cost), 0)::float8
		FROM orders o JOIN cargo_types ct ON ct.id = o.cargo_type_id
		WHERE ` + scope + ` AND o.status <> 'cancelled' GROUP BY ct.name ORDER BY count(*) DESC LIMIT 5`)

	s.cache.SetJSON(ctx, key, st, time.Minute)
	writeJSON(w, http.StatusOK, st)
}
