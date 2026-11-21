"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Calculator, PackagePlus } from "lucide-react";
import { Button, Card, Field, PageHeader, Select } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api, ApiError } from "@/lib/api";
import { hours, money, num, coef } from "@/lib/format";
import type { BodyType, CargoType, Quote, Route } from "@/lib/types";

// Расчёт стоимости перевозки по расстоянию маршрута и типу груза.
export default function CalculatorPage() {
  const routes = useApi<Route[]>("/routes");
  const cargo = useApi<CargoType[]>("/cargo-types");
  const bodies = useApi<BodyType[]>("/body-types");
  const [routeId, setRouteId] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [bodyId, setBodyId] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [compare, setCompare] = useState<{ body: BodyType; q: Quote | null; err?: string }[]>([]);
  const selCargo = cargo.data?.find((c) => String(c.id) === cargoId);

  useEffect(() => { if (selCargo?.body_type_id) setBodyId(String(selCargo.body_type_id)); }, [selCargo]);

  useEffect(() => {
    setQuote(null); setError("");
    if (!routeId || !cargoId || !bodyId) return;
    api.post<Quote>("/orders/quote", { route_id: Number(routeId), cargo_type_id: Number(cargoId), body_type_id: Number(bodyId) })
      .then(setQuote).catch((e) => setError(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : ""));
  }, [routeId, cargoId, bodyId]);

  // Сравнение стоимости по всем допустимым типам кузова
  useEffect(() => {
    if (!routeId || !cargoId || !bodies.data) { setCompare([]); return; }
    Promise.all(bodies.data.map((b) => api.post<Quote>("/orders/quote", { route_id: Number(routeId), cargo_type_id: Number(cargoId), body_type_id: b.id })
      .then((q) => ({ body: b, q })).catch((e) => ({ body: b, q: null, err: e instanceof ApiError ? "не подходит" : "" }))))
      .then(setCompare);
  }, [routeId, cargoId, bodies.data]);

  const route = routes.data?.find((r) => String(r.id) === routeId);
  const best = Math.min(...compare.filter((c) => c.q).map((c) => c.q!.total));
  return (
    <div>
      <PageHeader title="Расчёт стоимости перевозки" subtitle="Стоимость зависит от расстояния маршрута, тарифа типа кузова и коэффициента типа груза" />
      <div className="grid items-start gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="space-y-4 p-6" data-calc-form>
          <Field label="Маршрут" required>
            <Select value={routeId} onChange={(e) => setRouteId(e.target.value)} data-field="route">
              <option value="">Выберите маршрут…</option>
              {routes.data?.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.from_city} — {r.to_city} ({num(r.distance_km)} км)</option>)}
            </Select>
          </Field>
          <Field label="Тип груза" required hint={selCargo ? `Коэффициент ×${coef(selCargo.coefficient)}${selCargo.body_type_name ? ` · только кузов «${selCargo.body_type_name}»` : ""}` : undefined}>
            <Select value={cargoId} onChange={(e) => setCargoId(e.target.value)} data-field="cargo">
              <option value="">Выберите тип груза…</option>
              {cargo.data?.map((c) => <option key={c.id} value={c.id}>{c.name} (×{coef(c.coefficient)})</option>)}
            </Select>
          </Field>
          <Field label="Тип кузова" required error={error}>
            <Select value={bodyId} onChange={(e) => setBodyId(e.target.value)} invalid={!!error} data-field="body">
              <option value="">Выберите тип кузова…</option>
              {bodies.data?.map((b) => <option key={b.id} value={b.id} disabled={!!selCargo?.body_type_id && selCargo.body_type_id !== b.id}>{b.name}</option>)}
            </Select>
          </Field>
          {route && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Расстояние {num(route.distance_km)} км, время в пути {hours(route.duration_hours)}</p>}
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden" data-calc-result>
            <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
              <Calculator className="size-5 text-brand-600" />
              <h2 className="font-semibold text-slate-900">Результат расчёта</h2>
            </div>
            {!quote ? <p className="px-6 py-10 text-center text-sm text-slate-400">Выберите маршрут, тип груза и тип кузова</p> : (
              <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto]">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <tr><td className="py-2 text-slate-500">Тариф</td><td className="py-2 text-right font-medium">{quote.tariff_name}</td></tr>
                    <tr><td className="py-2 text-slate-500">Подача машины, Сподачи</td><td className="py-2 text-right">{money(quote.base_price)}</td></tr>
                    <tr><td className="py-2 text-slate-500">Пробег, L × Скм = {num(quote.distance_km)} × {num(quote.price_per_km)}</td><td className="py-2 text-right">{money(quote.distance_cost)}</td></tr>
                    <tr><td className="py-2 text-slate-500">Коэффициент груза, Кгруза</td><td className="py-2 text-right">× {coef(quote.coefficient)}</td></tr>
                    <tr><td className="py-2 text-slate-500">({num(quote.base_price)} + {num(quote.distance_cost)}) × {coef(quote.coefficient)}</td><td className="py-2 text-right">{money(quote.subtotal)}</td></tr>
                    <tr><td className="py-2 text-slate-500">Минимальная стоимость, Смин</td><td className="py-2 text-right">{money(quote.min_price)}</td></tr>
                  </tbody>
                </table>
                <div className="flex min-w-[220px] flex-col items-center justify-center rounded-2xl bg-brand-900 px-6 py-6 text-center text-white">
                  <p className="text-xs uppercase tracking-wide text-brand-200">Стоимость перевозки</p>
                  <p className="mt-2 text-3xl font-semibold">{money(quote.total)}</p>
                  {quote.min_applied && <p className="mt-1 text-xs text-accent-500">применена минимальная стоимость</p>}
                  <p className="mt-1 text-xs text-brand-200">{num(quote.total / quote.distance_km, 1)} ₽ за км</p>
                  <Link href="/orders/new" className="mt-4"><Button variant="accent" size="sm" icon={<PackagePlus className="size-4" />}>Оформить заявку</Button></Link>
                </div>
              </div>
            )}
          </Card>
          {compare.length > 0 && (
            <Card className="p-6" data-compare>
              <h2 className="mb-4 font-semibold text-slate-900">Сравнение по типам кузова</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {compare.map(({ body, q }) => (
                  <button key={body.id} disabled={!q} onClick={() => setBodyId(String(body.id))}
                    className={clsx("rounded-xl border p-4 text-left transition", String(body.id) === bodyId ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300", !q && "cursor-not-allowed opacity-45")}>
                    <p className="text-sm font-medium text-slate-800">{body.name}</p>
                    {q ? <p className="mt-1 text-lg font-semibold text-slate-900">{money(q.total)}</p> : <p className="mt-1 text-sm text-slate-400">не подходит для груза</p>}
                    {q && q.total === best && <p className="text-xs font-medium text-emerald-600">выгоднее всего</p>}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
