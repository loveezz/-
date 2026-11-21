"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, User, UserPlus } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Button, Card, Field, Input } from "@/components/ui";
import { Logo } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { maskPhone } from "@/lib/format";
import { isEmail, isINN, isLogin, isPassword, isPhone } from "@/lib/validate";

export default function RegisterPage() {
  const [f, setF] = useState({
    login: "", password: "", password2: "", client_type: "C" as "P" | "C",
    name: "", inn: "", contact_person: "", phone: "", email: "", address: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { refresh } = useAuth();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  function check() {
    const e: Record<string, string> = {};
    if (!isLogin(f.login)) e.login = "Латинские буквы, цифры, _ . -, от 3 до 50 символов";
    if (!isPassword(f.password)) e.password = "Не короче 8 символов, буквы и цифры";
    if (f.password !== f.password2) e.password2 = "Пароли не совпадают";
    if (!f.name.trim()) e.name = f.client_type === "C" ? "Укажите наименование организации" : "Укажите ФИО";
    if (f.client_type === "C" && !f.inn) e.inn = "Для организации ИНН обязателен";
    else if (f.inn && !isINN(f.inn)) e.inn = "Неверный ИНН: проверьте цифры";
    if (!isPhone(f.phone)) e.phone = "Введите телефон полностью";
    if (f.email && !isEmail(f.email)) e.email = "Некорректный e-mail";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.post("/auth/register", f);
      await refresh();
      toast.success("Регистрация завершена. Добро пожаловать!");
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast.error(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const company = f.client_type === "C";
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">Уже есть учётная запись? Войти</Link>
        </div>
        <Card className="p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Регистрация клиента</h1>
          <p className="mt-1 text-sm text-slate-500">После регистрации вы сможете оформлять заявки и следить за доставкой в личном кабинете</p>
          <form onSubmit={submit} noValidate className="mt-8 space-y-8">
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Учётная запись</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Логин" required error={errors.login} hint="латиница и цифры">
                  <Input data-field="login" value={f.login} onChange={set("login")} invalid={!!errors.login} />
                </Field>
                <Field label="Пароль" required error={errors.password} hint="от 8 символов, буквы и цифры">
                  <Input data-field="password" type="password" value={f.password} onChange={set("password")} invalid={!!errors.password} />
                </Field>
                <Field label="Повтор пароля" required error={errors.password2}>
                  <Input data-field="password2" type="password" value={f.password2} onChange={set("password2")} invalid={!!errors.password2} />
                </Field>
              </div>
            </section>
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Сведения о клиенте</h2>
              <div className="mb-4 grid grid-cols-2 gap-3" data-field="client_type">
                {[
                  { v: "C", t: "Организация или ИП", d: "юридическое лицо, ИНН 10 цифр", icon: Building2 },
                  { v: "P", t: "Частное лицо", d: "физическое лицо, ИНН необязателен", icon: User },
                ].map((o) => (
                  <button
                    key={o.v} type="button" onClick={() => setF({ ...f, client_type: o.v as "P" | "C" })}
                    className={clsx("flex items-center gap-3 rounded-xl border p-4 text-left transition",
                      f.client_type === o.v ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300")}
                  >
                    <o.icon className={clsx("size-5", f.client_type === o.v ? "text-brand-600" : "text-slate-400")} />
                    <span>
                      <span className="block text-sm font-medium text-slate-800">{o.t}</span>
                      <span className="text-xs text-slate-500">{o.d}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={company ? "Наименование организации" : "Фамилия, имя, отчество"} required error={errors.name} className="sm:col-span-2">
                  <Input data-field="name" value={f.name} onChange={set("name")} invalid={!!errors.name} placeholder={company ? "ООО «Название»" : "Иванов Иван Иванович"} />
                </Field>
                <Field label="ИНН" required={company} error={errors.inn} hint={`${f.inn.length} из ${company ? 10 : 12} цифр`}>
                  <Input data-field="inn" value={f.inn} inputMode="numeric" onChange={(e) => setF({ ...f, inn: e.target.value.replace(/\D/g, "").slice(0, 12) })} invalid={!!errors.inn} />
                </Field>
                <Field label="Телефон" required error={errors.phone}>
                  <Input data-field="phone" value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} invalid={!!errors.phone} placeholder="+7 (___) ___-__-__" />
                </Field>
                {company && (
                  <Field label="Контактное лицо">
                    <Input value={f.contact_person} onChange={set("contact_person")} />
                  </Field>
                )}
                <Field label="E-mail" error={errors.email}>
                  <Input value={f.email} onChange={set("email")} invalid={!!errors.email} />
                </Field>
                <Field label="Адрес" className="sm:col-span-2">
                  <Input value={f.address} onChange={set("address")} />
                </Field>
              </div>
            </section>
            <div className="flex justify-end">
              <Button type="submit" size="lg" loading={busy} icon={<UserPlus className="size-4" />} data-submit>
                Зарегистрироваться
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
