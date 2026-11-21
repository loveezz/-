"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, ClipboardList, MapPinPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, ErrorBox, Field, Input, Loader, Modal, PageHeader, RowMenu, Select, Td, Th } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { api, ApiError, errorMessage } from "@/lib/api";
import { hours, num } from "@/lib/format";
import type { City, Route } from "@/lib/types";

const EMPTY = { code: "", from_city_id: "", to_city_id: "", distance_km: "", duration_hours: "", is_active: true };

function RouteForm({ route, cities, open, onClose, onSaved }: { route: Route | null; cities: City[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(route ? { code: route.code, from_city_id: String(route.from_city_id), to_city_id: String(route.to_city_id), distance_km: String(route.distance_km), duration_hours: String(route.duration_hours), is_active: route.is_active } : EMPTY);
  }, [open, route]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const e: Record<string, string> = {};
    if (!f.code.trim()) e.code = "Укажите код";
    if (!f.from_city_id) e.from_city_id = "Выберите город";
    if (!f.to_city_id) e.to_city_id = "Выберите город";
    if (f.from_city_id && f.from_city_id === f.to_city_id) e.to_city_id = "Города должны различаться";
    if (!(Number(f.distance_km) >= 1)) e.distance_km = "От 1 до 10 000 км";
    if (!(Number(f.duration_hours.replace(",", ".")) > 0)) e.duration_hours = "Укажите время в пути";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = { ...f, from_city_id: Number(f.from_city_id), to_city_id: Number(f.to_city_id), distance_km: Number(f.distance_km), duration_hours: Number(f.duration_hours.replace(",", ".")) };
    try {
      if (route) await api.put(`/routes/${route.id}`, body); else await api.post("/routes", body);
      toast.success("Маршрут сохранён");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); toast.error(err.message); }
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={route ? "Редактирование маршрута" : "Новый маршрут"} subtitle="Расстояние используется при расчёте стоимости, время в пути — для контроля занятости транспорта"
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={busy} onClick={save}>Сохранить</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Пункт отправления" required error={errors.from_city_id}>
          <Select value={f.from_city_id} onChange={set("from_city_id")} invalid={!!errors.from_city_id}>
            <option value="">Выберите…</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Пункт назначения" required error={errors.to_city_id}>
          <Select value={f.to_city_id} onChange={set("to_city_id")} invalid={!!errors.to_city_id}>
            <option value="">Выберите…</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Код маршрута" required error={errors.code} hint="например, EKB-CHL"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} invalid={!!errors.code} /></Field>
        <Field label="Расстояние, км" required error={errors.distance_km}><Input inputMode="numeric" value={f.distance_km} onChange={(e) => setF({ ...f, distance_km: e.target.value.replace(/\D/g, "") })} invalid={!!errors.distance_km} /></Field>
        <Field label="Время в пути, ч" required error={errors.duration_hours}><Input inputMode="decimal" value={f.duration_hours} onChange={set("duration_hours")} invalid={!!errors.duration_hours} /></Field>
        {route && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-4 accent-brand-600" /> Маршрут используется
          </label>
        )}
      </div>
    </Modal>
  );
}

export default function RoutesPage() {
  const { me } = useAuth();
  const admin = me?.role === "admin";
  const router = useRouter();
  const routes = useApi<Route[]>("/routes");
  const cities = useApi<City[]>("/cities");
  const [edit, setEdit] = useState<{ open: boolean; r: Route | null }>({ open: false, r: null });
  const [del, setDel] = useState<Route | null>(null);
  const [city, setCity] = useState<{ open: boolean; name: string; region: string; error?: string }>({ open: false, name: "", region: "" });
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await api.del(`/routes/${del.id}`); toast.success("Маршрут удалён"); setDel(null); routes.reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  async function addCity() {
    if (!city.name.trim()) { setCity({ ...city, error: "Укажите название" }); return; }
    try { await api.post("/cities", { name: city.name, region: city.region }); toast.success("Населённый пункт добавлен"); setCity({ open: false, name: "", region: "" }); cities.reload(); }
    catch (e) { setCity({ ...city, error: errorMessage(e) }); }
  }

  return (
    <div>
      <PageHeader title="Маршруты" subtitle={routes.data ? `Маршрутов: ${routes.data.length} · населённых пунктов: ${cities.data?.length ?? 0}` : " "}
        actions={admin && <>
          <Button variant="secondary" icon={<MapPinPlus className="size-4" />} onClick={() => setCity({ open: true, name: "", region: "" })}>Новый город</Button>
          <Button icon={<Plus className="size-4" />} onClick={() => setEdit({ open: true, r: null })}>Добавить маршрут</Button>
        </>} />
      <Card>
        {routes.error ? <ErrorBox message={routes.error} onRetry={routes.reload} /> : !routes.data ? <Loader /> : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr><Th>Код</Th><Th>Маршрут</Th><Th className="text-right">Расстояние</Th><Th className="text-right">Время в пути</Th><Th className="text-center">Заявок</Th><Th>Состояние</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routes.data.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <Td className="font-mono text-[13px] text-slate-500">{r.code}</Td>
                  <Td><span className="flex items-center gap-2 font-medium text-slate-900">{r.from_city}<ArrowRight className="size-4 text-slate-400" />{r.to_city}</span></Td>
                  <Td className="text-right">{num(r.distance_km)} км</Td>
                  <Td className="text-right">{hours(r.duration_hours)}</Td>
                  <Td className="text-center font-medium">{r.orders_count}</Td>
                  <Td>{r.is_active ? <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">используется</Badge> : <Badge>не используется</Badge>}</Td>
                  <Td className="w-12">
                    <RowMenu items={[
                      { label: "Заявки по маршруту", icon: <ClipboardList className="size-4" />, onClick: () => router.push(`/orders?route_id=${r.id}`) },
                      { label: "Изменить", icon: <Pencil className="size-4" />, hidden: !admin, onClick: () => setEdit({ open: true, r }) },
                      { label: "Удалить", icon: <Trash2 className="size-4" />, danger: true, hidden: !admin, onClick: () => setDel(r) },
                    ]} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <RouteForm open={edit.open} route={edit.r} cities={cities.data ?? []} onClose={() => setEdit({ open: false, r: null })} onSaved={() => { setEdit({ open: false, r: null }); routes.reload(); }} />
      <Modal open={city.open} onClose={() => setCity({ open: false, name: "", region: "" })} title="Новый населённый пункт" width="max-w-md"
        footer={<><Button variant="secondary" onClick={() => setCity({ open: false, name: "", region: "" })}>Отмена</Button><Button onClick={addCity}>Добавить</Button></>}>
        <div className="space-y-4">
          <Field label="Название" required error={city.error}><Input value={city.name} onChange={(e) => setCity({ ...city, name: e.target.value })} /></Field>
          <Field label="Регион"><Input value={city.region} onChange={(e) => setCity({ ...city, region: e.target.value })} placeholder="Свердловская обл." /></Field>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} danger title="Удалить маршрут?" confirmText="Удалить" loading={busy}
        text={`Маршрут ${del?.from_city} — ${del?.to_city} будет удалён. Если по нему есть заявки, удаление будет отклонено — отключите маршрут.`}
        onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}
