import type { SessionRecord } from "@promptsense/core";

/**
 * Local-first persistence in IndexedDB. Scripts and session records live on
 * the device; when the user signs in, the sync layer mirrors them to the API.
 */

export interface StoredScript {
  id: string;
  title: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  /** Server version for sync; undefined until first upload. */
  remoteVersion?: number;
  deleted?: boolean;
}

export interface StoredSession {
  id: string;
  scriptId: string;
  scriptTitle: string;
  startedAt: string;
  durationMs: number;
  record: SessionRecord;
  /** Research-mode sessions are kept separately and only uploaded with consent. */
  research: boolean;
}

const DB_NAME = "promptsense";
const DB_VERSION = 1;
type StoreName = "scripts" | "sessions" | "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("scripts")) db.createObjectStore("scripts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sessions")) {
        const s = db.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("scriptId", "scriptId");
      }
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const scripts = {
  async list(): Promise<StoredScript[]> {
    const all = await request<StoredScript[]>("scripts", "readonly", (s) => s.getAll());
    return all.filter((x) => !x.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  all: () => request<StoredScript[]>("scripts", "readonly", (s) => s.getAll()),
  get: (id: string) => request<StoredScript | undefined>("scripts", "readonly", (s) => s.get(id)),
  put: (script: StoredScript) => request<IDBValidKey>("scripts", "readwrite", (s) => s.put(script)),
  async remove(id: string): Promise<void> {
    const existing = await scripts.get(id);
    if (!existing) return;
    // Tombstone so the deletion syncs; purged after the server confirms.
    await scripts.put({ ...existing, deleted: true, updatedAt: new Date().toISOString() });
  },
  purge: (id: string) => request<undefined>("scripts", "readwrite", (s) => s.delete(id)),
};

export const sessions = {
  async list(): Promise<StoredSession[]> {
    const all = await request<StoredSession[]>("sessions", "readonly", (s) => s.getAll());
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  get: (id: string) => request<StoredSession | undefined>("sessions", "readonly", (s) => s.get(id)),
  put: (session: StoredSession) => request<IDBValidKey>("sessions", "readwrite", (s) => s.put(session)),
  remove: (id: string) => request<undefined>("sessions", "readwrite", (s) => s.delete(id)),
};

export const kv = {
  get: <T>(key: string) => request<T | undefined>("kv", "readonly", (s) => s.get(key)),
  set: (key: string, value: unknown) => request<IDBValidKey>("kv", "readwrite", (s) => s.put(value, key)),
};

export function newId(): string {
  return crypto.randomUUID();
}

export const SAMPLE_SCRIPT = `# Welcome
Hi, I'm testing PromptSense, a teleprompter that listens as I speak.
When I pause, it waits for me. When I skip ahead, it follows.

# How it works
The script scrolls to keep my current line near the camera, so I can keep eye contact.
If I'm about to stumble on a hard word like *psycholinguistics*, it slows down and highlights it. [smile]

# Wrap up
Thanks for watching. After this take, I'll check the coach report for my pace, filler words and eye contact.
`;
