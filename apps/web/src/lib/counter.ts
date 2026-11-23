import { useEffect, useState } from "react";
import { getSettings } from "./settings";

const ID_KEY = "jotr.anon.id";
const COUNTED_KEY = "jotr.anon.counted";

export interface UserCount {
  users: number;
  /** True on the visit that counted this browser for the first time. */
  isNew: boolean;
}

let pending: Promise<UserCount | null> | null = null;

/** Where the counter lives: VITE_COUNTER_URL (e.g. a Netlify Function) or the full JOTR API. */
function counterBase(): string {
  return ((import.meta.env.VITE_COUNTER_URL as string | undefined) || getSettings().apiUrl || "").replace(/\/$/, "");
}

async function call<T>(path: string, body?: unknown, tries = 2): Promise<T> {
  try {
    return await once<T>(path, body);
  } catch (e) {
    if (tries <= 1) throw e;
    await new Promise((r) => setTimeout(r, 600));
    return call<T>(path, body, tries - 1);
  }
}

async function once<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${counterBase()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`counter ${res.status}`);
  return (await res.json()) as T;
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Counts this browser once (a random ID it keeps, no account or personal data)
 * and returns the total. Later calls only read the total. Null without an API.
 */
export function userCount(): Promise<UserCount | null> {
  if (!counterBase()) return Promise.resolve(null);
  pending ??= (async () => {
    const store = storage();
    try {
      if (store && !store.getItem(COUNTED_KEY)) {
        let id = store.getItem(ID_KEY);
        if (!id) {
          id = crypto.randomUUID();
          store.setItem(ID_KEY, id);
        }
        const r = await call<{ users: number; new: boolean }>("/stats/hello", { id });
        store.setItem(COUNTED_KEY, "1");
        return { users: r.users, isNew: r.new };
      }
      const r = await call<{ users: number }>("/stats");
      return { users: r.users, isNew: false };
    } catch {
      return null; // API down: the counter just doesn't show
    }
  })();
  return pending;
}

export function useUserCount(): UserCount | null {
  const [count, setCount] = useState<UserCount | null>(null);
  useEffect(() => {
    let live = true;
    void userCount().then((c) => live && setCount(c));
    return () => {
      live = false;
    };
  }, []);
  return count;
}
