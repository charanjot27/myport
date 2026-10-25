import { useEffect, useState } from "react";
import { api, apiConfigured } from "./api";

const ID_KEY = "jotr.anon.id";
const COUNTED_KEY = "jotr.anon.counted";

export interface UserCount {
  users: number;
  /** True on the visit that counted this browser for the first time. */
  isNew: boolean;
}

let pending: Promise<UserCount | null> | null = null;

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
  if (!apiConfigured()) return Promise.resolve(null);
  pending ??= (async () => {
    const store = storage();
    try {
      if (store && !store.getItem(COUNTED_KEY)) {
        let id = store.getItem(ID_KEY);
        if (!id) {
          id = crypto.randomUUID();
          store.setItem(ID_KEY, id);
        }
        const r = await api<{ users: number; new: boolean }>("/stats/hello", { method: "POST", json: { id } });
        store.setItem(COUNTED_KEY, "1");
        return { users: r.users, isNew: r.new };
      }
      const r = await api<{ users: number }>("/stats");
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
