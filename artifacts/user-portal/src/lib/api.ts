const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  let data: any = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || "Request failed";
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, body?: any) => api<T>(p, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
export const patch = <T,>(p: string, body?: any) => api<T>(p, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
export const put = <T,>(p: string, body?: any) => api<T>(p, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined });
export const del = <T,>(p: string) => api<T>(p, { method: "DELETE" });
