// Проверка полей форм на стороне клиента (повторяет правила сервера).
export const isLogin = (s: string) => /^[A-Za-z0-9_.-]{3,50}$/.test(s);

export const isPassword = (s: string) => s.length >= 8 && /\d/.test(s) && /[A-Za-zА-Яа-я]/.test(s);

export const isPhone = (s: string) => s.replace(/\D/g, "").length === 11;

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

/** Проверка ИНН по контрольным разрядам (10 цифр — организация, 12 — физлицо). */
export function isINN(inn: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;
  const d = inn.split("").map(Number);
  const check = (w: number[]) => (w.reduce((s, k, i) => s + k * d[i], 0) % 11) % 10;
  if (d.length === 10) return check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
  return check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
}

export const isPlate = (s: string) => /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/.test(s);

/** Замена латинских букв на совпадающие по начертанию кириллические в госномере. */
export function normalizePlate(s: string): string {
  const map: Record<string, string> = { A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х" };
  return s.toUpperCase().replace(/\s/g, "").replace(/[ABEKMHOPCTYX]/g, (c) => map[c]);
}
