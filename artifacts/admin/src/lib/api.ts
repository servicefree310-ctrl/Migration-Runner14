const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Paths that intentionally probe auth state and must NOT trigger the global
// 401 redirect (otherwise the login page would bounce its own /auth/me check).
// Use exact match (or `?` querystring) so a future `/auth/logout-all` route
// doesn't accidentally inherit silent-401 behavior.
const SILENT_401_PATHS = new Set(["/auth/me", "/auth/login", "/auth/logout"]);

function handle401(path: string): void {
  if (typeof window === "undefined") return;
  // Strip querystring before matching so /auth/me?force=1 still counts.
  const bare = path.split("?")[0];
  if (SILENT_401_PATHS.has(bare)) return;
  // Avoid loops if we're already on the login page
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const onLogin = window.location.pathname === `${base}/login`;
  if (onLogin) return;
  // Use setTimeout so React Query has a tick to surface the 401 to its caller
  // before we navigate away (toast / inline error gets a chance to render).
  window.setTimeout(() => {
    window.location.href = `${base}/login`;
  }, 50);
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || res.statusText || "Request failed";
    if (res.status === 401) handle401(path);
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, body?: unknown) => api<T>(p, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
export const patch = <T,>(p: string, body?: unknown) => api<T>(p, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
export const put = <T,>(p: string, body?: unknown) => api<T>(p, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined });
export const del = (p: string) => api<void>(p, { method: "DELETE" });
