#!/usr/bin/env bash
# Быстрая проверка программного интерфейса системы «Грузоперевозки».
set -euo pipefail
API=${API:-http://localhost:8090/api}
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

echo "1. Вход диспетчера"
curl -sf -c "$JAR" -H 'Content-Type: application/json' \
  -d '{"login":"dispatcher","password":"Demo123!"}' "$API/auth/login" >/dev/null

echo "2. Расчёт стоимости: Екатеринбург — Челябинск, генеральный груз, тент"
curl -sf -b "$JAR" -H 'Content-Type: application/json' \
  -d '{"route_id":3,"cargo_type_id":1,"body_type_id":1}' "$API/orders/quote"
echo

echo "3. Поиск заявок клиента № 1"
curl -sf -b "$JAR" "$API/orders?client_id=1&limit=3" | head -c 300
echo

echo "4. Запрос без входа должен вернуть 401"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/orders")
[ "$code" = "401" ] && echo "OK: $code" || { echo "Ожидался 401, получен $code"; exit 1; }
