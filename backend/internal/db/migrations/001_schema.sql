-- Схема БД «Грузоперевозки». Нормализация до 3НФ.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Роли пользователей
CREATE TABLE roles (
    id   SMALLSERIAL PRIMARY KEY,
    code VARCHAR(20)  NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL
);

-- Учётные записи
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    login         VARCHAR(50)  NOT NULL UNIQUE
                  CHECK (login ~ '^[A-Za-z0-9_.-]{3,50}$'),
    password_hash VARCHAR(100) NOT NULL,
    role_id       SMALLINT     NOT NULL REFERENCES roles(id),
    email         VARCHAR(120),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Клиенты (физические и юридические лица)
CREATE TABLE clients (
    id             SERIAL PRIMARY KEY,
    client_type    CHAR(1)      NOT NULL CHECK (client_type IN ('P', 'C')),
    name           VARCHAR(200) NOT NULL,
    inn            VARCHAR(12)  UNIQUE CHECK (inn ~ '^([0-9]{10}|[0-9]{12})$'),
    contact_person VARCHAR(150) NOT NULL DEFAULT '',
    phone          VARCHAR(20)  NOT NULL,
    email          VARCHAR(120) NOT NULL DEFAULT '',
    address        VARCHAR(255) NOT NULL DEFAULT '',
    user_id        INT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX clients_name_idx ON clients (lower(name));

-- Типы кузова
CREATE TABLE body_types (
    id   SERIAL PRIMARY KEY,
    code VARCHAR(20)  NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- Типы груза с коэффициентом стоимости
CREATE TABLE cargo_types (
    id           SERIAL PRIMARY KEY,
    code         VARCHAR(20)  NOT NULL UNIQUE,
    name         VARCHAR(100) NOT NULL UNIQUE,
    coefficient  NUMERIC(4,2) NOT NULL DEFAULT 1
                 CHECK (coefficient BETWEEN 0.5 AND 5),
    body_type_id INT REFERENCES body_types(id) ON DELETE SET NULL,
    description  TEXT         NOT NULL DEFAULT ''
);

-- Тарифы по типу кузова
CREATE TABLE tariffs (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100)  NOT NULL,
    body_type_id INT           NOT NULL REFERENCES body_types(id),
    base_price   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
    price_per_km NUMERIC(8,2)  NOT NULL CHECK (price_per_km > 0),
    min_price    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_price >= 0),
    is_active    BOOLEAN       NOT NULL DEFAULT TRUE
);
-- У типа кузова может быть только один действующий тариф
CREATE UNIQUE INDEX tariffs_active_uidx ON tariffs (body_type_id) WHERE is_active;

-- Населённые пункты
CREATE TABLE cities (
    id     SERIAL PRIMARY KEY,
    name   VARCHAR(100) NOT NULL,
    region VARCHAR(100) NOT NULL DEFAULT '',
    UNIQUE (name, region)
);

-- Маршруты
CREATE TABLE routes (
    id             SERIAL PRIMARY KEY,
    code           VARCHAR(20)  NOT NULL UNIQUE,
    from_city_id   INT          NOT NULL REFERENCES cities(id),
    to_city_id     INT          NOT NULL REFERENCES cities(id),
    distance_km    INT          NOT NULL CHECK (distance_km BETWEEN 1 AND 10000),
    duration_hours NUMERIC(5,1) NOT NULL CHECK (duration_hours > 0),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT routes_cities_chk CHECK (from_city_id <> to_city_id),
    UNIQUE (from_city_id, to_city_id)
);

