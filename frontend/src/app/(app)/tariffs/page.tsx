"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Sigma, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, Field, Input, Loader, Modal, PageHeader, RowMenu, Select, Textarea, Td, Th } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { api, ApiError, errorMessage } from "@/lib/api";
import { money, num, coef } from "@/lib/format";
import type { BodyType, CargoType, Tariff } from "@/lib/types";

function TariffForm({ t, bodies, open, onClose, onSaved }: { t: Tariff | null; bodies: BodyType[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const empty = { name: "", body_type_id: "", base_price: "0", price_per_km: "", min_price: "0", is_active: true };
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) { setErrors({}); setF(t ? { name: t.name, body_type_id: String(t.body_type_id), base_price: String(t.base_price), price_per_km: String(t.price_per_km), min_price: String(t.min_price), is_active: t.is_active } : empty); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, t]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const body = { ...f, body_type_id: Number(f.body_type_id), base_price: Number(f.base_price), price_per_km: Number(f.price_per_km.replace(",", ".")), min_price: Number(f.min_price) };
    try {
      if (t) await api.put(`/tariffs/${t.id}`, body); else await api.post("/tariffs", body);
      toast.success("Тариф сохранён"); onSaved();
    } catch (e) { if (e instanceof ApiError) { setErrors(e.fields); toast.error(e.message); } }
  }
  return (
    <Modal open={open} onClose={onClose} title={t ? "Редактирование тарифа" : "Новый тариф"} subtitle="Для каждого типа кузова действует один тариф"
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button onClick={save}>Сохранить</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" required error={errors.name} className="sm:col-span-2"><Input value={f.name} onChange={set("name")} invalid={!!errors.name} /></Field>
        <Field label="Тип кузова" required error={errors.body_type_id}>
          <Select value={f.body_type_id} onChange={set("body_type_id")} invalid={!!errors.body_type_id}><option value="">Выберите…</option>{bodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        </Field>
        <Field label="Цена за километр, ₽" required error={errors.price_per_km}><Input value={f.price_per_km} onChange={set("price_per_km")} invalid={!!errors.price_per_km} /></Field>
        <Field label="Подача машины, ₽" error={errors.base_price}><Input value={f.base_price} onChange={set("base_price")} invalid={!!errors.base_price} /></Field>
        <Field label="Минимальная стоимость, ₽" error={errors.min_price}><Input value={f.min_price} onChange={set("min_price")} invalid={!!errors.min_price} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-4 accent-brand-600" />Тариф действует</label>
      </div>
    </Modal>
  );
}

function CargoForm({ c, bodies, open, onClose, onSaved }: { c: CargoType | null; bodies: BodyType[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const empty = { code: "", name: "", coefficient: "1", body_type_id: "", description: "" };
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) { setErrors({}); setF(c ? { code: c.code, name: c.name, coefficient: String(c.coefficient), body_type_id: c.body_type_id ? String(c.body_type_id) : "", description: c.description } : empty); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, c]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const body = { ...f, coefficient: Number(f.coefficient.replace(",", ".")), body_type_id: f.body_type_id ? Number(f.body_type_id) : null };
    try {
      if (c) await api.put(`/cargo-types/${c.id}`, body); else await api.post("/cargo-types", body);
      toast.success("Тип груза сохранён"); onSaved();
    } catch (e) { if (e instanceof ApiError) { setErrors(e.fields); toast.error(e.message); } }
  }
  return (
    <Modal open={open} onClose={onClose} title={c ? "Редактирование типа груза" : "Новый тип груза"}
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button onClick={save}>Сохранить</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Код" required error={errors.code}><Input value={f.code} onChange={set("code")} invalid={!!errors.code} /></Field>
        <Field label="Коэффициент стоимости" required error={errors.coefficient} hint="от 0,5 до 5"><Input value={f.coefficient} onChange={set("coefficient")} invalid={!!errors.coefficient} /></Field>
        <Field label="Название" required error={errors.name} className="sm:col-span-2"><Input value={f.name} onChange={set("name")} invalid={!!errors.name} /></Field>
        <Field label="Требуемый тип кузова" className="sm:col-span-2">
          <Select value={f.body_type_id} onChange={set("body_type_id")}><option value="">Любой</option>{bodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        </Field>
        <Field label="Описание" className="sm:col-span-2"><Textarea rows={2} value={f.description} onChange={set("description")} /></Field>
      </div>
    </Modal>
  );
}

export default function TariffsPage() {
  const { me } = useAuth();
  const admin = me?.role === "admin";
  const tariffs = useApi<Tariff[]>("/tariffs");
  const cargo = useApi<CargoType[]>("/cargo-types");
  const bodies = useApi<BodyType[]>("/body-types");
  const [tf, setTf] = useState<{ open: boolean; t: Tariff | null }>({ open: false, t: null });
  const [cf, setCf] = useState<{ open: boolean; c: CargoType | null }>({ open: false, c: null });
  const [del, setDel] = useState<{ path: string; name: string } | null>(null);

  async function remove() {
    if (!del) return;
    try { await api.del(del.path); toast.success("Запись удалена"); setDel(null); tariffs.reload(); cargo.reload(); }
    catch (e) { toast.error(errorMessage(e)); setDel(null); }
  }

  return (
    <div>
      <PageHeader title="Тарифы и типы груза" subtitle="Справочники, по которым рассчитывается стоимость перевозки" />
      <Card className="mb-6 flex items-center gap-4 border-brand-200 bg-brand-50/50 p-5" data-formula>
        <span className="rounded-xl bg-white p-3 text-brand-600 shadow-sm"><Sigma className="size-6" /></span>
        <div>
          <p className="text-lg font-semibold tracking-wide text-slate-900">С = max(Смин; (Сподачи + L × Скм) × Кгруза)</p>
          <p className="text-sm text-slate-600">L — расстояние маршрута, Скм и Сподачи — по тарифу типа кузова, Кгруза — коэффициент типа груза, Смин — минимальная стоимость заказа</p>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Тарифы по типам кузова</h2>
          {admin && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setTf({ open: true, t: null })}>Новый тариф</Button>}
        </div>
        {!tariffs.data ? <Loader /> : (
          <table className="w-full" data-tariffs>
            <thead className="bg-slate-50/60"><tr><Th>Тариф</Th><Th>Тип кузова</Th><Th className="text-right">Подача машины</Th><Th className="text-right">Цена за км</Th><Th className="text-right">Минимальная стоимость</Th><Th>Состояние</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {tariffs.data.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <Td className="font-medium text-slate-900">{t.name}</Td><Td>{t.body_type_name}</Td>
                  <Td className="text-right">{money(t.base_price)}</Td><Td className="text-right font-semibold">{num(t.price_per_km)} ₽</Td><Td className="text-right">{money(t.min_price)}</Td>
                  <Td>{t.is_active ? <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">действует</Badge> : <Badge>архив</Badge>}</Td>
                  <Td className="w-12">{admin && <RowMenu items={[
                    { label: "Изменить", icon: <Pencil className="size-4" />, onClick: () => setTf({ open: true, t }) },
                    { label: "Удалить", icon: <Trash2 className="size-4" />, danger: true, onClick: () => setDel({ path: `/tariffs/${t.id}`, name: t.name }) },
                  ]} />}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Типы груза</h2>
          {admin && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCf({ open: true, c: null })}>Новый тип груза</Button>}
        </div>
        {!cargo.data ? <Loader /> : (
          <table className="w-full" data-cargo>
            <thead className="bg-slate-50/60"><tr><Th>Код</Th><Th>Тип груза</Th><Th className="text-center">Коэффициент</Th><Th>Требуемый кузов</Th><Th>Описание</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {cargo.data.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <Td className="font-mono text-[13px] text-slate-500">{c.code}</Td><Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td className="text-center"><Badge className={c.coefficient > 1.4 ? "bg-accent-50 text-accent-600 ring-orange-200" : "bg-brand-50 text-brand-700 ring-brand-200"}>×{coef(c.coefficient)}</Badge></Td>
                  <Td>{c.body_type_name || <span className="text-slate-400">любой</span>}</Td><Td className="max-w-[320px] text-slate-500">{c.description}</Td>
                  <Td className="w-12">{admin && <RowMenu items={[
                    { label: "Изменить", icon: <Pencil className="size-4" />, onClick: () => setCf({ open: true, c }) },
                    { label: "Удалить", icon: <Trash2 className="size-4" />, danger: true, onClick: () => setDel({ path: `/cargo-types/${c.id}`, name: c.name }) },
                  ]} />}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <TariffForm open={tf.open} t={tf.t} bodies={bodies.data ?? []} onClose={() => setTf({ open: false, t: null })} onSaved={() => { setTf({ open: false, t: null }); tariffs.reload(); }} />
      <CargoForm open={cf.open} c={cf.c} bodies={bodies.data ?? []} onClose={() => setCf({ open: false, c: null })} onSaved={() => { setCf({ open: false, c: null }); cargo.reload(); }} />
      <ConfirmDialog open={!!del} danger title="Удалить запись?" confirmText="Удалить" text={`«${del?.name}» будет удалён. Если запись используется в заявках, удаление будет отклонено.`} onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}
