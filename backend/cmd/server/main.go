// Сервер информационной системы «Грузоперевозки».
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"gruzline/internal/cache"
	"gruzline/internal/config"
	"gruzline/internal/db"
	"gruzline/internal/httpapi"
)

func main() {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Подключение к PostgreSQL и применение миграций
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatal(err)
	}

	// Подключение к Redis
	rc, err := cache.New(ctx, cfg.RedisAddr)
	if err != nil {
		log.Fatal(err)
	}

	api := httpapi.New(pool, rc)
	if cfg.SeedDemo {
		if err := api.SeedDemo(ctx); err != nil {
			log.Fatalf("демонстрационные данные: %v", err)
		}
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		log.Printf("сервер запущен на %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Println("сервер остановлен")
}
