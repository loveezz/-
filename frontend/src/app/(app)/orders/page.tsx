"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, FilterX, PackagePlus, Printer, Search, Trash2, Truck, XCircle } from "lucide-react";
import {
  Button, Card, ConfirmDialog, EmptyState, ErrorBox, Input, Loader, PageHeader, Pagination, RowMenu, Select,
  StatusBadge, Td, Th,
} from "@/components/ui";
import { useAuth, isStaff } from "@/lib/auth";
import { useApi, useDebounced } from "@/lib/hooks";
import { api, errorMessage } from "@/lib/api";
import { date, dayKey, money, num, shortName, time, weight } from "@/lib/format";
import { STATUS } from "@/lib/statuses";
import type { Client, Driver, Order, OrderStatus, Page, Route } from "@/lib/types";

const LIMIT = 10;

function addDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

function OrdersPage() {
  const { me } = useAuth();
  const staff = isStaff(me?.role);
  const router = useRouter();
  const sp = useSearchParams();
  const [f, setF] = useState({
    q: sp.get("q") ?? "",
    client_id: sp.get("client_id") ?? "",
    route_id: sp.get("route_id") ?? "",
    driver_id: sp.get("driver_id") ?? "",
    status: sp.get("status") ?? "",
    date_from: sp.get("date_from") ?? "",
    date_to: sp.get("date_to") ?? "",
  });
  const [page, setPage] = useState(1);
  const q = useDebounced(f.q);
  const query = { ...f, q, page, limit: LIMIT };
  const orders = useApi<Page<Order> & { sum: number }>("/orders", query);
  const clients = useApi<Page<Client>>(staff ? "/clients" : null, { limit: 100 });
  const drivers = useApi<Driver[]>(staff ? "/drivers" : null);
  const routes = useApi<Route[]>("/routes");
  const [confirm, setConfirm] = useState<{ order: Order; action: "cancel" | "delete" } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setPage(1), [q, f.client_id, f.route_id, f.driver_id, f.status, f.date_from, f.date_to]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const period = (from: number, to: number) => setF({ ...f, date_from: addDays(from), date_to: addDays(to) });
  const activePeriod = (from: number, to: number) => f.date_from === addDays(from) && f.date_to === addDays(to);
  const hasFilters = Object.values(f).some(Boolean);

  async function run() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === "cancel") {
        await api.post(`/orders/${confirm.order.id}/status`, { status: "cancelled" });
        toast.success(`Заявка №${confirm.order.id} отменена`);
      } else {
        await api.del(`/orders/${confirm.order.id}`);
        toast.success(`Заявка №${confirm.order.id} удалена`);
      }
      setConfirm(null);
      orders.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={me?.role === "client" ? "Мои заявки" : me?.role === "driver" ? "История рейсов" : "Заявки на перевозку"}
        subtitle={orders.data ? `Найдено: ${orders.data.total} · на сумму ${money(orders.data.sum)}` : " "}
        actions={me?.role !== "driver" && (
          <Link href="/orders/new"><Button icon={<PackagePlus className="size-4" />}>Новая заявка</Button></Link>
        )}
      />

      <Card className="mb-4 p-4" data-filters>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div data-filter="q">
            <Input icon={<Search className="size-4" />} placeholder="№ заявки, клиент, ИНН или груз" value={f.q} onChange={set("q")} />
          </div>
          {staff && (
            <div data-filter="client">
              <Select value={f.client_id} onChange={set("client_id")}>
                <option value="">Все клиенты</option>
                {clients.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          )}
          <div data-filter="route">
            <Select value={f.route_id} onChange={set("route_id")}>
              <option value="">Все маршруты</option>
              {routes.data?.map((r) => <option key={r.id} value={r.id}>{r.from_city} — {r.to_city}</option>)}
            </Select>
          </div>
          {staff && (
            <div data-filter="driver">
              <Select value={f.driver_id} onChange={set("driver_id")}>
                <option value="">Все водители</option>
                {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.last_name} {d.first_name[0]}. {d.middle_name[0]}.</option>)}
              </Select>
            </div>
          )}
          <div data-filter="status">
            <Select value={f.status} onChange={set("status")}>
              <option value="">Все статусы</option>
              {(Object.keys(STATUS) as OrderStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-2" data-filter="dates">
            <Input type="date" value={f.date_from} onChange={set("date_from")} aria-label="Дата с" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={f.date_to} onChange={set("date_to")} aria-label="Дата по" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-filter="periods">
          {[
            { t: "Сегодня", a: 0, b: 0 },
            { t: "Завтра", a: 1, b: 1 },
            { t: "7 дней", a: 0, b: 6 },
            { t: "Прошедшие 30 дней", a: -30, b: 0 },
          ].map((p) => (
            <Button key={p.t} size="sm" variant={activePeriod(p.a, p.b) ? "primary" : "secondary"} onClick={() => period(p.a, p.b)}>{p.t}</Button>
          ))}
          {hasFilters && (
            <Button size="sm" variant="ghost" icon={<FilterX className="size-4" />} onClick={() => setF({ q: "", client_id: "", route_id: "", driver_id: "", status: "", date_from: "", date_to: "" })}>
              Сбросить фильтры
            </Button>
          )}
        </div>
      </Card>

      <Card>
        {orders.error ? <ErrorBox message={orders.error} onRetry={orders.reload} /> :
          orders.loading && !orders.data ? <Loader /> :
          !orders.data?.items.length ? (
            <EmptyState title="Заявки не найдены" hint="Измените условия поиска или сбросьте фильтры" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-100 bg-slate-50/60">
                    <tr>
                      <Th>№</Th><Th>Погрузка</Th>{me?.role !== "client" && <Th>Клиент</Th>}<Th>Маршрут</Th><Th>Груз</Th>
                      <Th>Транспорт</Th><Th className="text-right">Стоимость</Th><Th>Статус</Th><Th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.data.items.map((o) => (
                      <tr key={o.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => router.push(`/orders/${o.id}`)} data-row={o.id}>
                        <Td className="font-semibold text-slate-900">{o.id}</Td>
                        <Td><p className="whitespace-nowrap font-medium text-slate-800">{date(o.starts_at)}</p><p className="text-xs text-slate-500">{time(o.starts_at)}</p></Td>
                        {me?.role !== "client" && <Td><p className="max-w-[190px] truncate font-medium text-slate-800">{o.client_name}</p><p className="text-xs text-slate-500">{o.client_phone}</p></Td>}
                        <Td><p className="whitespace-nowrap text-slate-800">{o.from_city} → {o.to_city}</p><p className="text-xs text-slate-500">{num(o.distance_km)} км</p></Td>
                        <Td><p className="max-w-[170px] truncate text-slate-800">{o.cargo_type_name}</p><p className="whitespace-nowrap text-xs text-slate-500">{weight(o.weight_kg)} · {num(o.volume_m3, 1)} м³</p></Td>
                        <Td>
                          {o.vehicle_plate ? (
                            <><p className="whitespace-nowrap text-slate-800">{o.vehicle_plate}</p><p className="whitespace-nowrap text-xs text-slate-500">{shortName(o.driver_name ?? "")}</p></>
                          ) : <span className="text-xs text-slate-400">не назначены</span>}
                        </Td>
                        <Td className="whitespace-nowrap text-right font-semibold text-slate-900">{money(o.cost)}</Td>
                        <Td className="whitespace-nowrap"><StatusBadge status={o.status} /></Td>
                        <Td className="w-12">
                          <RowMenu items={[
                            { label: "Открыть заявку", icon: <Eye className="size-4" />, onClick: () => router.push(`/orders/${o.id}`) },
                            { label: "Назначить транспорт", icon: <Truck className="size-4" />, hidden: !staff || o.status !== "new", onClick: () => router.push(`/orders/${o.id}?assign=1`) },
                            { label: "Печать заявки", icon: <Printer className="size-4" />, onClick: () => window.open(`/orders/${o.id}/print`, "_blank") },
                            { label: "Отменить заявку", icon: <XCircle className="size-4" />, danger: true, hidden: !(o.status === "new" && me?.role !== "driver") && !(staff && o.status === "assigned"), onClick: () => setConfirm({ order: o, action: "cancel" }) },
                            { label: "Удалить", icon: <Trash2 className="size-4" />, danger: true, hidden: !staff || !["new", "cancelled"].includes(o.status), onClick: () => setConfirm({ order: o, action: "delete" }) },
                          ]} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={orders.data.total} limit={LIMIT} onChange={setPage} />
            </>
          )}
      </Card>

      <ConfirmDialog
        open={!!confirm} danger loading={busy}
        title={confirm?.action === "delete" ? "Удалить заявку?" : "Отменить заявку?"}
        confirmText={confirm?.action === "delete" ? "Удалить" : "Отменить заявку"}
        text={confirm?.action === "delete"
          ? `Заявка №${confirm?.order.id} и её история будут удалены без возможности восстановления.`
          : `Заявка №${confirm?.order.id} (${confirm?.order.from_city} → ${confirm?.order.to_city}) будет отменена, назначенные транспорт и водитель освободятся.`}
        onConfirm={run} onClose={() => setConfirm(null)}
      />
    </div>
  );
}

export default function Page() {
  return <Suspense><OrdersPage /></Suspense>;
}
