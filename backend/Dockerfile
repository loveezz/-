# Сборка серверной части в один исполняемый файл
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
COPY vendor ./vendor
COPY . .
RUN CGO_ENABLED=0 go build -mod=vendor -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache tzdata ca-certificates
ENV TZ=Asia/Yekaterinburg
COPY --from=build /out/server /server
EXPOSE 8090
ENTRYPOINT ["/server"]
