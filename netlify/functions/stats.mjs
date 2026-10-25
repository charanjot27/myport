// JOTR user counter as a Netlify Function, backed by Netlify Blobs (no server or database to run).
// GET  /api/stats         -> { users }
// POST /api/stats/hello   -> { users, new }   body: { id: "<random uuid made by the browser>" }
// Only a SHA-256 hash of the browser's random ID is stored: no account, email or IP address.
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

const FRESH_MS = 60_000;

/** Exact count: one entry per counted browser. Recounted at most once a minute, cached in between. */
async function total(store, { force = false } = {}) {
  const cached = await store.get("total", { type: "json" });
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return cached.n;
  const { blobs } = await store.list({ prefix: "u/" });
  await store.setJSON("total", { n: blobs.length, at: Date.now() });
  return blobs.length;
}

export async function handle(req, store) {
  if (req.method === "GET") return json({ users: await total(store) }, 200, { "cache-control": "public, max-age=30" });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let id;
  try {
    id = (await req.json())?.id;
  } catch {
    // fall through to the validation error
  }
  if (typeof id !== "string" || !UUID.test(id)) return json({ error: "invalid id" }, 400);
  const key = `u/${createHash("sha256").update(`jotr-install:${id}`).digest("hex")}`;
  const added = await store.set(key, new Date().toISOString(), { onlyIfNew: true });
  if (!added.modified) return json({ users: await total(store), new: false });
  return json({ users: await total(store, { force: true }), new: true });
}

export default async (req) => handle(req, getStore({ name: "jotr-counter", consistency: "strong" }));
