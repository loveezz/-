"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Calculator, CalendarSearch, Eye, EyeOff, LogIn, ShieldCheck, Truck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const DEMO = [
  { label: "Администратор", login: "admin", password: "Admin123!" },
  { label: "Диспетчер", login: "dispatcher", password: "Demo123!" },
  { label: "Водитель", login: "sokolov", password: "Demo123!" },
  { label: "Клиент", login: "uralsk", password: "Demo123!" },
];

function LoginForm() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (!login.trim()) f.login = "Введите логин";
    if (!password) f.password = "Введите пароль";
    setErrors(f);
    setMessage("");
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      await api.post("/auth/login", { login, password });
      await refresh();
      router.replace(params.get("next") || "/");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setMessage(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 p-12 text-white lg:flex lg:flex-col">
        <Logo light />
        <div className="mt-auto max-w-md">
          <h2 className="text-4xl font-semibold leading-tight">Заявки, транспорт и водители — в одной системе</h2>
          <p className="mt-4 text-brand-100">
            Оформляйте перевозки, рассчитывайте стоимость по тарифам и назначайте рейсы без накладок по времени.
          </p>
          <ul className="mt-10 space-y-4">
            {[
              { icon: Calculator, t: "Расчёт стоимости", d: "по расстоянию маршрута и типу груза" },
              { icon: Truck, t: "Назначение транспорта", d: "с проверкой грузоподъёмности и занятости" },
              { icon: CalendarSearch, t: "Поиск заявок", d: "по клиенту, маршруту, дате и водителю" },
            ].map((x) => (
              <li key={x.t} className="flex items-center gap-4 rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
                <x.icon className="size-5 text-accent-500" />
                <div>
                  <p className="font-medium">{x.t}</p>
                  <p className="text-sm text-brand-100">{x.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 text-xs text-brand-200">© ГрузЛайн, Екатеринбург</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold text-slate-900">Вход в систему</h1>
          <p className="mt-1 text-sm text-slate-500">Введите логин и пароль учётной записи</p>

          <div className="mt-8 space-y-4">
            <Field label="Логин" error={errors.login}>
              <Input data-field="login" value={login} onChange={(e) => setLogin(e.target.value)} invalid={!!errors.login} placeholder="например, dispatcher" autoComplete="username" />
            </Field>
            <Field label="Пароль" error={errors.password}>
              <div className="relative">
                <Input data-field="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} placeholder="••••••••" autoComplete="current-password" className="pr-10" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Показать пароль">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {message && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>}
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={<LogIn className="size-4" />} data-submit>
              Войти
            </Button>
          </div>

          <p className="mt-5 text-center text-sm text-slate-500">
            Новый клиент?{" "}
            <Link href="/register" className="font-medium text-brand-600 hover:underline" data-register>Зарегистрироваться</Link>
          </p>

          <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <ShieldCheck className="size-4" /> Демонстрационный доступ
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <Button key={d.login} type="button" variant="secondary" size="sm" onClick={() => { setLogin(d.login); setPassword(d.password); }}>
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
