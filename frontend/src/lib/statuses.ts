import type { OrderStatus } from "./types";

export const STATUS: Record<OrderStatus, { label: string; cls: string; dot: string }> = {
  new: { label: "Новая", cls: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  assigned: { label: "Назначена", cls: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  in_transit: { label: "В пути", cls: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  delivered: { label: "Доставлена", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  cancelled: { label: "Отменена", cls: "bg-slate-100 text-slate-500 ring-slate-200", dot: "bg-slate-400" },
};

export const VEHICLE_STATUS = {
  active: { label: "На линии", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  repair: { label: "В ремонте", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  inactive: { label: "Списан", cls: "bg-slate-100 text-slate-500 ring-slate-200" },
} as const;
