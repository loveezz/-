package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"
)

const refTTL = 10 * time.Minute

type BodyType struct {
	ID   int    `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type CargoType struct {
	ID           int     `json:"id"`
	Code         string  `json:"code"`
	Name         string  `json:"name"`
	Coefficient  float64 `json:"coefficient"`
	BodyTypeID   *int    `json:"body_type_id"`
	BodyTypeName string  `json:"body_type_name"`
	Description  string  `json:"description"`
}

type Tariff struct {
	ID           int     `json:"id"`
	Name         string  `json:"name"`
	BodyTypeID   int     `json:"body_type_id"`
	BodyTypeName string  `json:"body_type_name"`
	BasePrice    float64 `json:"base_price"`
	PricePerKm   float64 `json:"price_per_km"`
	MinPrice     float64 `json:"min_price"`
	IsActive     bool    `json:"is_active"`
}

type City struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Region string `json:"region"`
}

type Route struct {
	ID            int     `json:"id"`
	Code          string  `json:"code"`
	FromCityID    int     `json:"from_city_id"`
	FromCity      string  `json:"from_city"`
	ToCityID      int     `json:"to_city_id"`
	ToCity        string  `json:"to_city"`
	DistanceKm    int     `json:"distance_km"`
	DurationHours float64 `json:"duration_hours"`
	IsActive      bool    `json:"is_active"`
	OrdersCount   int     `json:"orders_count"`
}

// cached возвращает справочник из кэша Redis или загружает его из БД.
func cached[T any](ctx context.Context, s *Server, name string, load func() ([]T, error)) ([]T, error) {
	var items []T
	if s.cache.GetJSON(ctx, name, &items) {
		return items, nil
	}
	items, err := load()
	if err != nil {
		return nil, err
	}
	s.cache.SetJSON(ctx, name, items, refTTL)
	return items, nil
}

func queryList[T any](ctx context.Context, s *Server, sql string, scan func(row interface{ Scan(...any) error }, t *T) error, args ...any) ([]T, error) {
	rows, err := s.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []T{}
	for rows.Next() {
		var t T
		if err := scan(rows, &t); err != nil {
			return nil, err
		}
		items = append(items, t)
	}
	return items, rows.Err()
}

func respond[T any](w http.ResponseWriter, items []T, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) listBodyTypes(w http.ResponseWriter, r *http.Request) {
	items, err := cached(r.Context(), s, "body_types", func() ([]BodyType, error) {
		return queryList(r.Context(), s, `SELECT id, code, name FROM body_types ORDER BY name`,
			func(row interface{ Scan(...any) error }, b *BodyType) error {
				return row.Scan(&b.ID, &b.Code, &b.Name)
			})
	})
	respond(w, items, err)
}

func (s *Server) loadCargoTypes(ctx context.Context) ([]CargoType, error) {
	return cached(ctx, s, "cargo_types", func() ([]CargoType, error) {
		return queryList(ctx, s, `SELECT c.id, c.code, c.name, c.coefficient::float8, c.body_type_id,
			COALESCE(b.name, ''), c.description
			FROM cargo_types c LEFT JOIN body_types b ON b.id = c.body_type_id ORDER BY c.coefficient, c.name`,
			func(row interface{ Scan(...any) error }, c *CargoType) error {
				return row.Scan(&c.ID, &c.Code, &c.Name, &c.Coefficient, &c.BodyTypeID, &c.BodyTypeName, &c.Description)
			})
	})
}

func (s *Server) listCargoTypes(w http.ResponseWriter, r *http.Request) {
	items, err := s.loadCargoTypes(r.Context())
	respond(w, items, err)
}

func (s *Server) saveCargoType(w http.ResponseWriter, r *http.Request) {
	var in CargoType
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	f.required("code", in.Code, "Код")
	f.required("name", in.Name, "Название")
	if in.Coefficient < 0.5 || in.Coefficient > 5 {
		f.add("coefficient", "Коэффициент от 0,5 до 5")
	}
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	var err error
	if r.PathValue("id") == "" {
		_, err = s.db.Exec(r.Context(), `INSERT INTO cargo_types (code, name, coefficient, body_type_id, description)
			VALUES ($1, $2, $3, $4, $5)`, strings.ToUpper(strings.TrimSpace(in.Code)), strings.TrimSpace(in.Name),
			in.Coefficient, in.BodyTypeID, in.Description)
	} else {
		id, perr := pathID(r)
		if perr != nil {
			writeErr(w, perr)
			return
		}
		_, err = s.db.Exec(r.Context(), `UPDATE cargo_types SET code = $1, name = $2, coefficient = $3,
			body_type_id = $4, description = $5 WHERE id = $6`, strings.ToUpper(strings.TrimSpace(in.Code)),
			strings.TrimSpace(in.Name), in.Coefficient, in.BodyTypeID, in.Description, id)
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(r.Context(), "cargo_types")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) loadTariffs(ctx context.Context) ([]Tariff, error) {
	return cached(ctx, s, "tariffs", func() ([]Tariff, error) {
		return queryList(ctx, s, `SELECT t.id, t.name, t.body_type_id, b.name, t.base_price::float8,
			t.price_per_km::float8, t.min_price::float8, t.is_active
			FROM tariffs t JOIN body_types b ON b.id = t.body_type_id ORDER BY t.is_active DESC, t.price_per_km`,
			func(row interface{ Scan(...any) error }, t *Tariff) error {
				return row.Scan(&t.ID, &t.Name, &t.BodyTypeID, &t.BodyTypeName, &t.BasePrice,
					&t.PricePerKm, &t.MinPrice, &t.IsActive)
			})
	})
}

func (s *Server) listTariffs(w http.ResponseWriter, r *http.Request) {
	items, err := s.loadTariffs(r.Context())
	respond(w, items, err)
}

func (s *Server) saveTariff(w http.ResponseWriter, r *http.Request) {
	var in Tariff
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	f.required("name", in.Name, "Название")
	if in.BodyTypeID <= 0 {
		f.add("body_type_id", "Выберите тип кузова")
	}
	if in.PricePerKm <= 0 {
		f.add("price_per_km", "Цена за километр должна быть больше нуля")
	}
	if in.BasePrice < 0 {
		f.add("base_price", "Значение не может быть отрицательным")
	}
	if in.MinPrice < 0 {
		f.add("min_price", "Значение не может быть отрицательным")
	}
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	var err error
	if r.PathValue("id") == "" {
		_, err = s.db.Exec(r.Context(), `INSERT INTO tariffs (name, body_type_id, base_price, price_per_km, min_price, is_active)
			VALUES ($1, $2, $3, $4, $5, $6)`, strings.TrimSpace(in.Name), in.BodyTypeID, in.BasePrice,
			in.PricePerKm, in.MinPrice, in.IsActive)
	} else {
		id, perr := pathID(r)
		if perr != nil {
			writeErr(w, perr)
			return
		}
		_, err = s.db.Exec(r.Context(), `UPDATE tariffs SET name = $1, body_type_id = $2, base_price = $3,
			price_per_km = $4, min_price = $5, is_active = $6 WHERE id = $7`, strings.TrimSpace(in.Name),
			in.BodyTypeID, in.BasePrice, in.PricePerKm, in.MinPrice, in.IsActive, id)
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(r.Context(), "tariffs")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listCities(w http.ResponseWriter, r *http.Request) {
	items, err := cached(r.Context(), s, "cities", func() ([]City, error) {
		return queryList(r.Context(), s, `SELECT id, name, region FROM cities ORDER BY name`,
			func(row interface{ Scan(...any) error }, c *City) error {
				return row.Scan(&c.ID, &c.Name, &c.Region)
			})
	})
	respond(w, items, err)
}

func (s *Server) saveCity(w http.ResponseWriter, r *http.Request) {
	var in City
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	f.required("name", in.Name, "Название")
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	if _, err := s.db.Exec(r.Context(), `INSERT INTO cities (name, region) VALUES ($1, $2)`,
		strings.TrimSpace(in.Name), strings.TrimSpace(in.Region)); err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(r.Context(), "cities")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) loadRoutes(ctx context.Context) ([]Route, error) {
	return cached(ctx, s, "routes", func() ([]Route, error) {
		return queryList(ctx, s, `SELECT r.id, r.code, r.from_city_id, f.name, r.to_city_id, t.name,
			r.distance_km, r.duration_hours::float8, r.is_active,
			(SELECT count(*) FROM orders o WHERE o.route_id = r.id)
			FROM routes r JOIN cities f ON f.id = r.from_city_id JOIN cities t ON t.id = r.to_city_id
			ORDER BY f.name, r.distance_km`,
			func(row interface{ Scan(...any) error }, x *Route) error {
				return row.Scan(&x.ID, &x.Code, &x.FromCityID, &x.FromCity, &x.ToCityID, &x.ToCity,
					&x.DistanceKm, &x.DurationHours, &x.IsActive, &x.OrdersCount)
			})
	})
}

func (s *Server) listRoutes(w http.ResponseWriter, r *http.Request) {
	items, err := s.loadRoutes(r.Context())
	respond(w, items, err)
}

func (s *Server) saveRoute(w http.ResponseWriter, r *http.Request) {
	var in Route
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	f.required("code", in.Code, "Код маршрута")
	if in.FromCityID <= 0 {
		f.add("from_city_id", "Выберите пункт отправления")
	}
	if in.ToCityID <= 0 {
		f.add("to_city_id", "Выберите пункт назначения")
	}
	if in.FromCityID == in.ToCityID && in.FromCityID > 0 {
		f.add("to_city_id", "Пункты отправления и назначения должны различаться")
	}
	if in.DistanceKm < 1 || in.DistanceKm > 10000 {
		f.add("distance_km", "Расстояние от 1 до 10 000 км")
	}
	if in.DurationHours <= 0 || in.DurationHours > 500 {
		f.add("duration_hours", "Укажите время в пути в часах")
	}
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(in.Code))
	var err error
	if r.PathValue("id") == "" {
		_, err = s.db.Exec(r.Context(), `INSERT INTO routes (code, from_city_id, to_city_id, distance_km, duration_hours, is_active)
			VALUES ($1, $2, $3, $4, $5, TRUE)`, code, in.FromCityID, in.ToCityID, in.DistanceKm, in.DurationHours)
	} else {
		id, perr := pathID(r)
		if perr != nil {
			writeErr(w, perr)
			return
		}
		_, err = s.db.Exec(r.Context(), `UPDATE routes SET code = $1, from_city_id = $2, to_city_id = $3,
			distance_km = $4, duration_hours = $5, is_active = $6 WHERE id = $7`,
			code, in.FromCityID, in.ToCityID, in.DistanceKm, in.DurationHours, in.IsActive, id)
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(r.Context(), "routes")
	w.WriteHeader(http.StatusNoContent)
}

// deleteRef удаляет запись справочника. Если на неё ссылаются другие
// данные, СУБД отклонит удаление (ошибка внешнего ключа преобразуется в 409).
func (s *Server) deleteRef(table string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			writeErr(w, err)
			return
		}
		tag, err := s.db.Exec(r.Context(), `DELETE FROM `+table+` WHERE id = $1`, id)
		if err == nil && tag.RowsAffected() == 0 {
			err = errNotFound
		}
		if err != nil {
			writeErr(w, err)
			return
		}
		s.cache.Invalidate(r.Context(), table, "stats")
		w.WriteHeader(http.StatusNoContent)
	}
}
