"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Building2, ClipboardList, PackagePlus, Pencil, Search, Trash2, User, UserPlus } from "lucide-react";
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBox, Field, Input, Loader, Modal, PageHeader,
  Pagination, RowMenu, Select, Td, Th,
} from "@/components/ui";
import { useApi, useDebounced } from "@/lib/hooks";
import { api, ApiError, errorMessage } from "@/lib/api";
import { initials, maskPhone } from "@/lib/format";
import { isEmail, isINN, isPhone } from "@/lib/validate";
import type { Client, Page } from "@/lib/types";

const LIMIT = 10;
const EMPTY = { client_type: "C" as "P" | "C", name: "", inn: "", contact_person: "", phone: "", email: "", address: "" };

function ClientForm({ client, open, onClose, onSaved }: { client: Client | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setF(client ? { client_type: client.client_type, name: client.name, inn: client.inn, contact_person: client.contact_person, phone: client.phone, email: client.email, address: client.address } : EMPTY);
      setErrors({});
    }
  }, [open, client]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const company = f.client_type === "C";

  async function save() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Заполните поле";
    if (company && !f.inn) e.inn = "Для организации ИНН обязателен";
    else if (f.inn && !isINN(f.inn)) e.inn = "Неверный ИНН: не сходится контрольная сумма";
    if (!isPhone(f.phone)) e.phone = "Введите телефон полностью";
    if (f.email && !isEmail(f.email)) e.email = "Некорректный e-mail";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (client) await api.put(`/clients/${client.id}`, f);
      else await api.post("/clients", f);
      toast.success(client ? "Данные клиента сохранены" : "Клиент добавлен");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); toast.error(err.message); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-2xl" title={client ? "Редактирование клиента" : "Новый клиент"}
      subtitle="Поля, отмеченные *, обязательны"
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={busy} onClick={save} data-save>{client ? "Сохранить" : "Добавить клиента"}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3" data-field="client_type">
          {[{ v: "C", t: "Организация / ИП", icon: Building2 }, { v: "P", t: "Частное лицо", icon: User }].map((o) => (
            <button key={o.v} type="button" onClick={() => setF({ ...f, client_type: o.v as "P" | "C" })}
              className={clsx("flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition", f.client_type === o.v ? "border-brand-500 bg-brand-50 font-medium text-brand-700 ring-2 ring-brand-100" : "border-slate-200 text-slate-600")}>
              <o.icon className="size-4" />{o.t}
            </button>
          ))}
        </div>
        <Field label={company ? "Наименование организации" : "Фамилия, имя, отчество"} required error={errors.name}>
          <Input value={f.name} onChange={set("name")} invalid={!!errors.name} placeholder={company ? "ООО «Название»" : "Иванов Иван Иванович"} data-field="name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ИНН" required={company} error={errors.inn} hint={`${f.inn.length} из ${company ? 10 : 12} цифр, проверяется контрольная сумма`}>
            <Input value={f.inn} inputMode="numeric" onChange={(e) => setF({ ...f, inn: e.target.value.replace(/\D/g, "").slice(0, 12) })} invalid={!!errors.inn} data-field="inn" />
          </Field>
          <Field label="Телефон" required error={errors.phone}>
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} invalid={!!errors.phone} placeholder="+7 (___) ___-__-__" data-field="phone" />
          </Field>
          {company && (
            <Field label="Контактное лицо">
              <Input value={f.contact_person} onChange={set("contact_person")} data-field="contact" />
            </Field>
          )}
          <Field label="E-mail" error={errors.email}>
            <Input value={f.email} onChange={set("email")} invalid={!!errors.email} data-field="email" />
          </Field>
        </div>
        <Field label="Адрес">
          <Input value={f.address} onChange={set("address")} data-field="address" />
        </Field>
      </div>
    </Modal>
  );
}

function ClientsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useApi<Page<Client>>("/clients", { q: dq, type, page, limit: LIMIT });
  const [edit, setEdit] = useState<{ open: boolean; client: Client | null }>({ open: sp.get("new") === "1", client: null });
  const [del, setDel] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPage(1), [dq, type]);

  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      await api.del(`/clients/${del.id}`);
      toast.success("Клиент удалён");
      setDel(null);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Клиенты" subtitle={list.data ? `Всего клиентов: ${list.data.total}` : " "}
        actions={<Button icon={<UserPlus className="size-4" />} onClick={() => setEdit({ open: true, client: null })} data-new-client>Новый клиент</Button>} />
      <Card className="mb-4 flex flex-wrap gap-3 p-4">
        <div className="min-w-[280px] flex-1" data-search>
          <Input icon={<Search className="size-4" />} placeholder="Наименование, ФИО, ИНН или телефон" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-56" data-type-filter>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Все клиенты</option>
            <option value="C">Организации и ИП</option>
            <option value="P">Частные лица</option>
          </Select>
        </div>
      </Card>
      <Card>
        {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Loader /> :
          !list.data?.items.length ? <EmptyState title="Клиенты не найдены" hint="Измените условия поиска или добавьте нового клиента" /> : (
            <>
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr><Th>Клиент</Th><Th>ИНН</Th><Th>Контакты</Th><Th>Адрес</Th><Th className="text-center">Заявок</Th><Th /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.items.map((c) => (
                    <tr key={c.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => router.push(`/orders?client_id=${c.id}`)} data-row={c.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar text={initials(c.name)} />
                          <div>
                            <p className="font-medium text-slate-900">{c.name}</p>
                            <p className="flex items-center gap-2 text-xs text-slate-500">
                              {c.client_type === "C" ? "Организация" : "Частное лицо"}
                              {c.has_account && <Badge className="bg-brand-50 text-brand-700 ring-brand-200">личный кабинет</Badge>}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="font-mono text-[13px]">{c.inn || "—"}</Td>
                      <Td><p>{c.phone}</p><p className="text-xs text-slate-500">{c.contact_person || c.email}</p></Td>
                      <Td className="max-w-[240px] truncate text-slate-500">{c.address || "—"}</Td>
                      <Td className="text-center font-medium">{c.orders_count}</Td>
                      <Td className="w-12">
                        <RowMenu items={[
                          { label: "Оформить заявку", icon: <PackagePlus className="size-4" />, onClick: () => router.push(`/orders/new?client_id=${c.id}`) },
                          { label: "Заявки клиента", icon: <ClipboardList className="size-4" />, onClick: () => router.push(`/orders?client_id=${c.id}`) },
                          { label: "Изменить", icon: <Pencil className="size-4" />, onClick: () => setEdit({ open: true, client: c }) },
                          { label: "Удалить", icon: <Trash2 className="size-4" />, danger: true, onClick: () => setDel(c) },
                        ]} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} total={list.data.total} limit={LIMIT} onChange={setPage} />
            </>
          )}
      </Card>
      <ClientForm open={edit.open} client={edit.client} onClose={() => setEdit({ open: false, client: null })} onSaved={() => { setEdit({ open: false, client: null }); list.reload(); }} />
      <ConfirmDialog open={!!del} danger title="Удалить клиента?" confirmText="Удалить" loading={busy}
        text={`Клиент «${del?.name}» и все его заявки (${del?.orders_count ?? 0}) будут удалены. Клиента с рейсами в работе удалить нельзя.`}
        onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}

export default function Page() {
  return <Suspense><ClientsPage /></Suspense>;
}
