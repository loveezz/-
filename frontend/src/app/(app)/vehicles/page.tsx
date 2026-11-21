"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Gauge, Navigation, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";
import { Badge, Button, Card, Chip, ConfirmDialog, EmptyState, ErrorBox, Field, Input, Loader, Modal, PageHeader, RowMenu, Select } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useApi, useDebounced } from "@/lib/hooks";
import { api, ApiError, errorMessage } from "@/lib/api";
import { num } from "@/lib/format";
import { VEHICLE_STATUS } from "@/lib/statuses";
import { isPlate, normalizePlate } from "@/lib/validate";
import type { BodyType, Vehicle } from "@/lib/types";

const EMPTY = { reg_number: "", model: "", body_type_id: "", capacity_kg: "", volume_m3: "", license_category: "C", year: String(new Date().getFullYear()), status: "active" };

function Plate({ value }: { value: string }) {
  const m = value.match(/^(\D)(\d{3})(\D{2})(\d{2,3})$/);
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-md border-2 border-slate-800 bg-white font-mono text-[15px] font-semibold text-slate-900">
      <span className="px-2 py-0.5 tracking-wider">{m ? `${m[1]} ${m[2]} ${m[3]}` : value}</span>
      {m && <span className="flex items-center border-l-2 border-slate-800 px-1.5 text-xs">{m[4]}</span>}
    </span>
  );
}