-- Транспортные средства
CREATE TABLE vehicles (
    id               SERIAL PRIMARY KEY,
    reg_number       VARCHAR(9)   NOT NULL UNIQUE
                     CHECK (reg_number ~ '^[АВЕКМНОРСТУХ][0-9]{3}[АВЕКМНОРСТУХ]{2}[0-9]{2,3}$'),
    model            VARCHAR(100) NOT NULL,
    body_type_id     INT          NOT NULL REFERENCES body_types(id),
    capacity_kg      INT          NOT NULL CHECK (capacity_kg BETWEEN 100 AND 50000),
    volume_m3        NUMERIC(5,1) NOT NULL CHECK (volume_m3 > 0),
    license_category VARCHAR(3)   NOT NULL CHECK (license_category IN ('B', 'C', 'CE')),
    year             SMALLINT     NOT NULL CHECK (year BETWEEN 1980 AND 2100),
    status           VARCHAR(10)  NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'repair', 'inactive'))
);
CREATE INDEX vehicles_body_idx ON vehicles (body_type_id);

-- Водители
CREATE TABLE drivers (
    id                 SERIAL PRIMARY KEY,
    last_name          VARCHAR(60) NOT NULL,
    first_name         VARCHAR(60) NOT NULL,
    middle_name        VARCHAR(60) NOT NULL DEFAULT '',
    license_number     CHAR(10)    NOT NULL UNIQUE CHECK (license_number ~ '^[0-9]{10}$'),
    license_categories VARCHAR(20) NOT NULL CHECK (license_categories ~ '^(B|C|CE)(,(B|C|CE))*$'),
    phone              VARCHAR(20) NOT NULL DEFAULT '',
    hire_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
    user_id            INT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    is_active          BOOLEAN     NOT NULL DEFAULT TRUE
);
CREATE INDEX drivers_fio_idx ON drivers (lower(last_name), lower(first_name));

-- Заявки на перевозку
CREATE TABLE orders (
    id                SERIAL PRIMARY KEY,
    client_id         INT           NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    route_id          INT           NOT NULL REFERENCES routes(id),
    cargo_type_id     INT           NOT NULL REFERENCES cargo_types(id),
    tariff_id         INT           NOT NULL REFERENCES tariffs(id),
    cargo_description VARCHAR(255)  NOT NULL DEFAULT '',
    weight_kg         INT           NOT NULL CHECK (weight_kg BETWEEN 1 AND 50000),
    volume_m3         NUMERIC(5,1)  NOT NULL CHECK (volume_m3 > 0),
    pickup_address    VARCHAR(255)  NOT NULL DEFAULT '',
    delivery_address  VARCHAR(255)  NOT NULL DEFAULT '',
    starts_at         TIMESTAMPTZ   NOT NULL,
    ends_at           TIMESTAMPTZ   NOT NULL,
    distance_km       INT           NOT NULL CHECK (distance_km > 0),
    cost              NUMERIC(12,2) NOT NULL CHECK (cost >= 0),
    status            VARCHAR(12)   NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'assigned', 'in_transit', 'delivered', 'cancelled')),
    vehicle_id        INT REFERENCES vehicles(id),
    driver_id         INT REFERENCES drivers(id),
    created_by        INT REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT orders_time_chk CHECK (ends_at > starts_at),
    CONSTRAINT orders_assign_chk CHECK (status IN ('new', 'cancelled')
        OR (vehicle_id IS NOT NULL AND driver_id IS NOT NULL)),
    -- Один автомобиль не может выполнять два рейса одновременно
    CONSTRAINT orders_vehicle_no_overlap EXCLUDE USING gist (
        vehicle_id WITH =, tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (status IN ('assigned', 'in_transit')),
    -- Один водитель не может выполнять два рейса одновременно
    CONSTRAINT orders_driver_no_overlap EXCLUDE USING gist (
        driver_id WITH =, tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (status IN ('assigned', 'in_transit'))
);
CREATE INDEX orders_client_idx  ON orders (client_id, starts_at);
CREATE INDEX orders_route_idx   ON orders (route_id);
CREATE INDEX orders_driver_idx  ON orders (driver_id, starts_at);
CREATE INDEX orders_date_idx    ON orders (starts_at);

-- История изменения статусов заявки
CREATE TABLE order_events (
    id         SERIAL PRIMARY KEY,
    order_id   INT         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status     VARCHAR(12) NOT NULL,
    comment    TEXT        NOT NULL DEFAULT '',
    user_id    INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);
