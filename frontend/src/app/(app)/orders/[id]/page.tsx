"use client";
import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, CheckCircle2, Clock, IdCard, MapPin, Package, Phone, Play, Printer, Trash2, Truck,
  Undo2, UserRound, XCircle,
} from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, ErrorBox, Loader, Modal, StatusBadge } from "@/components/ui";
import { useAuth, isStaff } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { api, ApiError, errorMessage } from "@/lib/api";
import { date, dateTime, hours, money, num, time, weight, coef } from "@/lib/format";
import { STATUS } from "@/lib/statuses";
import type { Candidate, Order, OrderStatus } from "@/lib/types";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

function AssignModal({ order, open, onClose, onDone }: { order: Order; open: boolean; onClose: () => void; onDone: () => void }) {
  const cand = useApi<{ vehicles: Candidate[]; drivers: Candidate[] }>(open ? `/orders/${order.id}/candidates` : null);
  const [vehicle, setVehicle] = useState<number | null>(order.vehicle_id);
  const [driver, setDriver] = useState<number | null>(order.driver_id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const vCat = cand.data?.vehicles.find((v) => v.id === vehicle)?.subtitle.match(/кат\. (\w+)/)?.[1];

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      await api.post(`/orders/${order.id}/assign`, { vehicle_id: vehicle ?? 0, driver_id: driver ?? 0 });
      toast.success(`Транспорт и водитель назначены на заявку №${order.id}`);
      onDone();
    } catch (e) {
      if (e instanceof ApiError) { setErrors(e.fields); toast.error(e.message); cand.reload(); }
    } finally {
      setBusy(false);
    }
  }

  const item = (c: Candidate, selected: boolean, disabled: boolean, note: React.ReactNode, onPick: () => void, kind: string) => (
    <button key={c.id} disabled={disabled} onClick={onPick} data-candidate={`${kind}-${c.id}`}
      className={clsx("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition",
        selected ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300",
        disabled && "cursor-not-allowed bg-slate-50 opacity-60")}>
      <span className={clsx("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-brand-600" : "border-slate-300")}>
        {selected && <span className="size-2 rounded-full bg-brand-600" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-800">{c.title}</span>
        <span className="block text-xs text-slate-500">{c.subtitle}</span>
        {note}
      </span>
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} width="max-w-4xl" title={`Назначение транспорта и водителя · заявка №${order.id}`}
      subtitle={`${order.from_city} → ${order.to_city}, ${dateTime(order.starts_at)} – ${dateTime(order.ends_at)} · ${order.body_type_name.toLowerCase()}, ${weight(order.weight_kg)}, ${num(order.volume_m3, 1)} м³`}
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={busy} disabled={!vehicle || !driver} icon={<CheckCircle2 className="size-4" />} onClick={save} data-assign-save>Назначить</Button></>}>
      {cand.loading ? <Loader /> : cand.error ? <ErrorBox message={cand.error} onRetry={cand.reload} /> : (
        <div className="grid gap-6 md:grid-cols-2">
          <div data-vehicles>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Truck className="size-4" />Транспорт</p>
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {cand.data!.vehicles.map((v) => item(v, vehicle === v.id, !v.suitable || v.busy,
                !v.suitable ? <span className="mt-1 block text-xs text-slate-500">Не подходит: {v.reason}</span> :
                  v.busy ? <span className="mt-1 block text-xs text-amber-700">Занят: рейс {v.busy_with}</span> :
                    <span className="mt-1 block text-xs text-emerald-600">Свободен на время рейса</span>,
                () => { setVehicle(v.id); }, "vehicle"))}
            </div>
            {errors.vehicle_id && <p className="mt-2 text-xs text-red-600">{errors.vehicle_id}</p>}
          </div>
          <div data-drivers>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><IdCard className="size-4" />Водитель</p>
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {cand.data!.drivers.map((d) => {
                const noCat = !!vCat && !(d.reason ?? "").split(",").includes(vCat);
                return item(d, driver === d.id, d.busy || noCat,
                  d.busy ? <span className="mt-1 block text-xs text-amber-700">Занят: рейс {d.busy_with}</span> :
                    noCat ? <span className="mt-1 block text-xs text-slate-500">Нет категории «{vCat}» для выбранного транспорта</span> :
                      <span className="mt-1 block text-xs text-emerald-600">Свободен</span>,
                  () => setDriver(d.id), "driver");
              })}
            </div>
            {errors.driver_id && <p className="mt-2 text-xs text-red-600">{errors.driver_id}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function OrderView({ id }: { id: string }) {
  const { me } = useAuth();
  const staff = isStaff(me?.role);
  const router = useRouter();
  const sp = useSearchParams();
  const order = useApi<Order>(`/orders/${id}`);
  const [assign, setAssign] = useState(false);
  const [confirm, setConfirm] = useState<{ status: OrderStatus | "delete"; title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (sp.get("assign") && order.data?.status === "new" && staff) setAssign(true); }, [sp, order.data, staff]);

  if (order.loading && !order.data) return <Loader />;
  if (order.error) return <ErrorBox message={order.error} onRetry={order.reload} />;
  const o = order.data!;
  const distanceCost = o.distance_km * o.price_per_km;
  const raw = (o.base_price + distanceCost) * o.coefficient;
  const own = me?.role === "driver" && me.driver_id === o.driver_id;

  async function run() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.status === "delete") {
        await api.del(`/orders/${o.id}`);
        toast.success("Заявка удалена");
        router.push("/orders");
        return;
      }
      await api.post(`/orders/${o.id}/status`, { status: confirm.status });
      toast.success("Статус заявки: " + STATUS[confirm.status].label.toLowerCase());
      setConfirm(null);
      order.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={() => router.back()} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft className="size-4" />Назад</button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Заявка № {o.id}</h1>
            <StatusBadge status={o.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">Оформлена {dateTime(o.created_at)} · маршрут {o.route_code}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.open(`/orders/${o.id}/print`, "_blank")} data-print>Печать заявки</Button>
          {(own || staff) && o.status === "assigned" && (
            <Button variant="accent" icon={<Play className="size-4" />} onClick={() => setConfirm({ status: "in_transit", title: "Начать рейс?", text: "Груз принят водителем, автомобиль выезжает по маршруту." })} data-start>Начать рейс</Button>
          )}
          {(own || staff) && o.status === "in_transit" && (
            <Button variant="accent" icon={<CheckCircle2 className="size-4" />} onClick={() => setConfirm({ status: "delivered", title: "Подтвердить доставку?", text: "Груз передан получателю, рейс завершён." })} data-delivered>Груз доставлен</Button>
          )}
          {((staff && ["new", "assigned"].includes(o.status)) || (me?.role === "client" && o.status === "new")) && (
            <Button variant="secondary" className="text-red-600" icon={<XCircle className="size-4" />} onClick={() => setConfirm({ status: "cancelled", title: "Отменить заявку?", text: "Заявка будет отменена, назначенные транспорт и водитель освободятся." })} data-cancel>Отменить</Button>
          )}
          {staff && ["new", "cancelled"].includes(o.status) && (
            <Button variant="ghost" className="text-red-600" icon={<Trash2 className="size-4" />} onClick={() => setConfirm({ status: "delete", title: "Удалить заявку?", text: "Заявка и её история будут удалены без возможности восстановления." })}>Удалить</Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-6" data-route-card>
            <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Погрузка</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{o.from_city}</p>
                <p className="text-sm text-slate-700">{date(o.starts_at)}, {time(o.starts_at)}</p>
                <p className="mt-1 flex gap-1 text-xs text-slate-500"><MapPin className="size-3.5 shrink-0" />{o.pickup_address}</p>
              </div>
              <div className="flex flex-col items-center text-xs text-slate-500">
                <span>{num(o.distance_km)} км</span>
                <div className="my-1 h-px w-28 bg-gradient-to-r from-brand-200 via-brand-500 to-brand-200" />
                <span>{hours((new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime()) / 3.6e6)}</span>
              </div>
              <div className="md:text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">Выгрузка (план)</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{o.to_city}</p>
                <p className="text-sm text-slate-700">{date(o.ends_at)}, {time(o.ends_at)}</p>
                <p className="mt-1 flex gap-1 text-xs text-slate-500 md:justify-end"><MapPin className="size-3.5 shrink-0" />{o.delivery_address}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
              <Info label="Груз"><span className="flex items-center gap-1.5"><Package className="size-4 text-slate-400" />{o.cargo_type_name}</span></Info>
              <Info label="Описание">{o.cargo_description}</Info>
              <Info label="Масса и объём">{num(o.weight_kg)} кг · {num(o.volume_m3, 1)} м³</Info>
              <Info label="Тип кузова">{o.body_type_name}</Info>
            </div>
          </Card>

          <Card className="p-6" data-assignment>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Транспорт и водитель</h2>
              {staff && o.status === "assigned" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setAssign(true)} data-reassign>Изменить назначение</Button>
                  <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => setConfirm({ status: "new", title: "Снять назначение?", text: "Транспорт и водитель будут освобождены, заявка вернётся в статус «Новая»." })}>Снять</Button>
                </div>
              )}
            </div>
            {o.vehicle_plate ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                  <span className="rounded-lg bg-white p-2.5 text-brand-600 shadow-sm"><Truck className="size-5" /></span>
                  <div><p className="font-semibold text-slate-900">{o.vehicle_plate}</p><p className="text-sm text-slate-500">{o.vehicle_model}</p></div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                  <span className="rounded-lg bg-white p-2.5 text-brand-600 shadow-sm"><UserRound className="size-5" /></span>
                  <div><p className="font-semibold text-slate-900">{o.driver_name}</p><p className="flex items-center gap-1 text-sm text-slate-500"><Phone className="size-3.5" />{o.driver_phone}</p></div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-sky-300 bg-sky-50/60 px-5 py-4">
                <p className="text-sm text-sky-800">{o.status === "cancelled" ? "Заявка отменена" : "Транспорт и водитель ещё не назначены"}</p>
                {staff && o.status === "new" && (
                  <Button icon={<Truck className="size-4" />} onClick={() => setAssign(true)} data-assign-open>Назначить транспорт и водителя</Button>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6" data-client-card>
            <h2 className="mb-4 font-semibold text-slate-900">Клиент</h2>
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><Building2 className="size-5" /></span>
              <div>
                <p className="font-medium text-slate-900">{o.client_name}</p>
                <p className="text-sm text-slate-500">{o.client_inn && `ИНН ${o.client_inn} · `}{o.client_phone}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6" data-cost-card>
            <h2 className="mb-4 font-semibold text-slate-900">Стоимость перевозки</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Тариф</span><span className="font-medium">{o.tariff_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Подача машины</span><span>{money(o.base_price)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{num(o.distance_km)} км × {num(o.price_per_km)} ₽</span><span>{money(distanceCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Коэффициент «{o.cargo_type_name}»</span><span>×{coef(o.coefficient)}</span></div>
              {Math.round(raw) < o.min_price && <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">Применена минимальная стоимость заказа</p>}
              <div className="flex items-end justify-between border-t border-dashed border-slate-200 pt-3">
                <span className="font-medium text-slate-700">Итого</span>
                <span className="text-2xl font-semibold text-slate-900">{money(o.cost)}</span>
              </div>
            </div>
          </Card>
          <Card className="p-6" data-history>
            <h2 className="mb-4 font-semibold text-slate-900">История заявки</h2>
            <ol className="relative space-y-5 border-l border-slate-200 pl-5">
              {o.events?.map((e, i) => (
                <li key={i} className="relative">
                  <span className={clsx("absolute -left-[26px] top-1 size-3 rounded-full ring-4 ring-white", STATUS[e.status].dot)} />
                  <p className="text-sm font-medium text-slate-800">{e.comment}</p>
                  <p className="flex items-center gap-1 text-xs text-slate-500"><Clock className="size-3" />{dateTime(e.created_at)}{e.user_login && <> · <Badge>{e.user_login}</Badge></>}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {staff && <AssignModal order={o} open={assign} onClose={() => setAssign(false)} onDone={() => { setAssign(false); order.reload(); router.replace(`/orders/${o.id}`); }} />}
      <ConfirmDialog open={!!confirm} title={confirm?.title ?? ""} text={confirm?.text ?? ""} loading={busy}
        danger={confirm?.status === "cancelled" || confirm?.status === "delete"} confirmText="Подтвердить" onConfirm={run} onClose={() => setConfirm(null)} />
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><OrderView id={id} /></Suspense>;
}