function VehicleForm({ vehicle, bodies, open, onClose, onSaved }: { vehicle: Vehicle | null; bodies: BodyType[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(vehicle ? {
      reg_number: vehicle.reg_number, model: vehicle.model, body_type_id: String(vehicle.body_type_id), capacity_kg: String(vehicle.capacity_kg),
      volume_m3: String(vehicle.volume_m3), license_category: vehicle.license_category, year: String(vehicle.year), status: vehicle.status,
    } : EMPTY);
  }, [open, vehicle]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const e: Record<string, string> = {};
    const plate = normalizePlate(f.reg_number);
    if (!isPlate(plate)) e.reg_number = "Формат: А123ВС96 или А123ВС196";
    if (!f.model.trim()) e.model = "Укажите марку и модель";
    if (!f.body_type_id) e.body_type_id = "Выберите тип кузова";
    if (!(Number(f.capacity_kg) >= 100)) e.capacity_kg = "От 100 до 50 000 кг";
    if (!(Number(f.volume_m3) > 0)) e.volume_m3 = "Укажите объём";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = { ...f, reg_number: plate, body_type_id: Number(f.body_type_id), capacity_kg: Number(f.capacity_kg), volume_m3: Number(f.volume_m3.replace(",", ".")), year: Number(f.year) };
    try {
      if (vehicle) await api.put(`/vehicles/${vehicle.id}`, body);
      else await api.post("/vehicles", body);
      toast.success(vehicle ? "Данные транспорта сохранены" : "Транспорт добавлен");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-2xl" title={vehicle ? "Редактирование транспорта" : "Новое транспортное средство"}
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={busy} onClick={save} data-save>Сохранить</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Госномер" required error={errors.reg_number} hint="латинские буквы заменяются автоматически">
          <Input value={f.reg_number} onChange={(e) => setF({ ...f, reg_number: normalizePlate(e.target.value).slice(0, 9) })} invalid={!!errors.reg_number} placeholder="А123ВС196" data-field="reg" />
        </Field>
        <Field label="Марка и модель" required error={errors.model}>
          <Input value={f.model} onChange={set("model")} invalid={!!errors.model} data-field="model" />
        </Field>
        <Field label="Тип кузова" required error={errors.body_type_id}>
          <Select value={f.body_type_id} onChange={set("body_type_id")} invalid={!!errors.body_type_id} data-field="body">
            <option value="">Выберите…</option>
            {bodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Категория прав" required>
          <Select value={f.license_category} onChange={set("license_category")}>
            <option value="B">B — до 3,5 т</option><option value="C">C — грузовой</option><option value="CE">CE — с прицепом</option>
          </Select>
        </Field>
        <Field label="Грузоподъёмность, кг" required error={errors.capacity_kg}>
          <Input inputMode="numeric" value={f.capacity_kg} onChange={(e) => setF({ ...f, capacity_kg: e.target.value.replace(/\D/g, "") })} invalid={!!errors.capacity_kg} data-field="capacity" />
        </Field>
        <Field label="Объём кузова, м³" required error={errors.volume_m3}>
          <Input inputMode="decimal" value={f.volume_m3} onChange={set("volume_m3")} invalid={!!errors.volume_m3} data-field="volume" />
        </Field>
        <Field label="Год выпуска" error={errors.year}>
          <Input inputMode="numeric" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
        </Field>
        <Field label="Состояние">
          <Select value={f.status} onChange={set("status")}>
            <option value="active">На линии</option><option value="repair">В ремонте</option><option value="inactive">Списан</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export default function VehiclesPage() {
  const { me } = useAuth();
  const admin = me?.role === "admin";
  const bodies = useApi<BodyType[]>("/body-types");
  const [body, setBody] = useState(0);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const list = useApi<Vehicle[]>("/vehicles", { body_type_id: body || undefined, q: dq });
  const [edit, setEdit] = useState<{ open: boolean; v: Vehicle | null }>({ open: false, v: null });
  const [del, setDel] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await api.del(`/vehicles/${del.id}`); toast.success("Транспорт удалён"); setDel(null); list.reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  const onLine = list.data?.filter((v) => v.status === "active").length ?? 0;
  return (
    <div>
      <PageHeader title="Транспорт" subtitle={list.data ? `В парке: ${list.data.length} · на линии: ${onLine}` : " "}
        actions={admin && <Button icon={<Plus className="size-4" />} onClick={() => setEdit({ open: true, v: null })} data-new-vehicle>Добавить транспорт</Button>} />
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="w-64" data-search><Input icon={<Search className="size-4" />} placeholder="Госномер или модель" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="flex flex-wrap gap-2" data-body-filter>
          <Chip active={body === 0} onClick={() => setBody(0)}>Все кузова</Chip>
          {bodies.data?.map((b) => <Chip key={b.id} active={body === b.id} onClick={() => setBody(b.id)}>{b.name}</Chip>)}
        </div>
      </Card>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Loader /> :
        !list.data?.length ? <Card><EmptyState title="Транспорт не найден" /></Card> : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {list.data.map((v) => (
              <Card key={v.id} className={clsx("p-5", v.status !== "active" && "bg-slate-50/80")} data-vehicle={v.reg_number}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Plate value={v.reg_number} />
                    <p className="mt-2 font-semibold text-slate-900">{v.model}</p>
                    <p className="text-sm text-slate-500">{v.body_type_name} · {v.year} г.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className={VEHICLE_STATUS[v.status].cls}>{VEHICLE_STATUS[v.status].label}</Badge>
                    {admin && <RowMenu items={[
                      { label: "Изменить", icon: <Pencil className="size-4" />, onClick: () => setEdit({ open: true, v }) },
                      { label: "Удалить", icon: <Trash2 className="size-4" />, danger: true, onClick: () => setDel(v) },
                    ]} />}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 py-2"><p className="text-xs text-slate-400">Грузоподъёмность</p><p className="text-sm font-semibold text-slate-800">{num(v.capacity_kg / 1000, 1)} т</p></div>
                  <div className="rounded-lg bg-slate-50 py-2"><p className="text-xs text-slate-400">Объём</p><p className="text-sm font-semibold text-slate-800">{num(v.volume_m3, 1)} м³</p></div>
                  <div className="rounded-lg bg-slate-50 py-2"><p className="text-xs text-slate-400">Категория</p><p className="text-sm font-semibold text-slate-800">{v.license_category}</p></div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Gauge className="size-3.5" />Рейсов: {v.trips_count}</span>
                  {v.current_trip ? <span className="flex items-center gap-1 font-medium text-amber-700"><Navigation className="size-3.5" />в пути: {v.current_trip}</span> :
                    <span className="flex items-center gap-1"><Truck className="size-3.5" />{v.status === "active" ? "свободен" : "не используется"}</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      <VehicleForm open={edit.open} vehicle={edit.v} bodies={bodies.data ?? []} onClose={() => setEdit({ open: false, v: null })} onSaved={() => { setEdit({ open: false, v: null }); list.reload(); }} />
      <ConfirmDialog open={!!del} danger title="Удалить транспорт?" confirmText="Удалить" loading={busy}
        text={`Транспорт ${del?.reg_number} будет удалён. Если он участвовал в рейсах, удаление будет отклонено — установите состояние «Списан».`}
        onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}
