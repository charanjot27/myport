import { useSyncExternalStore } from "react";
import { api, apiConfigured, type User } from "./api";

let user: User | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function set(u: User | null) {
  user = u;
  listeners.forEach((l) => l());
}

export async function refreshUser(): Promise<User | null> {
  if (!apiConfigured()) return null;
  try {
    set((await api<{ user: User }>("/auth/me")).user);
  } catch {
    set(null);
  }
  loaded = true;
  return user;
}

export async function login(email: string, password: string, mode: "login" | "register"): Promise<User> {
  const res = await api<{ user: User }>(`/auth/${mode}`, { method: "POST", json: { email, password } });
  set(res.user);
  return res.user;
}

export async function logout(): Promise<void> {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  set(null);
}

export function setUser(u: User | null): void {
  set(u);
}

export function useAuth(): User | null {
  if (!loaded && apiConfigured()) {
    loaded = true;
    void refreshUser();
  }
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => user,
  );
}

export function currentUser(): User | null {
  return user;
}
