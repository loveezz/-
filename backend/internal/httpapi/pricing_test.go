package httpapi

import "testing"

// Проверка формулы расчёта стоимости перевозки.
func TestCalcCost(t *testing.T) {
	cases := []struct {
		name             string
		base, perKm, min float64
		km               int
		coef             float64
		want             float64
		minApplied       bool
	}{
		{"тент, генеральный груз", 3000, 42, 8000, 210, 1.00, 11820, false},
		{"рефрижератор, скоропортящийся", 4500, 58, 12000, 360, 1.30, 32994, false},
		{"короткий маршрут — минимальная стоимость", 1500, 28, 3500, 50, 1.00, 3500, true},
		{"негабарит, коэффициент 1,6", 2500, 38, 7000, 520, 1.60, 35616, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, _, got, minApplied := CalcCost(c.base, c.perKm, c.min, c.km, c.coef)
			if got != c.want || minApplied != c.minApplied {
				t.Fatalf("CalcCost = %.2f (мин. %v), ожидалось %.2f (мин. %v)", got, minApplied, c.want, c.minApplied)
			}
		})
	}
}

// Проверка правил валидации входных данных.
func TestValidation(t *testing.T) {
	for inn, ok := range map[string]bool{
		"6671012340": true, "667012345670": true, "6671012341": false, "12345": false, "66710123AB": false,
	} {
		if validINN(inn) != ok {
			t.Errorf("validINN(%q) != %v", inn, ok)
		}
	}
	if got := normalizePhone("8 912 600-10-20"); got != "+7 (912) 600-10-20" {
		t.Errorf("normalizePhone: %q", got)
	}
	if normalizePhone("12345") != "" {
		t.Error("короткий номер должен отклоняться")
	}
	if p := normalizePlate("a125bc 196"); p != "А125ВС196" || !validPlate(p) {
		t.Errorf("normalizePlate: %q", p)
	}
	if validPlate("Б125ВС196") {
		t.Error("буква Б недопустима в госномере")
	}
	if !validPassword("Demo1234") || validPassword("password") || validPassword("Ab1") {
		t.Error("ошибка проверки пароля")
	}
	if !hasCategory("B,C,CE", "CE") || hasCategory("B,C", "CE") {
		t.Error("ошибка проверки категорий прав")
	}
}
