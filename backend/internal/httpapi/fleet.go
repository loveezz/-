package httpapi

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Vehicle struct {
	ID              int     `json:"id"`
	RegNumber       string  `json:"reg_number"`
	Model           string  `json:"model"`
	BodyTypeID      int     `json:"body_type_id"`
	BodyTypeName    string  `json:"body_type_name"`
	CapacityKg      int     `json:"capacity_kg"`
	VolumeM3        float64 `json:"volume_m3"`
	LicenseCategory string  `json:"license_category"`
	Year            int     `json:"year"`
	Status          string  `json:"status"`
	TripsCount      int     `json:"trips_count"`
	CurrentTrip     *string `json:"current_trip"`
}

func (s *Server) listVehicles(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"TRUE"}
	var args []any
	if n, err := strconv.Atoi(q.Get("body_type_id")); err == nil && n > 0 {
		args = append(args, n)
		where = append(where, "v.body_type_id = $"+itoa(len(args)))
	}
	if st := q.Get("status"); st != "" {
		args = append(args, st)
		where = append(where, "v.status = $"+itoa(len(args)))
	}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		args = append(args, "%"+strings.ToLower(normalizePlate(v))+"%", "%"+strings.ToLower(v)+"%")
		where = append(where, "(lower(v.reg_number) LIKE $"+itoa(len(args)-1)+" OR lower(v.model) LIKE $"+itoa(len(args))+")")
	}
	items, err := queryList(r.Context(), s, `SELECT v.id, v.reg_number, v.model, v.body_type_id, b.name,
		v.capacity_kg, v.volume_m3::float8, v.license_category, v.year, v.status,
		(SELECT count(*) FROM orders o WHERE o.vehicle_id = v.id AND o.status <> 'cancelled'),
		(SELECT '№' || o.id || ' ' || fc.name || ' — ' || tc.name FROM orders o
		   JOIN routes r ON r.id = o.route_id JOIN cities fc ON fc.id = r.from_city_id
		   JOIN cities tc ON tc.id = r.to_city_id
		   WHERE o.vehicle_id = v.id AND o.status = 'in_transit' LIMIT 1)
		FROM vehicles v JOIN body_types b ON b.id = v.body_type_id
		WHERE `+strings.Join(where, " AND ")+` ORDER BY v.status, b.name, v.capacity_kg DESC`,
		func(row interface{ Scan(...any) error }, v *Vehicle) error {
			return row.Scan(&v.ID, &v.RegNumber, &v.Model, &v.BodyTypeID, &v.BodyTypeName, &v.CapacityKg,
				&v.VolumeM3, &v.LicenseCategory, &v.Year, &v.Status, &v.TripsCount, &v.CurrentTrip)
		}, args...)
	respond(w, items, err)
}

