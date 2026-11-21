# Сборка и тестирование серверной части
TEST_DATABASE_URL ?= postgres://gruz:gruz@localhost:5432/gruz_test?sslmode=disable

build:
	go build -o bin/server ./cmd/server

run:
	go run ./cmd/server

test:
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) go test -count=1 -v ./...

.PHONY: build run test
