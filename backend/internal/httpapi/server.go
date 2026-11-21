// Пакет httpapi содержит обработчики REST API, проверку ролей и валидацию.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"slices"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"gruzline/internal/cache"
)

// Роли пользователей
const (
	RoleAdmin      = "admin"
	RoleDispatcher = "dispatcher"
	RoleDriver     = "driver"
	RoleClient     = "client"
)

var staff = []string{RoleAdmin, RoleDispatcher}

type Server struct {
	db    *pgxpool.Pool
	cache *cache.Cache
	now   func() time.Time
}

func New(db *pgxpool.Pool, c *cache.Cache) *Server {
	return &Server{db: db, cache: c, now: time.Now}
}

type ctxKey struct{}

func sessionFrom(r *http.Request) *cache.Session {
	s, _ := r.Context().Value(ctxKey{}).(*cache.Session)
	return s
}

// Routes регистрирует маршруты API в стандартном мультиплексоре net/http.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	all := []string{RoleAdmin, RoleDispatcher, RoleDriver, RoleClient}
	h := func(pattern string, fn http.HandlerFunc, roles ...string) {
		mux.Handle(pattern, s.auth(fn, roles...))
	}

	mux.HandleFunc("POST /api/auth/login", s.login)
	mux.HandleFunc("POST /api/auth/register", s.register)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	h("GET /api/auth/me", s.me, all...)
	h("GET /api/stats", s.stats, all...)

	// Клиенты
	h("GET /api/clients", s.listClients, staff...)
	h("POST /api/clients", s.createClient, staff...)
	h("GET /api/clients/{id}", s.getClient, staff...)
	h("PUT /api/clients/{id}", s.updateClient, staff...)
	h("DELETE /api/clients/{id}", s.deleteClient, staff...)

	// Справочники
	h("GET /api/body-types", s.listBodyTypes, all...)
	h("GET /api/cargo-types", s.listCargoTypes, all...)
	h("POST /api/cargo-types", s.saveCargoType, RoleAdmin)
	h("PUT /api/cargo-types/{id}", s.saveCargoType, RoleAdmin)
	h("DELETE /api/cargo-types/{id}", s.deleteRef("cargo_types"), RoleAdmin)
	h("GET /api/tariffs", s.listTariffs, all...)
	h("POST /api/tariffs", s.saveTariff, RoleAdmin)
	h("PUT /api/tariffs/{id}", s.saveTariff, RoleAdmin)
	h("DELETE /api/tariffs/{id}", s.deleteRef("tariffs"), RoleAdmin)
	h("GET /api/cities", s.listCities, all...)
	h("POST /api/cities", s.saveCity, RoleAdmin)
	h("DELETE /api/cities/{id}", s.deleteRef("cities"), RoleAdmin)
	h("GET /api/routes", s.listRoutes, all...)
	h("POST /api/routes", s.saveRoute, RoleAdmin)
	h("PUT /api/routes/{id}", s.saveRoute, RoleAdmin)
	h("DELETE /api/routes/{id}", s.deleteRef("routes"), RoleAdmin)

	// Транспорт и водители
	h("GET /api/vehicles", s.listVehicles, staff...)
	h("POST /api/vehicles", s.saveVehicle, RoleAdmin)
	h("PUT /api/vehicles/{id}", s.saveVehicle, RoleAdmin)
	h("DELETE /api/vehicles/{id}", s.deleteRef("vehicles"), RoleAdmin)
	h("GET /api/drivers", s.listDrivers, staff...)
	h("POST /api/drivers", s.saveDriver, RoleAdmin)
	h("PUT /api/drivers/{id}", s.saveDriver, RoleAdmin)
	h("DELETE /api/drivers/{id}", s.deleteRef("drivers"), RoleAdmin)

	// Заявки
	h("POST /api/orders/quote", s.quote, RoleAdmin, RoleDispatcher, RoleClient)
	h("GET /api/orders", s.listOrders, all...)
	h("POST /api/orders", s.createOrder, RoleAdmin, RoleDispatcher, RoleClient)
	h("GET /api/orders/{id}", s.getOrder, all...)
	h("PUT /api/orders/{id}", s.updateOrder, staff...)
	h("DELETE /api/orders/{id}", s.deleteOrder, staff...)
	h("GET /api/orders/{id}/candidates", s.candidates, staff...)
	h("POST /api/orders/{id}/assign", s.assignOrder, staff...)
	h("POST /api/orders/{id}/status", s.changeStatus, all...)

	// Пользователи
	h("GET /api/users", s.listUsers, RoleAdmin)
	h("POST /api/users", s.createUser, RoleAdmin)
	h("PUT /api/users/{id}", s.updateUser, RoleAdmin)
	h("DELETE /api/users/{id}", s.deleteUser, RoleAdmin)

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	return logRequests(mux)
}

