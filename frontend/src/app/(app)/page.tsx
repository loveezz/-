"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight, Banknote, CheckCircle2, ClipboardList, Clock, MapPin, PackagePlus, Phone, Play, Printer,
  Route as RouteIcon, Truck, XCircle,
} from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBox, Loader, StatCard, StatusBadge } from "@/components/ui";
import { useAuth, isStaff } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { api, errorMessage } from "@/lib/api";
import { dayKey, hours, longDate, money, num, time, date, weight } from "@/lib/format";
import { STATUS } from "@/lib/statuses";
import type { Order, OrderStatus, Page, Stats } from "@/lib/types";

export default function HomePage() {
  const { me } = useAuth();
  if (!me) return null;
  if (me.role === "driver") return <DriverHome name={me.display_name} />;
  if (me.role === "client") return <ClientHome name={me.display_name} />;
  return <StaffHome name={me.role_name} />;
}

function greeting() {
  const h = Number(new Date().toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg", hour: "numeric" }));
  return h < 6 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}

function Bars({ items, unit }: { items: { label: string; value: number; sub?: string }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="truncate text-slate-700">{i.label}</span>
            <span className="ml-3 shrink-0 font-medium text-slate-900">{i.value}{unit}{i.sub && <span className="ml-2 font-normal text-slate-400">{i.sub}</span>}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function WeekChart({ week }: { week: Stats["week"] }) {
  const max = Math.max(1, ...week.map((d) => d.orders));
  return (
    <div className="flex h-44 items-end gap-3">
      {week.map((d, i) => {
        const dt = new Date(d.date + "T12:00:00+05:00");
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-xs font-medium text-slate-600">{d.orders}</span>
            <div className="flex h-32 w-full items-end">
              <div className={i === 0 ? "w-full rounded-t-md bg-brand-600" : "w-full rounded-t-md bg-brand-200"} style={{ height: `${Math.max(4, (d.orders / max) * 100)}%` }} />
            </div>
            <span className="text-xs text-slate-500">{dt.toLocaleDateString("ru-RU", { weekday: "short" })}, {dt.getDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

function StaffHome({ name }: { name: string }) {
  const stats = useApi<Stats>("/stats");
  const today = dayKey(new Date());
  const trips = useApi<Page<Order>>("/orders", { date_from: today, date_to: today, sort: "asc", limit: 10 });
  const router = useRouter();
  if (stats.loading && !stats.data) return <Loader />;
  if (stats.error) return <ErrorBox message={stats.error} onRetry={stats.reload} />;
  const s = stats.data!;
  const statusOrder: OrderStatus[] = ["new", "assigned", "in_transit", "delivered", "cancelled"];
  const totalByStatus = s.by_status.reduce((a, b) => a + b.count, 0) || 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{greeting()}, {name.toLowerCase()}</h1>
          <p className="mt-1 text-sm text-slate-500">Сегодня {longDate(new Date().toISOString())} · транспорт на линии: {s.vehicles_on_line} из {s.vehicles_total}</p>
        </div>
        <Link href="/orders/new"><Button icon={<PackagePlus className="size-4" />} data-new-order>Новая заявка</Button></Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Рейсов сегодня" value={s.orders_today} icon={<Truck className="size-5" />} hint="погрузка в текущие сутки" />
        <StatCard label="Ожидают назначения" value={s.awaiting_assign} tone="sky" icon={<ClipboardList className="size-5" />} hint="заявки без транспорта" />
        <StatCard label="В пути" value={s.in_transit} tone="amber" icon={<RouteIcon className="size-5" />} hint="рейсы выполняются" />
        <StatCard label="Выручка за месяц" value={money(s.revenue_month)} tone="emerald" icon={<Banknote className="size-5" />} hint={`${s.delivered_month} доставок · ${num(s.km_month)} км`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Рейсы на сегодня</h2>
            <Link href={`/orders?date_from=${today}&date_to=${today}`} className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
              Все заявки <ArrowRight className="size-4" />
            </Link>
          </div>
          {trips.loading ? <Loader /> : !trips.data?.items.length ? (
            <EmptyState title="На сегодня рейсов нет" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {trips.data.items.map((o) => (
                <li key={o.id} onClick={() => router.push(`/orders/${o.id}`)} className="flex cursor-pointer items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                  <span className="w-12 text-sm font-semibold text-slate-900">{time(o.starts_at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">№{o.id} · {o.from_city} → {o.to_city}</p>
                    <p className="truncate text-xs text-slate-500">{o.client_name} · {o.cargo_type_name}, {weight(o.weight_kg)}</p>
                  </div>
                  <span className="hidden text-xs text-slate-500 md:block">{o.vehicle_plate ?? "транспорт не назначен"}</span>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-5 font-semibold text-slate-900">Загрузка на неделю</h2>
          <WeekChart week={s.week} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-5 font-semibold text-slate-900">Популярные маршруты</h2>
          <Bars items={s.top_routes.map((r) => ({ label: r.name, value: r.count, sub: money(r.sum) }))} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-5 font-semibold text-slate-900">Заявки по статусам</h2>
          <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {statusOrder.map((st) => {
              const c = s.by_status.find((b) => b.name === st)?.count ?? 0;
              return <div key={st} className={STATUS[st].dot} style={{ width: `${(c / totalByStatus) * 100}%` }} />;
            })}
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {statusOrder.map((st) => {
              const b = s.by_status.find((x) => x.name === st);
              return (
                <li key={st} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-600"><span className={`size-2 rounded-full ${STATUS[st].dot}`} />{STATUS[st].label}</span>
                  <span className="font-medium text-slate-900">{b?.count ?? 0}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function DriverHome({ name }: { name: string }) {
  const stats = useApi<Stats>("/stats");
  const trips = useApi<Page<Order>>("/orders", { status: "assigned,in_transit", sort: "asc", limit: 20 });
  const [confirm, setConfirm] = useState<{ order: Order; status: OrderStatus } | null>(null);
  const [busy, setBusy] = useState(false);

  async function change() {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.post(`/orders/${confirm.order.id}/status`, { status: confirm.status });
      toast.success(confirm.status === "in_transit" ? "Рейс начат" : "Доставка подтверждена");
      setConfirm(null);
      trips.reload();
      stats.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const current = trips.data?.items.find((o) => o.status === "in_transit");
  const upcoming = trips.data?.items.filter((o) => o.status === "assigned") ?? [];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{greeting()}, {name.split(" ")[1]}</h1>
        <p className="mt-1 text-sm text-slate-500">Ваши рейсы и отметки о выполнении</p>
      </div>
      {stats.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Рейсов сегодня" value={stats.data.orders_today} icon={<Truck className="size-5" />} />
          <StatCard label="Доставок за месяц" value={stats.data.delivered_month} tone="emerald" icon={<CheckCircle2 className="size-5" />} />
          <StatCard label="Пробег с грузом за месяц" value={num(stats.data.km_month) + " км"} tone="amber" icon={<RouteIcon className="size-5" />} />
        </div>
      )}

      {trips.loading ? <Loader /> : (
        <>
          <h2 className="mb-3 mt-8 font-semibold text-slate-900">Текущий рейс</h2>
          {current ? (
            <Card className="border-amber-200 p-6" data-current-trip>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold text-slate-900">{current.from_city} → {current.to_city}</h3>
                    <StatusBadge status={current.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Заявка №{current.id} · {current.vehicle_plate} {current.vehicle_model}</p>
                </div>
                <Button variant="accent" icon={<CheckCircle2 className="size-4" />} onClick={() => setConfirm({ order: current, status: "delivered" })} data-delivered>
                  Груз доставлен
                </Button>
              </div>
              <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                <div><p className="text-slate-400">Погрузка</p><p className="font-medium text-slate-800">{date(current.starts_at)} в {time(current.starts_at)}</p><p className="text-slate-500">{current.pickup_address}</p></div>
                <div><p className="text-slate-400">Выгрузка (план)</p><p className="font-medium text-slate-800">{date(current.ends_at)} в {time(current.ends_at)}</p><p className="text-slate-500">{current.delivery_address}</p></div>
                <div><p className="text-slate-400">Груз</p><p className="font-medium text-slate-800">{current.cargo_description}</p><p className="text-slate-500">{weight(current.weight_kg)}, {num(current.volume_m3, 1)} м³</p></div>
              </div>
            </Card>
          ) : (
            <Card><EmptyState title="Сейчас вы не в рейсе" hint="Нажмите «Начать рейс» у ближайшей заявки, когда груз будет принят" /></Card>
          )}

          <h2 className="mb-3 mt-8 font-semibold text-slate-900">Предстоящие рейсы</h2>
          <Card>
            {!upcoming.length ? <EmptyState title="Назначенных рейсов нет" /> : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((o, idx) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="w-28">
                      <p className="text-sm font-semibold text-slate-900">{date(o.starts_at)}</p>
                      <p className="text-xs text-slate-500">{time(o.starts_at)} · {hours(o.ends_at ? (new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime()) / 3.6e6 : 0)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">№{o.id} · {o.from_city} → {o.to_city} · {num(o.distance_km)} км</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3" /> {o.pickup_address}</p>
                    </div>
                    <Badge>{o.vehicle_plate}</Badge>
                    <span className="flex items-center gap-1 text-xs text-slate-500"><Phone className="size-3" />{o.client_phone}</span>
                    <Button size="sm" variant={idx === 0 ? "primary" : "secondary"} icon={<Play className="size-4" />} onClick={() => setConfirm({ order: o, status: "in_transit" })} data-start={o.id}>
                      Начать рейс
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.status === "in_transit" ? "Начать рейс?" : "Подтвердить доставку?"}
        text={confirm?.status === "in_transit"
          ? `Подтвердите, что груз по заявке №${confirm?.order.id} принят и вы выезжаете.`
          : `Подтвердите, что груз по заявке №${confirm?.order.id} передан получателю.`}
        confirmText="Подтвердить"
        loading={busy}
        onConfirm={change}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function ClientHome({ name }: { name: string }) {
  const stats = useApi<Stats>("/stats");
  const orders = useApi<Page<Order>>("/orders", { limit: 8 });
  const [cancel, setCancel] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  async function doCancel() {
    if (!cancel) return;
    setBusy(true);
    try {
      await api.post(`/orders/${cancel.id}/status`, { status: "cancelled", comment: "Отменена клиентом" });
      toast.success("Заявка отменена");
      setCancel(null);
      orders.reload();
      stats.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const active = stats.data ? stats.data.by_status.filter((b) => ["new", "assigned", "in_transit"].includes(b.name)).reduce((a, b) => a + b.count, 0) : 0;
  const total = stats.data ? stats.data.by_status.filter((b) => b.name !== "cancelled").reduce((a, b) => a + b.sum, 0) : 0;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Личный кабинет</h1>
          <p className="mt-1 text-sm text-slate-500">{name}</p>
        </div>
        <Link href="/orders/new"><Button size="lg" icon={<PackagePlus className="size-5" />} data-new-order>Оформить заявку</Button></Link>
      </div>
      {stats.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Заявки в работе" value={active} icon={<Clock className="size-5" />} />
          <StatCard label="Доставлено за месяц" value={stats.data.delivered_month} tone="emerald" icon={<CheckCircle2 className="size-5" />} />
          <StatCard label="Сумма перевозок" value={money(total)} tone="amber" icon={<Banknote className="size-5" />} hint="без учёта отменённых" />
        </div>
      )}
      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Мои заявки</h2>
          <Link href="/orders" className="flex items-center gap-1 text-sm text-brand-600 hover:underline" data-my-orders>Все заявки <ArrowRight className="size-4" /></Link>
        </div>
        {orders.loading ? <Loader /> : !orders.data?.items.length ? (
          <EmptyState title="Заявок пока нет" hint="Оформите первую заявку — стоимость рассчитается автоматически" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.data.items.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="w-28">
                  <p className="text-sm font-semibold text-slate-900">№{o.id}</p>
                  <p className="text-xs text-slate-500">{date(o.starts_at)}, {time(o.starts_at)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{o.from_city} → {o.to_city}</p>
                  <p className="truncate text-xs text-slate-500">{o.cargo_description} · {weight(o.weight_kg)}</p>
                </div>
                <span className="w-24 text-right text-sm font-semibold text-slate-900">{money(o.cost)}</span>
                <span className="w-28"><StatusBadge status={o.status} /></span>
                <div className="flex w-56 justify-end gap-2">
                  <Link href={`/orders/${o.id}/print`} target="_blank"><Button size="sm" variant="secondary" icon={<Printer className="size-4" />} data-print={o.id}>Заявка</Button></Link>
                  {o.status === "new" && (
                    <Button size="sm" variant="ghost" className="text-red-600" icon={<XCircle className="size-4" />} onClick={() => setCancel(o)} data-cancel={o.id}>Отменить</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfirmDialog
        open={!!cancel} danger title="Отменить заявку?" confirmText="Отменить заявку" loading={busy}
        text={`Заявка №${cancel?.id} будет отменена. Отменить можно только заявку, на которую ещё не назначен транспорт.`}
        onConfirm={doCancel} onClose={() => setCancel(null)}
      />
    </div>
  );
}
