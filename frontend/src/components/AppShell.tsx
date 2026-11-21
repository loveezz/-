"use client";
import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen, Calculator, ClipboardList, LayoutDashboard, LogOut, Map, PackagePlus, Route as RouteIcon,
  Truck, UserCog, Users, IdCard,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Loader } from "./ui";
import { initials } from "@/lib/format";

interface Item { href: string; label: string; icon: React.ElementType; roles: Role[] }

// Состав пунктов меню зависит от роли пользователя.
const MENU: Item[] = [
  { href: "/", label: "Главная", icon: LayoutDashboard, roles: ["admin", "dispatcher", "client"] },
  { href: "/", label: "Мои рейсы", icon: Truck, roles: ["driver"] },
  { href: "/orders/new", label: "Новая заявка", icon: PackagePlus, roles: ["admin", "dispatcher", "client"] },
  { href: "/orders", label: "Заявки", icon: ClipboardList, roles: ["admin", "dispatcher"] },
  { href: "/orders", label: "Мои заявки", icon: ClipboardList, roles: ["client"] },
  { href: "/orders", label: "История рейсов", icon: ClipboardList, roles: ["driver"] },
  { href: "/clients", label: "Клиенты", icon: Users, roles: ["admin", "dispatcher"] },
  { href: "/vehicles", label: "Транспорт", icon: Truck, roles: ["admin", "dispatcher"] },
  { href: "/drivers", label: "Водители", icon: IdCard, roles: ["admin", "dispatcher"] },
  { href: "/routes", label: "Маршруты", icon: Map, roles: ["admin", "dispatcher"] },
  { href: "/tariffs", label: "Тарифы и грузы", icon: BookOpen, roles: ["admin", "dispatcher"] },
  { href: "/calculator", label: "Расчёт стоимости", icon: Calculator, roles: ["admin", "dispatcher", "client"] },
  { href: "/users", label: "Пользователи", icon: UserCog, roles: ["admin"] },
];

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-900/20">
        <RouteIcon className="size-5" />
      </span>
      <div className="leading-tight">
        <p className={clsx("text-[17px] font-semibold", light ? "text-white" : "text-slate-900")}>ГрузЛайн</p>
        <p className={clsx("text-xs", light ? "text-brand-100" : "text-slate-500")}>грузоперевозки по Уралу</p>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading, logout } = useAuth();
  const path = usePathname();
  if (loading || !me) return <Loader />;
  const items = MENU.filter((i) => i.roles.includes(me.role));
  const isActive = (href: string) =>
    href === "/" ? path === "/" : href === "/orders" ? path === "/orders" || /^\/orders\/\d+/.test(path) : path.startsWith(href);

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((i) => (
            <Link
              key={i.label}
              href={i.href}
              data-nav={i.label}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition",
                isActive(i.href) ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <i.icon className="size-[18px]" />
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-4">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
            {initials(me.display_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{me.display_name}</p>
            <p className="text-xs text-slate-500">{me.role_name}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Выйти" data-logout>
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
    </div>
  );
}
