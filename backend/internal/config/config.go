// Пакет config считывает параметры запуска из переменных окружения.
package config

import "os"

type Config struct {
	Addr        string // адрес HTTP-сервера
	DatabaseURL string // строка подключения к PostgreSQL
	RedisAddr   string // адрес Redis
	SeedDemo    bool   // создавать демонстрационные данные
}

func Load() Config {
	return Config{
		Addr:        env("HTTP_ADDR", ":8090"),
		DatabaseURL: env("DATABASE_URL", "postgres://gruz:gruz@localhost:5432/gruz?sslmode=disable"),
		RedisAddr:   env("REDIS_ADDR", "localhost:6379"),
		SeedDemo:    env("SEED_DEMO", "true") == "true",
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
