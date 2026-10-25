// Run with: node --test netlify/stats.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { handle } from "./functions/stats.mjs";

/** In-memory stand-in for a Netlify Blobs store (only what the function uses). */
function fakeStore() {
  const m = new Map();
  let v = 0;
  const get = (k) => m.get(k);
  return {
    data: m,
    async get(k, o) {
      const e = get(k);
      return e ? (o?.type === "json" ? JSON.parse(e.value) : e.value) : null;
    },
    async getWithMetadata(k, o) {
      const e = get(k);
      return e ? { data: o?.type === "json" ? JSON.parse(e.value) : e.value, etag: e.etag, metadata: {} } : null;
    },
    async set(k, value, o = {}) {
      const e = get(k);
      if ((o.onlyIfNew && e) || (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch))) return { modified: false };
      const etag = String(++v);
      m.set(k, { value: String(value), etag });
      return { modified: true, etag };
    },
    async list({ prefix = "" } = {}) {
      return { blobs: [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, e]) => ({ key, etag: e.etag })), directories: [] };
    },
    async setJSON(k, value, o) {
      return this.set(k, JSON.stringify(value), o);
    },
  };
}

const req = (method, body) => new Request("https://x/api/stats/hello", { method, body: body === undefined ? undefined : JSON.stringify(body) });

test("counts each browser once and keeps only a hash", async () => {
  const store = fakeStore();
  const id = randomUUID();
  assert.deepEqual(await (await handle(req("GET"), store)).json(), { users: 0 });
  assert.deepEqual(await (await handle(req("POST", { id }), store)).json(), { users: 1, new: true });
  assert.deepEqual(await (await handle(req("POST", { id }), store)).json(), { users: 1, new: false });
  assert.deepEqual(await (await handle(req("POST", { id: randomUUID() }), store)).json(), { users: 2, new: true });
  assert.deepEqual(await (await handle(req("GET"), store)).json(), { users: 2 });
  assert.ok(![...store.data.keys()].some((k) => k.includes(id)));
  assert.equal((await handle(req("POST", { id: "nope" }), store)).status, 400);
});

test("simultaneous new visitors are all counted", async () => {
  const store = fakeStore();
  await Promise.all(Array.from({ length: 25 }, () => handle(req("POST", { id: randomUUID() }), store)));
  assert.deepEqual(await (await handle(req("GET"), store)).json(), { users: 25 });
});
