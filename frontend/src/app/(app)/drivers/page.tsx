"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import { ClipboardList, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBox, Field, Input, Loader, Modal, PageHeader, RowMenu, Td, Th } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useApi, useDebounced } from "@/lib/hooks";
import { api, ApiError, errorMessage } from "@/lib/api";
import { date, initials, maskPhone, time } from "@/lib/format";
import { isPhone } from "@/lib/validate";
import type { Driver } from "@/lib/types";

const CATS = [
  { c: "B", d: "легковые и до 3,5 т" },
  { c: "C", d: "грузовые свыше 3,5 т" },
  { c: "CE", d: "грузовые с прицепом" },
];
const EMPTY = { last_name: "", first_name: "", middle_name: "", license_number: "", license_categories: ["B"] as string[], phone: "", hire_date: "", is_active: true };

function experience(hire: string) {
  const y = (Date.now() - new Date(hire).getTime()) / (365.25 * 864e5);
  const n = Math.floor(y);
  if (n < 1) return "менее года";
  const w = n % 10 === 1 && n % 100 !== 11 ? "год" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "года" : "лет";
  return `${n} ${w}`;
}

function DriverForm({ driver, open, onClose, onSaved }: { driver: Driver | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(driver ? { ...driver } : { ...EMPTY, hire_date: new Date().toISOString().slice(0, 10) });
  }, [open, driver]);
  const set = (k: "last_name" | "first_name" | "middle_name" | "hire_date") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (c: string) => setF({ ...f, license_categories: f.license_categories.includes(c) ? f.license_categories.filter((x) => x !== c) : [...f.license_categories, c] });

  async function save() {
    const e: Record<string, string> = {};
    if (!f.last_name.trim()) e.last_name = "Заполните поле";
    if (!f.first_name.trim()) e.first_name = "Заполните поле";
    if (!/^\d{10}$/.test(f.license_number)) e.license_number = "10 цифр: серия и номер";
    if (!f.license_categories.length) e.license_categories = "Отметьте хотя бы одну категорию";
    if (!isPhone(f.phone)) e.phone = "Введите телефон полностью";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (driver) await api.put(`/drivers/${driver.id}`, f);
      else await api.post("/drivers", f);
      toast.success(driver ? "Данные водителя сохранены" : "Водитель добавлен");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-2xl" title={driver ? "Карточка водителя" : "Новый водитель"} subtitle="Категории прав определяют, на какой транспорт можно назначить водителя"
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={busy} onClick={save} data-save>Сохранить</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Фамилия" required error={errors.last_name}><Input value={f.last_name} onChange={set("last_name")} invalid={!!errors.last_name} data-field="last" /></Field>
          <Field label="Имя" required error={errors.first_name}><Input value={f.first_name} onChange={set("first_name")} invalid={!!errors.first_name} data-field="first" /></Field>
          <Field label="Отчество"><Input value={f.middle_name} onChange={set("middle_name")} data-field="middle" /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Водительское удостоверение" required error={errors.license_number} hint={`${f.license_number.length} из 10 цифр`}>
            <Input value={f.license_number} inputMode="numeric" onChange={(e) => setF({ ...f, license_number: e.target.value.replace(/\D/g, "").slice(0, 10) })} invalid={!!errors.license_number} data-field="license" />
          </Field>
          <Field label="Телефон" required error={errors.phone}>
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} invalid={!!errors.phone} placeholder="+7 (___) ___-__-__" data-field="phone" />
          </Field>
          <Field label="Дата приёма на работу" error={errors.hire_date}><Input type="date" value={f.hire_date} onChange={set("hire_date")} /></Field>
        </div>
        <div data-field="categories">
          <p className="mb-2 text-sm font-medium text-slate-700">Категории прав <span className="text-red-500">*</span></p>
          <div className="grid grid-cols-3 gap-3">
            {CATS.map((c) => (
              <button key={c.c} type="button" onClick={() => toggle(c.c)}
                className={clsx("rounded-xl border px-4 py-3 text-left transition", f.license_categories.includes(c.c) ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200")}>
                <span className="block text-lg font-semibold text-slate-900">{c.c}</span>
                <span className="text-xs text-slate-500">{c.d}</span>
              </button>
            ))}
          </div>
          {errors.license_categories && <p className="mt-1 text-xs text-red-600">{errors.license_categories}</p>}
        </div>
        {driver && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-4 accent-brand-600" />
            Водитель работает (может назначаться на рейсы)
          </label>
        )}
      </div>
    </Modal>
  );
}

