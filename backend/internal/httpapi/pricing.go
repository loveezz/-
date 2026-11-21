package httpapi

import (
	"context"
	"errors"
	"math"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// Quote — расчёт стоимости перевозки с расшифровкой.
type Quote struct {
	RouteID       int     `json:"route_id"`
	RouteName     string  `json:"route_name"`
	DistanceKm    int     `json:"distance_km"`
	DurationHours float64 `json:"duration_hours"`
	CargoTypeID   int     `json:"cargo_type_id"`
	CargoTypeName string  `json:"cargo_type_name"`
	Coefficient   float64 `json:"coefficient"`
	BodyTypeID    int     `json:"body_type_id"`
	BodyTypeName  string  `json:"body_type_name"`
	TariffID      int     `json:"tariff_id"`
	TariffName    string  `json:"tariff_name"`
	BasePrice     float64 `json:"base_price"`
	PricePerKm    float64 `json:"price_per_km"`
	MinPrice      float64 `json:"min_price"`
	DistanceCost  float64 `json:"distance_cost"`
	Subtotal      float64 `json:"subtotal"`
	Total         float64 `json:"total"`
	MinApplied    bool    `json:"min_applied"`
}

// CalcCost рассчитывает стоимость перевозки:
//
//	C = max(Cmin, (Cбаз + L · Cкм) · Kгр),
//
// где L — расстояние маршрута, Cбаз — подача машины, Cкм — цена километра
// по тарифу типа кузова, Kгр — коэффициент типа груза, Cmin — минимальная
// стоимость заказа. Результат округляется до рубля.
func CalcCost(basePrice, pricePerKm, minPrice float64, distanceKm int, coefficient float64) (distanceCost, subtotal, total float64, minApplied bool) {
	distanceCost = float64(distanceKm) * pricePerKm
	subtotal = math.Round((basePrice+distanceCost)*coefficient*100) / 100
	total = math.Round(subtotal)
	if total < minPrice {
		return distanceCost, subtotal, minPrice, true
	}
	return distanceCost, subtotal, total, false
}

type quoteRequest struct {
	RouteID     int `json:"route_id"`
	CargoTypeID int `json:"cargo_type_id"`
	BodyTypeID  int `json:"body_type_id"`
}

// buildQuote подбирает тариф и рассчитывает стоимость по маршруту и типу груза.
func (s *Server) buildQuote(ctx context.Context, q quoteRequest) (Quote, error) {
	f := fieldErrors{}
	if q.RouteID <= 0 {
		f.add("route_id", "Выберите маршрут")
	}
	if q.CargoTypeID <= 0 {
		f.add("cargo_type_id", "Выберите тип груза")
	}
	if err := f.err(); err != nil {
		return Quote{}, err
	}
	res := Quote{RouteID: q.RouteID, CargoTypeID: q.CargoTypeID}

	var active bool
	err := s.db.QueryRow(ctx, `SELECT f.name || ' — ' || t.name, r.distance_km, r.duration_hours::float8, r.is_active
		FROM routes r JOIN cities f ON f.id = r.from_city_id JOIN cities t ON t.id = r.to_city_id
		WHERE r.id = $1`, q.RouteID).Scan(&res.RouteName, &res.DistanceKm, &res.DurationHours, &active)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !active) {
		return res, badRequest("Маршрут не найден или не используется", map[string]string{"route_id": "Выберите другой маршрут"})
	}
	if err != nil {
		return res, err
	}

	var required *int
	var requiredName string
	err = s.db.QueryRow(ctx, `SELECT c.name, c.coefficient::float8, c.body_type_id, COALESCE(b.name, '')
		FROM cargo_types c LEFT JOIN body_types b ON b.id = c.body_type_id WHERE c.id = $1`, q.CargoTypeID).
		Scan(&res.CargoTypeName, &res.Coefficient, &required, &requiredName)
	if errors.Is(err, pgx.ErrNoRows) {
		return res, badRequest("Тип груза не найден", map[string]string{"cargo_type_id": "Выберите тип груза"})
	}
	if err != nil {
		return res, err
	}

	// Тип груза может требовать определённый кузов (например, рефрижератор).
	res.BodyTypeID = q.BodyTypeID
	if required != nil {
		if q.BodyTypeID != 0 && q.BodyTypeID != *required {
			return res, badRequest("Тип кузова не подходит для груза", map[string]string{
				"body_type_id": "Для груза «" + res.CargoTypeName + "» требуется кузов «" + requiredName + "»"})
		}
		res.BodyTypeID = *required
	}
	if res.BodyTypeID <= 0 {
		return res, badRequest("Выберите тип кузова", map[string]string{"body_type_id": "Выберите тип кузова"})
	}

	err = s.db.QueryRow(ctx, `SELECT t.id, t.name, b.name, t.base_price::float8, t.price_per_km::float8, t.min_price::float8
		FROM tariffs t JOIN body_types b ON b.id = t.body_type_id
		WHERE t.body_type_id = $1 AND t.is_active`, res.BodyTypeID).
		Scan(&res.TariffID, &res.TariffName, &res.BodyTypeName, &res.BasePrice, &res.PricePerKm, &res.MinPrice)
	if errors.Is(err, pgx.ErrNoRows) {
		return res, badRequest("Нет действующего тарифа для выбранного типа кузова",
			map[string]string{"body_type_id": "Для этого кузова не задан тариф"})
	}
	if err != nil {
		return res, err
	}
	res.DistanceCost, res.Subtotal, res.Total, res.MinApplied =
		CalcCost(res.BasePrice, res.PricePerKm, res.MinPrice, res.DistanceKm, res.Coefficient)
	return res, nil
}

// quote — предварительный расчёт стоимости без сохранения заявки.
func (s *Server) quote(w http.ResponseWriter, r *http.Request) {
	var req quoteRequest
	if err := readJSON(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	q, err := s.buildQuote(r.Context(), req)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, q)
}
