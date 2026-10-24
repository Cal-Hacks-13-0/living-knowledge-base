"use client";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { message: string; details?: unknown };
}

async function handle<T>(res: Response): Promise<T> {
  let body: Envelope<T>;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`Request failed with status ${res.status}`, res.status);
  }
  if (!res.ok || !body.ok) {
    throw new ApiError(body.error?.message ?? "Request failed", res.status, body.error?.details);
  }
  return body.data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  return handle<T>(res);
}

export async function apiPost<T>(url: string, payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  return handle<T>(res);
}

export async function apiPatch<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<T>(res);
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  return handle<T>(res);
}
