// Типы данных, получаемых от API.
export type Role = "admin" | "dispatcher" | "driver" | "client";
export type OrderStatus = "new" | "assigned" | "in_transit" | "delivered" | "cancelled";

export interface Me {
  user_id: number;
  login: string;
  role: Role;
  role_name: string;
  display_name: string;
  driver_id?: number;
  client_id?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  sum?: number;
}

export interface Client {
  id: number;
  client_type: "P" | "C";
  name: string;
  inn: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  orders_count: number;
  has_account: boolean;
  created_at: string;
}

export interface BodyType { id: number; code: string; name: string }

export interface CargoType {
  id: number;
  code: string;
  name: string;
  coefficient: number;
  body_type_id: number | null;
  body_type_name: string;
  description: string;
}

export interface Tariff {
  id: number;
  name: string;
  body_type_id: number;
  body_type_name: string;
  base_price: number;
  price_per_km: number;
  min_price: number;
  is_active: boolean;
}

export interface City { id: number; name: string; region: string }

export interface Route {
  id: number;
  code: string;
  from_city_id: number;
  from_city: string;
  to_city_id: number;
  to_city: string;
  distance_km: number;
  duration_hours: number;
  is_active: boolean;
  orders_count: number;
}

export interface Quote {
  route_id: number;
  route_name: string;
  distance_km: number;
  duration_hours: number;
  cargo_type_name: string;
  coefficient: number;
  body_type_id: number;
  body_type_name: string;
  tariff_name: string;
  base_price: number;
  price_per_km: number;
  min_price: number;
  distance_cost: number;
  subtotal: number;
  total: number;
  min_applied: boolean;
}

export interface OrderEvent {
  status: OrderStatus;
  comment: string;
  user_login: string | null;
  created_at: string;
}

export interface Order {
  id: number;
  client_id: number;
  client_name: string;
  client_phone: string;
  client_inn: string;
  route_id: number;
  route_code: string;
  from_city: string;
  to_city: string;
  cargo_type_id: number;
  cargo_type_name: string;
  coefficient: number;
  tariff_id: number;
  tariff_name: string;
  body_type_id: number;
  body_type_name: string;
  base_price: number;
  price_per_km: number;
  min_price: number;
  cargo_description: string;
  weight_kg: number;
  volume_m3: number;
  pickup_address: string;
  delivery_address: string;
  starts_at: string;
  ends_at: string;
  distance_km: number;
  cost: number;
  status: OrderStatus;
  vehicle_id: number | null;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  driver_id: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  created_at: string;
  events?: OrderEvent[];
}

export interface Candidate {
  id: number;
  title: string;
  subtitle: string;
  busy: boolean;
  busy_with?: string;
  suitable: boolean;
  reason?: string;
}

export interface Vehicle {
  id: number;
  reg_number: string;
  model: string;
  body_type_id: number;
  body_type_name: string;
  capacity_kg: number;
  volume_m3: number;
  license_category: "B" | "C" | "CE";
  year: number;
  status: "active" | "repair" | "inactive";
  trips_count: number;
  current_trip: string | null;
}

export interface Driver {
  id: number;
  last_name: string;
  first_name: string;
  middle_name: string;
  license_number: string;
  license_categories: string[];
  phone: string;
  hire_date: string;
  is_active: boolean;
  user_login: string | null;
  trips_count: number;
  next_trip: string | null;
}

export interface User {
  id: number;
  login: string;
  role: Role;
  role_name: string;
  email: string;
  is_active: boolean;
  driver_id: number | null;
  client_id: number | null;
  linked_to: string | null;
  created_at: string;
}

export interface NamedCount { name: string; count: number; sum: number }

export interface Stats {
  orders_today: number;
  awaiting_assign: number;
  in_transit: number;
  delivered_month: number;
  revenue_month: number;
  km_month: number;
  vehicles_on_line: number;
  vehicles_total: number;
  week: { date: string; orders: number }[];
  by_status: NamedCount[];
  top_routes: NamedCount[];
  by_cargo: NamedCount[];
}
