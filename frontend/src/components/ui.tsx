"use client";
// Повторно используемые элементы интерфейса.
import { clsx } from "clsx";
import { AlertTriangle, Inbox, Loader2, MoreHorizontal, RotateCw, X } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";
import { STATUS } from "@/lib/statuses";
import type { OrderStatus } from "@/lib/types";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";

export function Button({
  variant = "primary", size = "md", loading, icon, className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: React.ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-base",
        variant === "primary" && "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
        variant === "accent" && "bg-accent-500 text-white shadow-sm hover:bg-accent-600",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-red-600 text-white shadow-sm hover:bg-red-700",
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Field({
  label, required, hint, error, children, className,
}: { label?: string; required?: boolean; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

const inputCls = (invalid?: boolean) =>
  clsx(
    "w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:ring-4",
    invalid ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200 focus:border-brand-500 focus:ring-brand-100",
  );

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; icon?: React.ReactNode }>(
  function Input({ invalid, icon, className, ...rest }, ref) {
    return (
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
        <input ref={ref} {...rest} className={clsx(inputCls(invalid), "h-10", icon && "pl-9", className)} />
      </div>
    );
  },
);

export function Select({ invalid, className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select {...rest} className={clsx(inputCls(invalid), "h-10 pr-8", className)}>
      {children}
    </select>
  );
}

export function Textarea({ invalid, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} className={clsx(inputCls(invalid), "py-2", className)} />;
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={clsx("rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", className ?? "bg-slate-50 text-slate-600 ring-slate-200")}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return (
    <Badge className={s.cls}>
      <span className={clsx("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </Badge>
  );
}

export function Avatar({ text, className }: { text: string; className?: string }) {
  return (
    <span className={clsx("inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700", className)}>
      {text}
    </span>
  );
}

export function Loader({ text = "Загрузка…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" /> {text}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <AlertTriangle className="size-8 text-red-500" />
      <p className="text-sm text-slate-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RotateCw className="size-4" />} onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <Inbox className="size-8 text-slate-300" />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Modal({
  open, title, subtitle, onClose, children, footer, width = "max-w-lg",
}: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
  footer?: React.ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[6vh] backdrop-blur-[2px]">
      <div className={clsx("w-full rounded-2xl bg-white shadow-2xl", width)} role="dialog">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, title, text, confirmText = "Подтвердить", danger, loading, onConfirm, onClose,
}: {
  open: boolean; title: string; text: React.ReactNode; confirmText?: string; danger?: boolean; loading?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmText}</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{text}</p>
    </Modal>
  );
}

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Выпадающее меню действий над строкой таблицы. */
export function RowMenu({ items, open: forcedOpen }: { items: MenuItem[]; open?: boolean }) {
  const [open, setOpen] = useState(!!forcedOpen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <div className="relative inline-block" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        data-menu-button
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Действия"
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {visible.map((i) => (
            <button
              key={i.label}
              data-menu-item={i.label}
              onClick={() => { setOpen(false); i.onClick(); }}
              className={clsx(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50",
                i.danger ? "text-red-600" : "text-slate-700",
              )}
            >
              <span className="text-current opacity-80">{i.icon}</span>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
      <span>{from}–{to} из {total}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Назад</Button>
        <span className="px-2">{page} / {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Вперёд</Button>
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = "brand" }: {
  label: string; value: React.ReactNode; hint?: string; icon: React.ReactNode; tone?: "brand" | "amber" | "emerald" | "sky" | "violet";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    sky: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <span className={clsx("rounded-xl p-2.5", tones[tone])}>{icon}</span>
      </div>
    </Card>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={clsx("whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={clsx("px-4 py-3.5 align-middle text-sm text-slate-700", className)}>{children}</td>;
}

export function Chip({ active, onClick, children, disabled, className }: {
  active?: boolean; onClick?: () => void; children: React.ReactNode; disabled?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm transition",
        active ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
