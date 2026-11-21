// Единый HTTP-клиент интерфейса: разбирает ошибки валидации по полям
// и обрабатывает истечение сессии.
export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return "/api" + path + (qs ? "?" + qs : "");
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Нет связи с сервером. Проверьте подключение к сети");
  }
  if (res.status === 401 && !path.startsWith("/auth/")) {
    // Сессия истекла — переход на страницу входа с возвратом на текущую страницу.
    const back = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = "/login?next=" + back;
    throw new ApiError(401, "Сессия истекла");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error || "Ошибка " + res.status, data.fields || {});
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Неизвестная ошибка";
}
