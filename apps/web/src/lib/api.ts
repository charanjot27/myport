import { getSettings } from "./settings";

/** Thin client for services/api. All calls send the session cookie. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export function apiConfigured(): boolean {
  return !!getSettings().apiUrl;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const base = getSettings().apiUrl.replace(/\/$/, "");
  if (!base) throw new ApiError(0, "No API configured");
  const { json, headers, ...rest } = init;
  const res = await fetch(`${base}${path}`, {
    ...rest,
    credentials: "include",
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const msg = (body as { error?: string } | undefined)?.error ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

export interface User {
  id: string;
  email: string;
  plan: "free" | "pro";
  researchConsent: boolean;
}

export interface RemoteScript {
  id: string;
  title: string;
  source: string;
  updatedAt: string;
  version: number;
  deleted: boolean;
}

export interface LivenessChallengeDto {
  id: string;
  seed: string;
  steps: Array<{ rgb: [number, number, number]; durationMs: number }>;
  totalMs: number;
  expiresAt: string;
}

export interface Attestation {
  payload: string;
  signature: string;
  keyId: string;
}