// auth — промежуточный обработчик: проверяет сессию и роль пользователя.
// Без входа в систему возвращает 401, при недостаточной роли — 403.
func (s *Server) auth(next http.HandlerFunc, roles ...string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Требуется вход в систему")
			return
		}
		sess, err := s.cache.GetSession(r.Context(), cookie.Value)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Сессия истекла, войдите снова")
			return
		}
		if !slices.Contains(roles, sess.Role) {
			writeError(w, http.StatusForbidden, "Недостаточно прав для выполнения операции")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, sess)))
	})
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

// apiError — ошибка с HTTP-кодом, текстом и сообщениями по полям формы.
type apiError struct {
	Status  int               `json:"-"`
	Message string            `json:"error"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func (e *apiError) Error() string { return e.Message }

func badRequest(msg string, fields map[string]string) *apiError {
	return &apiError{Status: http.StatusBadRequest, Message: msg, Fields: fields}
}

func conflict(msg string) *apiError {
	return &apiError{Status: http.StatusConflict, Message: msg}
}

var errNotFound = &apiError{Status: http.StatusNotFound, Message: "Запись не найдена"}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, apiError{Message: msg})
}

func readJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	if err := dec.Decode(dst); err != nil {
		return badRequest("Некорректный формат запроса", nil)
	}
	return nil
}

func pathID(r *http.Request) (int, error) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		return 0, errNotFound
	}
	return id, nil
}

// constraintMessages сопоставляет ограничения БД с понятными пользователю сообщениями.
var constraintMessages = map[string]string{
	"users_login_key":                    "Пользователь с таким логином уже существует",
	"clients_inn_key":                    "Клиент с таким ИНН уже зарегистрирован",
	"clients_user_id_key":                "Учётная запись уже привязана к другому клиенту",
	"drivers_user_id_key":                "Учётная запись уже привязана к другому водителю",
	"drivers_license_number_key":         "Водитель с таким номером удостоверения уже есть",
	"vehicles_reg_number_key":            "Транспорт с таким госномером уже зарегистрирован",
	"routes_code_key":                    "Маршрут с таким кодом уже существует",
	"routes_from_city_id_to_city_id_key": "Маршрут между этими городами уже существует",
	"routes_cities_chk":                  "Пункты отправления и назначения должны различаться",
	"cities_name_region_key":             "Такой населённый пункт уже есть в справочнике",
	"cargo_types_code_key":               "Тип груза с таким кодом уже существует",
	"cargo_types_name_key":               "Тип груза с таким названием уже существует",
	"tariffs_active_uidx":                "Для этого типа кузова уже есть действующий тариф",
	"orders_vehicle_no_overlap":          "Транспорт уже занят другим рейсом в это время",
	"orders_driver_no_overlap":           "Водитель уже назначен на другой рейс в это время",
	"orders_assign_chk":                  "Для заявки не назначены транспорт и водитель",
}

// writeErr централизованно преобразует ошибки приложения и СУБД в ответ API.
func writeErr(w http.ResponseWriter, err error) {
	var ae *apiError
	if errors.As(err, &ae) {
		writeJSON(w, ae.Status, ae)
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, errNotFound)
		return
	}
	if errors.Is(err, cache.ErrLocked) {
		writeError(w, http.StatusConflict, "Ресурс сейчас изменяет другой пользователь, повторите через несколько секунд")
		return
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		msg, known := constraintMessages[pg.ConstraintName]
		switch pg.Code {
		case "23505", "23P01": // нарушение уникальности, ограничение исключения
			if !known {
				msg = "Такая запись уже существует"
			}
			writeError(w, http.StatusConflict, msg)
			return
		case "23503": // нарушение внешнего ключа
			writeError(w, http.StatusConflict, "Запись используется в других данных и не может быть удалена")
			return
		case "23514": // нарушение ограничения CHECK
			if !known {
				msg = "Данные не прошли проверку: " + pg.ConstraintName
			}
			writeError(w, http.StatusBadRequest, msg)
			return
		}
	}
	log.Printf("внутренняя ошибка: %v", err)
	writeError(w, http.StatusInternalServerError, "Внутренняя ошибка сервера")
}

// pageParams разбирает параметры постраничного вывода.
func pageParams(r *http.Request) (limit, offset int) {
	limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	return limit, (page - 1) * limit
}

type page[T any] struct {
	Items []T `json:"items"`
	Total int `json:"total"`
}
