const TOKEN = "fs_token";
const STORE = "fs_store";

export const session = {
  get token() { return localStorage.getItem(TOKEN); },
  set token(v: string | null) { v ? localStorage.setItem(TOKEN, v) : localStorage.removeItem(TOKEN); },
  get storeId() { return localStorage.getItem(STORE); },
  set storeId(v: string | null) { v ? localStorage.setItem(STORE, v) : localStorage.removeItem(STORE); },
};

export class ApiError extends Error {}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (session.storeId) headers["x-store-id"] = session.storeId;
  const res = await fetch(`/api${path}`, { method: opts.method ?? "GET", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/auth/login") {
    session.token = null;
    window.location.href = "/login";
  }
  if (!res.ok) throw new ApiError(data.error ?? `Errore ${res.status}`);
  return data as T;
}

export const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n ?? 0);
export const num = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(n ?? 0);
export const date = (d: string | Date) => new Date(d).toLocaleDateString("it-IT");
export const dateTime = (d: string | Date) => new Date(d).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
