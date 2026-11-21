"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import { CheckCircle2, CircleCheck, PackageCheck, Printer, Search, Truck, X } from "lucide-react";
import { Avatar, Button, Card, Chip, Field, Input, Modal, Textarea } from "@/components/ui";
import { useAuth, isStaff } from "@/lib/auth";
import { useApi, useDebounced } from "@/lib/hooks";
import { api, ApiError } from "@/lib/api";
import { dayKey, hours, initials, money, num, toIso, date, time, coef } from "@/lib/format";
import type { BodyType, CargoType, Client, Order, Page, Quote, Route, Tariff } from "@/lib/types";

const TIMES = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

function Step({ n, title, done, children, id }: { n: number; title: string; done: boolean; children: React.ReactNode; id: string }) {
  return (
    <Card className="p-6" data-step={id}>
      <div className="mb-4 flex items-center gap-3">
        {done ? <CircleCheck className="size-7 text-brand-600" /> : (
          <span className="flex size-7 items-center justify-center rounded-full border-2 border-slate-300 text-sm font-semibold text-slate-500">{n}</span>
        )}
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function NewOrder() {
  const { me } = useAuth();
  const staff = isStaff(me?.role);
  const router = useRouter();
  const sp = useSearchParams();
  const routes = useApi<Route[]>("/routes");
  const cargo = useApi<CargoType[]>("/cargo-types");
  const bodies = useApi<BodyType[]>("/body-types");
  const tariffs = useApi<Tariff[]>("/tariffs");

  const [client, setClient] = useState<Client | null>(null);
  const [clientQ, setClientQ] = useState("");
  const dq = useDebounced(clientQ, 250);
  const found = useApi<Page<Client>>(staff && dq.length > 0 && !client ? "/clients" : null, { q: dq, limit: 6 });
  const [origin, setOrigin] = useState<number | null>(null);
  const [routeId, setRouteId] = useState<number | null>(null);
  const [cargoId, setCargoId] = useState<number | null>(null);
  const [bodyId, setBodyId] = useState<number | null>(null);
  const [desc, setDesc] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [volume, setVolume] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [hhmm, setHhmm] = useState<string | null>(null);
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Order | null>(null);

  // Предвыбор клиента из параметра ?client_id
  useEffect(() => {
    const id = sp.get("client_id");
    if (staff && id) api.get<Client>(`/clients/${id}`).then(setClient).catch(() => {});
  }, [sp, staff]);

  const origins = useMemo(() => {
    const m = new Map<number, string>();
    routes.data?.filter((r) => r.is_active).forEach((r) => m.set(r.from_city_id, r.from_city));
    return [...m.entries()];
  }, [routes.data]);
  useEffect(() => { if (origin === null && origins.length) setOrigin(origins[0][0]); }, [origins, origin]);

  const selectedRoute = routes.data?.find((r) => r.id === routeId);
  const selectedCargo = cargo.data?.find((c) => c.id === cargoId);
  const requiredBody = selectedCargo?.body_type_id ?? null;
  useEffect(() => { if (requiredBody) setBodyId(requiredBody); }, [requiredBody]);

  // Предварительный расчёт стоимости при изменении маршрута, груза или кузова
  useEffect(() => {
    if (!routeId || !cargoId || !bodyId) { setQuote(null); return; }
    let alive = true;
    api.post<Quote>("/orders/quote", { route_id: routeId, cargo_type_id: cargoId, body_type_id: bodyId })
      .then((q) => { if (alive) { setQuote(q); setQuoteErr(""); } })
      .catch((e) => { if (alive) { setQuote(null); setQuoteErr(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : ""); } });
    return () => { alive = false; };
  }, [routeId, cargoId, bodyId]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const nowHour = Number(new Date().toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg", hour: "numeric" }));
  const today = dayKey(new Date());

  async function submit() {
    const e: Record<string, string> = {};
    if (staff && !client) e.client_id = "Выберите клиента";
    if (!routeId) e.route_id = "Выберите маршрут";
    if (!cargoId) e.cargo_type_id = "Выберите тип груза";
    if (!bodyId) e.body_type_id = "Выберите тип кузова";
    if (!desc.trim()) e.cargo_description = "Опишите груз";
    if (!(Number(weightKg) > 0)) e.weight_kg = "Укажите массу груза";
    if (!(Number(volume) > 0)) e.volume_m3 = "Укажите объём";
    if (!day || !hhmm) e.starts_at = "Выберите дату и время погрузки";
    if (!pickup.trim()) e.pickup_address = "Укажите адрес погрузки";
    if (!delivery.trim()) e.delivery_address = "Укажите адрес выгрузки";
    setErrors(e);
    if (Object.keys(e).length) { toast.error("Заполните обязательные поля"); return; }
    setBusy(true);
    try {
      const o = await api.post<Order>("/orders", {
        client_id: client?.id ?? 0, route_id: routeId, cargo_type_id: cargoId, body_type_id: bodyId,
        cargo_description: desc, weight_kg: Number(weightKg), volume_m3: Number(volume.replace(",", ".")),
        pickup_address: pickup, delivery_address: delivery, starts_at: toIso(day!, hhmm!),
      });
      setCreated(o);
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  const tariffFor = (bid: number) => tariffs.data?.find((t) => t.body_type_id === bid && t.is_active);
  const routesFrom = routes.data?.filter((r) => r.is_active && r.from_city_id === origin) ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Оформление заявки на перевозку</h1>
        <p className="mt-1 text-sm text-slate-500">Стоимость рассчитывается автоматически по расстоянию маршрута и типу груза</p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {staff && (
            <Step n={1} id="client" title="Клиент" done={!!client}>
              {client ? (
                <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3" data-client-selected>
                  <Avatar text={initials(client.name)} className="bg-white" />
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{client.name}</p>
                    <p className="text-xs text-slate-500">{client.inn ? "ИНН " + client.inn + " · " : ""}{client.phone}</p>
                  </div>
                  <button onClick={() => { setClient(null); setClientQ(""); }} className="text-slate-400 hover:text-slate-600"><X className="size-4" /></button>
                </div>
              ) : (
                <div className="relative">
                  <Input icon={<Search className="size-4" />} placeholder="Наименование, ФИО, ИНН или телефон" value={clientQ} onChange={(e) => setClientQ(e.target.value)} invalid={!!errors.client_id} data-client-search />
                  {errors.client_id && <p className="mt-1 text-xs text-red-600">{errors.client_id}</p>}
                  {found.data && dq && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      {found.data.items.length ? found.data.items.map((c) => (
                        <button key={c.id} onClick={() => setClient(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" data-client-option>
                          <Avatar text={initials(c.name)} className="size-8" />
                          <span><span className="block text-sm font-medium text-slate-800">{c.name}</span><span className="text-xs text-slate-500">{c.inn && "ИНН " + c.inn + " · "}{c.phone}</span></span>
                        </button>
                      )) : <p className="px-3 py-2 text-sm text-slate-500">Клиенты не найдены. <Link href="/clients?new=1" className="text-brand-600 underline">Добавить клиента</Link></p>}
                    </div>
                  )}
                </div>
              )}
            </Step>
          )}

          <Step n={staff ? 2 : 1} id="route" title="Маршрут" done={!!routeId}>
            <div className="mb-4 flex flex-wrap gap-2" data-origins>
              {origins.map(([id, name]) => (
                <Chip key={id} active={origin === id} onClick={() => { setOrigin(id); setRouteId(null); }}>Из г. {name}</Chip>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-routes>
              {routesFrom.map((r) => (
                <button key={r.id} onClick={() => setRouteId(r.id)} data-route={r.code}
                  className={clsx("rounded-xl border p-4 text-left transition", routeId === r.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300")}>
                  <p className="font-medium text-slate-900">→ {r.to_city}</p>
                  <p className="mt-1 text-xs text-slate-500">{num(r.distance_km)} км · в пути {hours(r.duration_hours)}</p>
                </button>
              ))}
            </div>
            {errors.route_id && <p className="mt-2 text-xs text-red-600">{errors.route_id}</p>}
          </Step>

          <Step n={staff ? 3 : 2} id="cargo" title="Груз" done={!!cargoId && Number(weightKg) > 0 && Number(volume) > 0 && !!desc}>
            <div className="flex flex-wrap gap-2" data-cargo-types>
              {cargo.data?.map((c) => (
                <Chip key={c.id} active={cargoId === c.id} onClick={() => setCargoId(c.id)}>
                  {c.name} <span className="text-xs text-slate-400">×{coef(c.coefficient)}</span>
                </Chip>
              ))}
            </div>
            {selectedCargo && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {selectedCargo.description}. Коэффициент стоимости ×{coef(selectedCargo.coefficient)}
                {selectedCargo.body_type_name && <> · требуется кузов «{selectedCargo.body_type_name}»</>}
              </p>
            )}
            {errors.cargo_type_id && <p className="mt-2 text-xs text-red-600">{errors.cargo_type_id}</p>}
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_150px_150px]">
              <Field label="Описание груза" required error={errors.cargo_description}>
                <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Например: сухие смеси на паллетах" invalid={!!errors.cargo_description} data-field="desc" />
              </Field>
              <Field label="Масса, кг" required error={errors.weight_kg}>
                <Input inputMode="numeric" value={weightKg} onChange={(e) => setWeightKg(e.target.value.replace(/\D/g, "").slice(0, 5))} invalid={!!errors.weight_kg} data-field="weight" />
              </Field>
              <Field label="Объём, м³" required error={errors.volume_m3}>
                <Input inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value.replace(/[^\d.,]/g, ""))} invalid={!!errors.volume_m3} data-field="volume" />
              </Field>
            </div>
          </Step>

          <Step n={staff ? 4 : 3} id="body" title="Тип кузова и тариф" done={!!bodyId}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-bodies>
              {bodies.data?.map((b) => {
                const t = tariffFor(b.id);
                const disabled = !!requiredBody && requiredBody !== b.id;
                return (
                  <button key={b.id} disabled={disabled} onClick={() => setBodyId(b.id)} data-body={b.code}
                    className={clsx("rounded-xl border p-4 text-left transition", bodyId === b.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300", disabled && "cursor-not-allowed opacity-40")}>
                    <p className="flex items-center gap-2 font-medium text-slate-900"><Truck className="size-4 text-slate-400" />{b.name}</p>
                    {t && <p className="mt-1 text-xs text-slate-500">{num(t.price_per_km)} ₽/км · подача {money(t.base_price)}</p>}
                  </button>
                );
              })}
            </div>
            {(errors.body_type_id || quoteErr) && <p className="mt-2 text-xs text-red-600">{errors.body_type_id || quoteErr}</p>}
          </Step>

          <Step n={staff ? 5 : 4} id="date" title="Погрузка и выгрузка" done={!!day && !!hhmm && !!pickup && !!delivery}>
            <div className="flex gap-2 overflow-x-auto pb-1" data-days>
              {days.map((d) => {
                const k = dayKey(d);
                const sunday = d.getDay() === 0;
                return (
                  <button key={k} onClick={() => setDay(k)} disabled={sunday} data-day={k}
                    className={clsx("flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 transition",
                      day === k ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 hover:border-slate-300", sunday && "cursor-not-allowed opacity-35")}>
                    <span className={clsx("text-[11px] uppercase", day === k ? "text-brand-100" : "text-slate-400")}>{d.toLocaleDateString("ru-RU", { weekday: "short" })}</span>
                    <span className="text-lg font-semibold">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-7 gap-2" data-times>
              {TIMES.map((t) => {
                const past = day === today && Number(t.slice(0, 2)) <= nowHour;
                return (
                  <button key={t} disabled={!day || past} onClick={() => setHhmm(t)} data-time={t}
                    className={clsx("rounded-lg border py-2 text-sm transition", hhmm === t ? "border-brand-600 bg-brand-600 font-medium text-white" : "border-slate-200 hover:border-slate-300", (!day || past) && "cursor-not-allowed opacity-35 line-through")}>
                    {t}
                  </button>
                );
              })}
            </div>
            {errors.starts_at && <p className="mt-2 text-xs text-red-600">{errors.starts_at}</p>}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Адрес погрузки" required error={errors.pickup_address}>
                <Textarea rows={2} value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder={selectedRoute ? `г. ${selectedRoute.from_city}, улица, дом` : ""} invalid={!!errors.pickup_address} data-field="pickup" />
              </Field>
              <Field label="Адрес выгрузки" required error={errors.delivery_address}>
                <Textarea rows={2} value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder={selectedRoute ? `г. ${selectedRoute.to_city}, улица, дом` : ""} invalid={!!errors.delivery_address} data-field="delivery" />
              </Field>
            </div>
          </Step>
        </div>

        <Card className="sticky top-6 overflow-hidden" data-summary>
          <div className="bg-brand-900 px-5 py-4 text-white">
            <p className="text-xs uppercase tracking-wide text-brand-200">Ваша заявка</p>
            <p className="mt-1 text-lg font-semibold">{selectedRoute ? `${selectedRoute.from_city} → ${selectedRoute.to_city}` : "Маршрут не выбран"}</p>
            {day && hhmm && <p className="text-sm text-brand-100">погрузка {new Date(day + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} в {hhmm}</p>}
          </div>
          <dl className="space-y-3 px-5 py-4 text-sm">
            {staff && <div><dt className="text-slate-400">Клиент</dt><dd className="font-medium text-slate-800">{client?.name ?? "—"}</dd></div>}
            <div><dt className="text-slate-400">Груз</dt><dd className="font-medium text-slate-800">{selectedCargo?.name ?? "—"}{Number(weightKg) > 0 && `, ${num(Number(weightKg))} кг`}</dd></div>
            <div><dt className="text-slate-400">Кузов и тариф</dt><dd className="font-medium text-slate-800">{quote ? `${quote.body_type_name} · «${quote.tariff_name}»` : "—"}</dd></div>
          </dl>
          <div className="border-t border-slate-100 px-5 py-4" data-cost>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Расчёт стоимости</p>
            {quote ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Подача машины</span><span>{money(quote.base_price)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Пробег {num(quote.distance_km)} км × {num(quote.price_per_km)} ₽</span><span>{money(quote.distance_cost)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Коэффициент груза</span><span>×{coef(quote.coefficient)}</span></div>
                {quote.min_applied && <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">Применена минимальная стоимость заказа {money(quote.min_price)}</p>}
                <div className="flex items-end justify-between border-t border-dashed border-slate-200 pt-3">
                  <span className="font-medium text-slate-700">Итого</span>
                  <span className="text-2xl font-semibold text-slate-900">{money(quote.total)}</span>
                </div>
              </div>
            ) : <p className="text-sm text-slate-400">Выберите маршрут, груз и тип кузова</p>}
          </div>
          <div className="px-5 pb-5">
            <Button size="lg" className="w-full" loading={busy} icon={<PackageCheck className="size-5" />} onClick={submit} data-submit>
              Оформить заявку
            </Button>
          </div>
        </Card>
      </div>

      <Modal open={!!created} title="Заявка оформлена" onClose={() => router.push(`/orders/${created?.id}`)} width="max-w-md"
        footer={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.open(`/orders/${created?.id}/print`, "_blank")} data-print>Печать заявки</Button>
            {staff
              ? <Button icon={<Truck className="size-4" />} onClick={() => router.push(`/orders/${created?.id}?assign=1`)} data-assign>Назначить транспорт</Button>
              : <Button onClick={() => router.push("/")}>В личный кабинет</Button>}
          </>
        }>
        {created && (
          <div className="text-center" data-created>
            <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
            <p className="mt-3 text-sm text-slate-500">Номер заявки</p>
            <p className="text-3xl font-semibold text-slate-900">№ {created.id}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-left text-sm">
              <div><p className="text-slate-400">Маршрут</p><p className="font-medium text-slate-800">{created.from_city} → {created.to_city}</p></div>
              <div><p className="text-slate-400">Погрузка</p><p className="font-medium text-slate-800">{date(created.starts_at)}, {time(created.starts_at)}</p></div>
              <div><p className="text-slate-400">Груз</p><p className="font-medium text-slate-800">{created.cargo_type_name}</p></div>
              <div><p className="text-slate-400">Стоимость</p><p className="font-semibold text-brand-700">{money(created.cost)}</p></div>
            </div>
            <p className="mt-4 text-xs text-slate-500">Диспетчер назначит транспорт и водителя; статус заявки отображается в разделе «Заявки».</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function Page() {
  return <Suspense><NewOrder /></Suspense>;
}