export default function DriversPage() {
  const { me } = useAuth();
  const admin = me?.role === "admin";
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const list = useApi<Driver[]>("/drivers", { q: dq });
  const [edit, setEdit] = useState<{ open: boolean; d: Driver | null }>({ open: false, d: null });
  const [del, setDel] = useState<Driver | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await api.del(`/drivers/${del.id}`); toast.success("Водитель удалён"); setDel(null); list.reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Водители" subtitle={list.data ? `Всего: ${list.data.length} · работают: ${list.data.filter((d) => d.is_active).length}` : " "}
        actions={admin && <Button icon={<UserPlus className="size-4" />} onClick={() => setEdit({ open: true, d: null })} data-new-driver>Добавить водителя</Button>} />
      <Card className="mb-4 p-4"><div className="w-80" data-search><Input icon={<Search className="size-4" />} placeholder="Поиск по ФИО" value={q} onChange={(e) => setQ(e.target.value)} /></div></Card>
      <Card>
        {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Loader /> :
          !list.data?.length ? <EmptyState title="Водители не найдены" /> : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr><Th>Водитель</Th><Th>Удостоверение</Th><Th>Категории</Th><Th>Стаж в компании</Th><Th>Ближайший рейс</Th><Th className="text-center">Выполнено рейсов</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.map((d) => (
                  <tr key={d.id} className={clsx("hover:bg-slate-50/70", !d.is_active && "opacity-60")} data-row={d.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar text={initials(`${d.last_name} ${d.first_name}`)} />
                        <div>
                          <p className="font-medium text-slate-900">{d.last_name} {d.first_name} {d.middle_name}</p>
                          <p className="text-xs text-slate-500">{d.phone}{d.user_login && <> · вход: <span className="font-mono">{d.user_login}</span></>}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="font-mono text-[13px]">{d.license_number.slice(0, 2)} {d.license_number.slice(2, 4)} {d.license_number.slice(4)}</Td>
                    <Td><div className="flex gap-1">{d.license_categories.map((c) => <Badge key={c} className="bg-brand-50 text-brand-700 ring-brand-200">{c}</Badge>)}</div></Td>
                    <Td>{experience(d.hire_date)}<p className="text-xs text-slate-500">с {date(d.hire_date)}</p></Td>
                    <Td>{d.next_trip ? <>{date(d.next_trip)}<p className="text-xs text-slate-500">{time(d.next_trip)}</p></> : <span className="text-xs text-slate-400">{d.is_active ? "свободен" : "не работает"}</span>}</Td>
                    <Td className="text-center font-medium">{d.trips_count}</Td>
                    <Td className="w-12">
                      <RowMenu items={[
                        { label: "Рейсы водителя", icon: <ClipboardList className="size-4" />, onClick: () => router.push(`/orders?driver_id=${d.id}`) },
                        { label: "Изменить", icon: <Pencil className="size-4" />, hidden: !admin, onClick: () => setEdit({ open: true, d }) },
                        { label: "Удалить", icon: <Trash2 className="size-4" />, danger: true, hidden: !admin, onClick: () => setDel(d) },
                      ]} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>
      <DriverForm open={edit.open} driver={edit.d} onClose={() => setEdit({ open: false, d: null })} onSaved={() => { setEdit({ open: false, d: null }); list.reload(); }} />
      <ConfirmDialog open={!!del} danger title="Удалить водителя?" confirmText="Удалить" loading={busy}
        text={`Водитель ${del?.last_name} ${del?.first_name} будет удалён. Если у него есть рейсы, удаление будет отклонено — снимите отметку «работает».`}
        onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}
