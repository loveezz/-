package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// Candidate — транспорт или водитель, доступный для назначения на заявку.
type Candidate struct {
	ID       int    `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Busy     bool   `json:"busy"`
	BusyWith string `json:"busy_with,omitempty"`
	Suitable bool   `json:"suitable"`
	Reason   string `json:"reason,omitempty"`
}

type orderSlot struct {
	status     string
	bodyTypeID int
	weightKg   int
	volumeM3   float64
	startsAt   time.Time
	endsAt     time.Time
}

// candidates возвращает транспорт и водителей с отметкой о пригодности и занятости
// на интервал рейса.
func (s *Server) candidates(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	ctx := r.Context()
	var o orderSlot
	if err := s.db.QueryRow(ctx, `SELECT o.status, t.body_type_id, o.weight_kg, o.volume_m3::float8, o.starts_at, o.ends_at
		FROM orders o JOIN tariffs t ON t.id = o.tariff_id WHERE o.id = $1`, id).
		Scan(&o.status, &o.bodyTypeID, &o.weightKg, &o.volumeM3, &o.startsAt, &o.endsAt); err != nil {
		writeErr(w, err)
		return
	}

	vehicles := []Candidate{}
	rows, err := s.db.Query(ctx, `SELECT v.id, v.reg_number, v.model, b.name, v.capacity_kg, v.volume_m3::float8,
		v.license_category, v.body_type_id, v.status,
		(SELECT '№' || x.id || ', ' || to_char(x.starts_at AT TIME ZONE 'Asia/Yekaterinburg', 'DD.MM HH24:MI')
		   FROM orders x WHERE x.vehicle_id = v.id AND x.id <> $1
		   AND x.status IN ('assigned', 'in_transit')
		   AND tstzrange(x.starts_at, x.ends_at) && tstzrange($2, $3) LIMIT 1)
		FROM vehicles v JOIN body_types b ON b.id = v.body_type_id
		WHERE v.status <> 'inactive'
		ORDER BY (v.body_type_id = $4) DESC, v.capacity_kg`, id, o.startsAt, o.endsAt, o.bodyTypeID)
	if err != nil {
		writeErr(w, err)
		return
	}
	for rows.Next() {
		var (
			c                           Candidate
			plate, model, body, cat, st string
			capKg, bodyID               int
			vol                         float64
			busy                        *string
		)
		if err := rows.Scan(&c.ID, &plate, &model, &body, &capKg, &vol, &cat, &bodyID, &st, &busy); err != nil {
			rows.Close()
			writeErr(w, err)
			return
		}
		c.Title = plate + " · " + model
		c.Subtitle = fmt.Sprintf("%s, %d кг, %.1f м³, кат. %s", body, capKg, vol, cat)
		c.Suitable = true
		switch {
		case st == "repair":
			c.Suitable, c.Reason = false, "в ремонте"
		case bodyID != o.bodyTypeID:
			c.Suitable, c.Reason = false, "другой тип кузова"
		case capKg < o.weightKg:
			c.Suitable, c.Reason = false, "недостаточная грузоподъёмность"
		case vol < o.volumeM3:
			c.Suitable, c.Reason = false, "недостаточный объём кузова"
		}
		if busy != nil {
			c.Busy, c.BusyWith = true, *busy
		}
		vehicles = append(vehicles, c)
	}
	rows.Close()

	drivers := []Candidate{}
	rows, err = s.db.Query(ctx, `SELECT d.id, d.last_name || ' ' || d.first_name || ' ' || d.middle_name,
		d.license_categories, d.phone,
		(SELECT '№' || x.id || ', ' || to_char(x.starts_at AT TIME ZONE 'Asia/Yekaterinburg', 'DD.MM HH24:MI')
		   FROM orders x WHERE x.driver_id = d.id AND x.id <> $1
		   AND x.status IN ('assigned', 'in_transit')
		   AND tstzrange(x.starts_at, x.ends_at) && tstzrange($2, $3) LIMIT 1)
		FROM drivers d WHERE d.is_active ORDER BY d.last_name`, id, o.startsAt, o.endsAt)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var c Candidate
		var cats, phone string
		var busy *string
		if err := rows.Scan(&c.ID, &c.Title, &cats, &phone, &busy); err != nil {
			writeErr(w, err)
			return
		}
		c.Subtitle = "Категории " + cats + " · " + phone
		c.Suitable = true
		if busy != nil {
			c.Busy, c.BusyWith = true, *busy
		}
		c.Reason = cats // категории нужны интерфейсу для сверки с транспортом
		drivers = append(drivers, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"vehicles": vehicles, "drivers": drivers})
}

type assignRequest struct {
	VehicleID int `json:"vehicle_id"`
	DriverID  int `json:"driver_id"`
}

// assignOrder назначает на заявку транспорт и водителя.
// Захватывается блокировка Redis по транспорту и водителю, затем в транзакции
// проверяются тип кузова, грузоподъёмность, категория прав и занятость.
// Ограничения EXCLUDE в БД дополнительно исключают пересечение рейсов.
func (s *Server) assignOrder(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var req assignRequest
	if err := readJSON(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	f := fieldErrors{}
	if req.VehicleID <= 0 {
		f.add("vehicle_id", "Выберите транспорт")
	}
	if req.DriverID <= 0 {
		f.add("driver_id", "Выберите водителя")
	}
	if err := f.err(); err != nil {
		writeErr(w, err)
		return
	}
	ctx := r.Context()
	unlock, err := s.cache.Lock(ctx, 10*time.Second,
		fmt.Sprintf("vehicle:%d", req.VehicleID), fmt.Sprintf("driver:%d", req.DriverID))
	if err != nil {
		writeErr(w, err)
		return
	}
	defer unlock()

	if err := s.assignTx(ctx, id, req, sessionFrom(r).UserID); err != nil {
		writeErr(w, err)
		return
	}
	s.cache.Invalidate(ctx, "stats")
	o, err := s.loadOrder(ctx, r, id)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (s *Server) assignTx(ctx context.Context, id int, req assignRequest, userID int) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var o orderSlot
	if err := tx.QueryRow(ctx, `SELECT o.status, t.body_type_id, o.weight_kg, o.volume_m3::float8, o.starts_at, o.ends_at
		FROM orders o JOIN tariffs t ON t.id = o.tariff_id WHERE o.id = $1 FOR UPDATE OF o`, id).
		Scan(&o.status, &o.bodyTypeID, &o.weightKg, &o.volumeM3, &o.startsAt, &o.endsAt); err != nil {
		return err
	}
	if o.status != StatusNew && o.status != StatusAssigned {
		return conflict("Назначить транспорт можно только на новую или уже назначенную заявку")
	}

	var (
		vBody, vCap int
		vVol        float64
		vCat, vSt   string
		dCats       string
		dActive     bool
	)
	if err := tx.QueryRow(ctx, `SELECT body_type_id, capacity_kg, volume_m3::float8, license_category, status
		FROM vehicles WHERE id = $1`, req.VehicleID).Scan(&vBody, &vCap, &vVol, &vCat, &vSt); err != nil {
		return badRequest("Транспорт не найден", map[string]string{"vehicle_id": "Выберите транспорт из списка"})
	}
	if err := tx.QueryRow(ctx, `SELECT license_categories, is_active FROM drivers WHERE id = $1`,
		req.DriverID).Scan(&dCats, &dActive); err != nil {
		return badRequest("Водитель не найден", map[string]string{"driver_id": "Выберите водителя из списка"})
	}
	f := fieldErrors{}
	switch {
	case vSt != "active":
		f.add("vehicle_id", "Транспорт не на линии (ремонт или списан)")
	case vBody != o.bodyTypeID:
		f.add("vehicle_id", "Тип кузова не соответствует тарифу заявки")
	case vCap < o.weightKg:
		f.add("vehicle_id", fmt.Sprintf("Грузоподъёмность %d кг меньше массы груза %d кг", vCap, o.weightKg))
	case vVol < o.volumeM3:
		f.add("vehicle_id", "Объём кузова меньше объёма груза")
	}
	switch {
	case !dActive:
		f.add("driver_id", "Водитель не работает")
	case !hasCategory(dCats, vCat):
		f.add("driver_id", "У водителя нет категории «"+vCat+"» для этого транспорта")
	}
	if err := f.err(); err != nil {
		return err
	}

	var vBusy, dBusy bool
	if err := tx.QueryRow(ctx, `SELECT
		EXISTS(SELECT 1 FROM orders WHERE vehicle_id = $1 AND id <> $3 AND status IN ('assigned', 'in_transit')
			AND tstzrange(starts_at, ends_at) && tstzrange($4, $5)),
		EXISTS(SELECT 1 FROM orders WHERE driver_id = $2 AND id <> $3 AND status IN ('assigned', 'in_transit')
			AND tstzrange(starts_at, ends_at) && tstzrange($4, $5))`,
		req.VehicleID, req.DriverID, id, o.startsAt, o.endsAt).Scan(&vBusy, &dBusy); err != nil {
		return err
	}
	if vBusy {
		return conflict("Транспорт уже занят другим рейсом в это время")
	}
	if dBusy {
		return conflict("Водитель уже назначен на другой рейс в это время")
	}

	if _, err := tx.Exec(ctx, `UPDATE orders SET vehicle_id = $1, driver_id = $2, status = 'assigned'
		WHERE id = $3`, req.VehicleID, req.DriverID, id); err != nil {
		return err
	}
	comment := "Назначены транспорт и водитель"
	if o.status == StatusAssigned {
		comment = "Изменено назначение транспорта и водителя"
	}
	if err := addEvent(ctx, tx, id, StatusAssigned, comment, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
