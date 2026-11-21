# ГрузЛайн — информационная система грузоперевозок

Курсовой проект (вариант 16 «Грузоперевозки»): клиенты, заявки, транспорт, водители, маршруты, тарифы.

## Запуск

```
docker compose up -d --build
```

Откройте http://localhost:3010. При первом запуске создаются структура БД, справочники и демонстрационные данные.

| Роль | Логин | Пароль |
|---|---|---|
| Администратор | admin | Admin123! |
| Диспетчер | dispatcher | Demo123! |
| Водитель | sokolov, kuznetsov, belov | Demo123! |
| Клиент | uralsk | Demo123! |

## Состав

- `backend` — серверная часть на Go (REST API, PostgreSQL, Redis), тесты: `make test`
- `frontend` — клиентская часть на Next.js (React, TypeScript, Tailwind CSS)
- `scripts/smoke.sh` — быстрая проверка API
- `docker-compose.yml` — развёртывание

## Запуск без Docker (для разработки)

1. PostgreSQL 16 и Redis 7 на localhost, база `gruz` (пользователь/пароль `gruz`).
2. `cd backend && go run ./cmd/server`
3. `cd frontend && npm install && npm run dev` — откройте http://localhost:3010
