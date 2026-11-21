"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Ban, Pencil, Trash2, UserPlus } from "lucide-react";
import { Avatar, Badge, Button, Card, ConfirmDialog, ErrorBox, Field, Input, Loader, Modal, PageHeader, RowMenu, Select, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api, ApiError, errorMessage } from "@/lib/api";
import { date, initials } from "@/lib/format";
import { isEmail, isLogin, isPassword } from "@/lib/validate";
import type { Client, Driver, Page, Role, User } from "@/lib/types";

const ROLES: { v: Role; t: string; d: string }[] = [
  { v: "admin", t: "Администратор", d: "справочники, транспорт, пользователи" },
  { v: "dispatcher", t: "Диспетчер", d: "клиенты, заявки, назначение рейсов" },
  { v: "driver", t: "Водитель", d: "свои рейсы и отметки о выполнении" },
  { v: "client", t: "Клиент", d: "свои заявки и расчёт стоимости" },
];
const ROLE_CLS: Record<Role, string> = {
  admin: "bg-rose-50 text-rose-700 ring-rose-200", dispatcher: "bg-brand-50 text-brand-700 ring-brand-200",
  driver: "bg-amber-50 text-amber-700 ring-amber-200", client: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function UserForm({ user, open, onClose, onSaved }: { user: User | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const empty = { login: "", password: "", role: "dispatcher" as Role, email: "", is_active: true, driver_id: "", client_id: "" };
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const drivers = useApi<Driver[]>(open ? "/drivers" : null);
  const clients = useApi<Page<Client>>(open ? "/clients" : null, { limit: 100 });
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(user ? { login: user.login, password: "", role: user.role, email: user.email, is_active: user.is_active, driver_id: user.driver_id ? String(user.driver_id) : "", client_id: user.client_id ? String(user.client_id) : "" } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  async function save() {
    const e: Record<string, string> = {};
    if (!isLogin(f.login)) e.login = "Латиница, цифры, _ . -, от 3 до 50 символов";
    if ((!user || f.password) && !isPassword(f.password)) e.password = "Не короче 8 символов, буквы и цифры";
    if (f.role === "driver" && !f.driver_id) e.driver_id = "Выберите водителя";
    if (f.role === "client" && !f.client_id) e.client_id = "Выберите клиента";
    if (f.email && !isEmail(f.email)) e.email = "Некорректный e-mail";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = { ...f, driver_id: f.role === "driver" ? Number(f.driver_id) : null, client_id: f.role === "client" ? Number(f.client_id) : null };
    try {
      if (user) await api.put(`/users/${user.id}`, body); else await api.post("/users", body);
      toast.success(user ? "Учётная запись изменена" : "Учётная запись создана");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); toast.error(err.message); }
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-2xl" title={user ? "Изменение учётной записи" : "Новый пользователь"}
      subtitle={user ? "При смене роли, пароля или блокировке активные сеансы пользователя завершаются" : "Сотрудник сможет войти в систему с указанными логином и паролем"}
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={busy} onClick={save} data-save>Сохранить</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Логин" required error={errors.login}><Input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} invalid={!!errors.login} data-field="login" /></Field>
          <Field label={user ? "Новый пароль" : "Пароль"} required={!user} error={errors.password} hint={user ? "оставьте пустым, чтобы не менять" : "от 8 символов, буквы и цифры"}>
            <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} invalid={!!errors.password} data-field="password" />
          </Field>
        </div>
        <div data-field="role">
          <p className="mb-2 text-sm font-medium text-slate-700">Роль <span className="text-red-500">*</span></p>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <button key={r.v} type="button" onClick={() => setF({ ...f, role: r.v })} data-role={r.v}
                className={clsx("rounded-xl border px-4 py-3 text-left transition", f.role === r.v ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200")}>
                <span className="block text-sm font-medium text-slate-900">{r.t}</span>
                <span className="text-xs text-slate-500">{r.d}</span>
              </button>
            ))}
          </div>
        </div>
        {f.role === "driver" && (
          <Field label="Водитель" required error={errors.driver_id} hint="учётная запись будет связана с карточкой водителя">
            <Select value={f.driver_id} onChange={(e) => setF({ ...f, driver_id: e.target.value })} invalid={!!errors.driver_id} data-field="driver">
              <option value="">Выберите водителя…</option>
              {drivers.data?.filter((d) => !d.user_login || d.id === user?.driver_id).map((d) => <option key={d.id} value={d.id}>{d.last_name} {d.first_name} {d.middle_name}</option>)}
            </Select>
          </Field>
        )}
        {f.role === "client" && (
          <Field label="Клиент" required error={errors.client_id}>
            <Select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} invalid={!!errors.client_id}>
              <option value="">Выберите клиента…</option>
              {clients.data?.items.filter((c) => !c.has_account || c.id === user?.client_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail" error={errors.email}><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} invalid={!!errors.email} /></Field>
          {user && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-4 accent-brand-600" /> Учётная запись активна
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const list = useApi<User[]>("/users");
  const [edit, setEdit] = useState<{ open: boolean; u: User | null }>({ open: false, u: null });
  const [del, setDel] = useState<User | null>(null);

  async function remove() {
    if (!del) return;
    try { await api.del(`/users/${del.id}`); toast.success("Учётная запись удалена"); setDel(null); list.reload(); }
    catch (e) { toast.error(errorMessage(e)); setDel(null); }
  }

  return (
    <div>
      <PageHeader title="Пользователи" subtitle="Учётные записи сотрудников и клиентов, роли и доступ"
        actions={<Button icon={<UserPlus className="size-4" />} onClick={() => setEdit({ open: true, u: null })} data-new-user>Новый пользователь</Button>} />
      <Card>
        {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data ? <Loader /> : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><Th>Пользователь</Th><Th>Роль</Th><Th>Связан с</Th><Th>E-mail</Th><Th>Создан</Th><Th>Состояние</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <Td><div className="flex items-center gap-3"><Avatar text={initials(u.login)} /><span className="font-mono text-[13px] font-medium text-slate-900">{u.login}</span></div></Td>
                  <Td><Badge className={ROLE_CLS[u.role]}>{u.role_name}</Badge></Td>
                  <Td>{u.linked_to ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-slate-500">{u.email || "—"}</Td>
                  <Td className="text-slate-500">{date(u.created_at)}</Td>
                  <Td>{u.is_active ? <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">активна</Badge> : <Badge className="bg-red-50 text-red-700 ring-red-200"><Ban className="size-3" />заблокирована</Badge>}</Td>
                  <Td className="w-12"><RowMenu items={[
                    { label: "Изменить", icon: <Pencil className="size-4" />, onClick: () => setEdit({ open: true, u }) },
                    { label: "Удалить", icon: <Trash2 className="size-4" />, danger: true, onClick: () => setDel(u) },
                  ]} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <UserForm open={edit.open} user={edit.u} onClose={() => setEdit({ open: false, u: null })} onSaved={() => { setEdit({ open: false, u: null }); list.reload(); }} />
      <ConfirmDialog open={!!del} danger title="Удалить учётную запись?" confirmText="Удалить" text={`Пользователь «${del?.login}» больше не сможет войти в систему. Данные водителя или клиента сохранятся.`} onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}
