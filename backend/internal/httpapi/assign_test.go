package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"gruzline/internal/cache"
	"gruzline/internal/db"
)

// newTestServer поднимает сервер на тестовой БД. Тест пропускается,
// если переменная TEST_DATABASE_URL не задана.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL не задана")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	rc, err := cache.New(ctx, addr)
	if err != nil {
		t.Fatal(err)
	}
	s := New(pool, rc)
	if err := s.SeedDemo(ctx); err != nil {
		t.Fatal(err)
	}
	// Удаляем заявки, оставшиеся от предыдущих запусков тестов.
	if _, err := pool.Exec(ctx, `DELETE FROM orders WHERE cargo_description = 'Тестовый груз'`); err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(s.Routes())
	t.Cleanup(ts.Close)
	return ts
}

func loginAs(t *testing.T, ts *httptest.Server, login, password string) *http.Client {
	t.Helper()
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	body, _ := json.Marshal(map[string]string{"login": login, "password": password})
	resp, err := c.Post(ts.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("вход %s: %v %v", login, err, resp.Status)
	}
	resp.Body.Close()
	return c
}

func postJSON(c *http.Client, url string, v any) (int, map[string]any) {
	body, _ := json.Marshal(v)
	resp, err := c.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, nil
	}
	defer resp.Body.Close()
	var res map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&res)
	return resp.StatusCode, res
}

// Без входа в систему API отвечает 401, водителю недоступен список клиентов (403).
func TestAccessControl(t *testing.T) {
	ts := newTestServer(t)
	resp, _ := http.Get(ts.URL + "/api/orders")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("без входа: %d, ожидался 401", resp.StatusCode)
	}
	driver := loginAs(t, ts, "sokolov", "Demo123!")
	resp, _ = driver.Get(ts.URL + "/api/clients")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("водитель: %d, ожидался 403", resp.StatusCode)
	}
}

// createTestOrder оформляет две заявки с пересекающимся временем рейса.
func createTestOrder(t *testing.T, c *http.Client, url string, start time.Time) int {
	code, res := postJSON(c, url+"/api/orders", map[string]any{
		"client_id": 1, "route_id": 3, "cargo_type_id": 1, "body_type_id": 1,
		"cargo_description": "Тестовый груз", "weight_kg": 5000, "volume_m3": 20,
		"pickup_address": "Склад 1", "delivery_address": "Склад 2",
		"starts_at": start.Format(time.RFC3339),
	})
	if code != http.StatusCreated {
		t.Fatalf("создание заявки: %d %v", code, res)
	}
	return int(res["id"].(float64))
}

// Один транспорт нельзя назначить на два пересекающихся рейса.
func TestAssignBusyVehicle(t *testing.T) {
	ts := newTestServer(t)
	c := loginAs(t, ts, "dispatcher", "Demo123!")
	start := time.Now().AddDate(0, 1, 0).Truncate(time.Hour)
	first := createTestOrder(t, c, ts.URL, start)
	second := createTestOrder(t, c, ts.URL, start.Add(time.Hour))

	if code, res := postJSON(c, fmt.Sprintf("%s/api/orders/%d/assign", ts.URL, first),
		map[string]int{"vehicle_id": 1, "driver_id": 1}); code != http.StatusOK {
		t.Fatalf("первое назначение: %d %v", code, res)
	}
	code, _ := postJSON(c, fmt.Sprintf("%s/api/orders/%d/assign", ts.URL, second),
		map[string]int{"vehicle_id": 1, "driver_id": 4})
	if code != http.StatusConflict {
		t.Fatalf("занятый транспорт: %d, ожидался 409", code)
	}
}

// При восьми одновременных попытках назначить один автомобиль на восемь
// пересекающихся заявок успешно выполняется ровно одна.
func TestConcurrentAssign(t *testing.T) {
	ts := newTestServer(t)
	c := loginAs(t, ts, "dispatcher", "Demo123!")
	start := time.Now().AddDate(0, 2, 0).Truncate(time.Hour)
	ids := make([]int, 8)
	for i := range ids {
		ids[i] = createTestOrder(t, c, ts.URL, start.Add(time.Duration(i)*10*time.Minute))
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for _, id := range ids {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			code, _ := postJSON(c, fmt.Sprintf("%s/api/orders/%d/assign", ts.URL, id),
				map[string]int{"vehicle_id": 2, "driver_id": 2})
			if code == http.StatusOK {
				mu.Lock()
				success++
				mu.Unlock()
			}
		}(id)
	}
	wg.Wait()
	if success != 1 {
		t.Fatalf("успешных назначений: %d, ожидалось 1", success)
	}
}
