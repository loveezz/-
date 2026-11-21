// Форматирование чисел, дат и телефонов для отображения.
const TZ = "Asia/Yekaterinburg";

export const money = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(v)) + " ₽";

export const num = (v: number, digits = 0) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(v);

export const coef = (v: number) =>
  new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export const weight = (kg: number) => (kg >= 1000 ? num(kg / 1000, 1) + " т" : num(kg) + " кг");

export const date = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export const dateTime = (iso: string) => date(iso) + " " + time(iso);

export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

export const hours = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return (whole ? whole + " ч" : "") + (min ? " " + min + " мин" : "");
};

/** Ключ даты YYYY-MM-DD в часовом поясе компании. */
export function dayKey(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return p.format(d);
}

/** Сборка ISO-времени из даты и времени в часовом поясе компании (UTC+5). */
export const toIso = (day: string, hhmm: string) => `${day}T${hhmm}:00+05:00`;

/** Маска телефона +7 (XXX) XXX-XX-XX по мере ввода. */
export function maskPhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("8") || d.startsWith("7")) d = d.slice(1);
  d = d.slice(0, 10);
  if (!d) return "";
  let r = "+7 (" + d.slice(0, 3);
  if (d.length >= 3) r += ") " + d.slice(3, 6);
  if (d.length >= 6) r += "-" + d.slice(6, 8);
  if (d.length >= 8) r += "-" + d.slice(8, 10);
  return r;
}

export const initials = (name: string) =>
  name
    .replace(/[«»"]/g, "")
    .replace(/^(ООО|АО|ПАО|ИП)\s+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export const shortName = (full: string) => {
  const [l, f, m] = full.split(" ");
  return [l, f ? f[0] + "." : "", m ? m[0] + "." : ""].join(" ").trim();
};