func (s *Server) saveVehicle(w http.ResponseWriter, r *http.Request) {
	var in Vehicle
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	in.RegNumber = normalizePlate(in.RegNumber)
	f := fieldErrors{}
	if !validPlate(in.RegNumber) {
		f.add("reg_number", "Госномер в формате А123ВС96 или А123ВС196")
	}
	f.required("model", in.Model, "Марка и модель")
	if in.BodyTypeID <= 0 {
		f.add("body_type_id", "Выберите тип кузова")
	}
	if in.CapacityKg < 100 || in.CapacityKg > 50000 {
		f.add("capacity_kg", "Грузоподъёмность от 100 до 50 000 кг")
	}
	if in.VolumeM3 <= 0 || in.VolumeM3 > 150 {
		f.add("volume_m3", "Объём кузова от 0,1 до 150 м³")
	}
	if in.LicenseCategory != "B" && in.LicenseCategory != "C" && in.LicenseCategory != "CE" {
		f.add("license_category", "Выберите категорию прав")
	}
	if in.Year < 1980 || in.Year > time.Now().Year()+1 {
		f.add("year", "Некорректный год выпуска")
	}
	if in.Status == "" {
		in.Status = "active"
	}
	if in.Status != "active" && in.Status != "repair" && in.Status != "inactive" {
		f.add("status", "Выберите состояние")
	}
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	var err error
	if r.PathValue("id") == "" {
		_, err = s.db.Exec(r.Context(), `INSERT INTO vehicles (reg_number, model, body_type_id, capacity_kg,
			volume_m3, license_category, year, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			in.RegNumber, strings.TrimSpace(in.Model), in.BodyTypeID, in.CapacityKg, in.VolumeM3,
			in.LicenseCategory, in.Year, in.Status)
	} else {
		id, perr := pathID(r)
		if perr != nil {
			writeErr(w, perr)
			return
		}
		_, err = s.db.Exec(r.Context(), `UPDATE vehicles SET reg_number = $1, model = $2, body_type_id = $3,
			capacity_kg = $4, volume_m3 = $5, license_category = $6, year = $7, status = $8 WHERE id = $9`,
			in.RegNumber, strings.TrimSpace(in.Model), in.BodyTypeID, in.CapacityKg, in.VolumeM3,
			in.LicenseCategory, in.Year, in.Status, id)
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(r.Context(), "stats")
	w.WriteHeader(http.StatusNoContent)
}

type Driver struct {
	ID                int        `json:"id"`
	LastName          string     `json:"last_name"`
	FirstName         string     `json:"first_name"`
	MiddleName        string     `json:"middle_name"`
	LicenseNumber     string     `json:"license_number"`
	LicenseCategories []string   `json:"license_categories"`
	Phone             string     `json:"phone"`
	HireDate          string     `json:"hire_date"`
	IsActive          bool       `json:"is_active"`
	UserLogin         *string    `json:"user_login"`
	TripsCount        int        `json:"trips_count"`
	NextTrip          *time.Time `json:"next_trip"`
}

func (s *Server) listDrivers(w http.ResponseWriter, r *http.Request) {
	where := "TRUE"
	var args []any
	if v := strings.TrimSpace(r.URL.Query().Get("q")); v != "" {
		args = append(args, "%"+strings.ToLower(v)+"%")
		where = "lower(d.last_name || ' ' || d.first_name || ' ' || d.middle_name) LIKE $1"
	}
	items, err := queryList(r.Context(), s, `SELECT d.id, d.last_name, d.first_name, d.middle_name,
		d.license_number, d.license_categories, d.phone, to_char(d.hire_date, 'YYYY-MM-DD'), d.is_active, u.login,
		(SELECT count(*) FROM orders o WHERE o.driver_id = d.id AND o.status = 'delivered'),
		(SELECT min(o.starts_at) FROM orders o WHERE o.driver_id = d.id AND o.status = 'assigned')
		FROM drivers d LEFT JOIN users u ON u.id = d.user_id
		WHERE `+where+` ORDER BY d.is_active DESC, d.last_name, d.first_name`,
		func(row interface{ Scan(...any) error }, d *Driver) error {
			var cats string
			err := row.Scan(&d.ID, &d.LastName, &d.FirstName, &d.MiddleName, &d.LicenseNumber, &cats,
				&d.Phone, &d.HireDate, &d.IsActive, &d.UserLogin, &d.TripsCount, &d.NextTrip)
			d.LicenseCategories = strings.Split(cats, ",")
			return err
		}, args...)
	respond(w, items, err)
}

func (s *Server) saveDriver(w http.ResponseWriter, r *http.Request) {
	var in Driver
	if err := readJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	in.LastName, in.FirstName, in.MiddleName = strings.TrimSpace(in.LastName), strings.TrimSpace(in.FirstName), strings.TrimSpace(in.MiddleName)
	f.required("last_name", in.LastName, "Фамилия")
	f.required("first_name", in.FirstName, "Имя")
	in.LicenseNumber = strings.ReplaceAll(in.LicenseNumber, " ", "")
	if !reLicense.MatchString(in.LicenseNumber) {
		f.add("license_number", "Номер водительского удостоверения — 10 цифр")
	}
	cats := []string{}
	order := map[string]int{"B": 1, "C": 2, "CE": 3}
	for _, c := range in.LicenseCategories {
		if _, ok := order[c]; ok && !strings.Contains(","+strings.Join(cats, ",")+",", ","+c+",") {
			cats = append(cats, c)
		}
	}
	sort.Slice(cats, func(i, j int) bool { return order[cats[i]] < order[cats[j]] })
	if len(cats) == 0 {
		f.add("license_categories", "Отметьте хотя бы одну категорию")
	}
	if p := normalizePhone(in.Phone); p == "" {
		f.add("phone", "Телефон: 10 цифр после +7")
	} else {
		in.Phone = p
	}
	hire, err := time.Parse("2006-01-02", in.HireDate)
	if err != nil || hire.After(time.Now()) {
		f.add("hire_date", "Дата приёма на работу не может быть в будущем")
	}
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	if r.PathValue("id") == "" {
		_, err = s.db.Exec(r.Context(), `INSERT INTO drivers (last_name, first_name, middle_name, license_number,
			license_categories, phone, hire_date, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
			in.LastName, in.FirstName, in.MiddleName, in.LicenseNumber, strings.Join(cats, ","), in.Phone, hire)
	} else {
		id, perr := pathID(r)
		if perr != nil {
			writeErr(w, perr)
			return
		}
		_, err = s.db.Exec(r.Context(), `UPDATE drivers SET last_name = $1, first_name = $2, middle_name = $3,
			license_number = $4, license_categories = $5, phone = $6, hire_date = $7, is_active = $8 WHERE id = $9`,
			in.LastName, in.FirstName, in.MiddleName, in.LicenseNumber, strings.Join(cats, ","), in.Phone, hire,
			in.IsActive, id)
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
