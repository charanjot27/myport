import { createHmac, randomUUID } from "node:crypto";
import { seededRandom, tintAt, type LivenessChallenge } from "@promptsense/core";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb, migrate, type DB } from "../src/db.js";
import { verifyStripeSignature } from "../src/routes/billing.js";
import { canonicalJson } from "../src/signing.js";

const ORIGIN = "http://localhost:5173";
let app: FastifyInstance;
let db: DB;
let fetchCalls: Array<{ url: string; init?: RequestInit }>;

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db);
  fetchCalls = [];
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    if (String(url).includes("deepgram")) return new Response(JSON.stringify({ access_token: "dg-jwt", expires_in: 60 }), { status: 200 });
    if (String(url).includes("checkout/sessions")) return new Response(JSON.stringify({ url: "https://checkout.stripe.test/s" }), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: ":memory:",
    DEEPGRAM_API_KEY: "dg-key",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_PRICE_ID: "price_1",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    ADMIN_TOKEN: "admin-token-123",
  });
  app = await buildApp({ db, config, fetchImpl: fakeFetch });
});

afterEach(async () => {
  await app.close();
  await db.destroy();
});

async function register(email = "ana@example.com") {
  const res = await app.inject({ method: "POST", url: "/auth/register", headers: { origin: ORIGIN }, payload: { email, password: "correct horse battery" } });
  expect(res.statusCode).toBe(201);
  const cookie = res.cookies.find((c) => c.name === "ps_session")!;
  return { cookie: `ps_session=${cookie.value}`, user: res.json().user as { id: string } };
}

const req = (cookie: string) => ({ cookie, origin: ORIGIN });

describe("auth", () => {
  it("registers, reads the session, logs out", async () => {
    const { cookie } = await register();
    const me = await app.inject({ url: "/auth/me", headers: { cookie } });
    expect(me.json().user).toMatchObject({ email: "ana@example.com", plan: "free", researchConsent: false });
    await app.inject({ method: "POST", url: "/auth/logout", headers: req(cookie) });
    expect((await app.inject({ url: "/auth/me", headers: { cookie } })).statusCode).toBe(401);
  });

  it("rejects duplicates, bad passwords and short passwords", async () => {
    await register();
    const dup = await app.inject({ method: "POST", url: "/auth/register", payload: { email: "ANA@example.com", password: "correct horse battery" } });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "ana@example.com", password: "wrong password!!" } });
    expect(bad.statusCode).toBe(401);
    const short = await app.inject({ method: "POST", url: "/auth/register", payload: { email: "b@example.com", password: "short" } });
    expect(short.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "ana@example.com", password: "correct horse battery" } });
    expect(ok.statusCode).toBe(200);
  });

  it("blocks state-changing requests from foreign origins", async () => {
    const { cookie } = await register();
    const res = await app.inject({ method: "PUT", url: `/scripts/${randomUUID()}`, headers: { cookie, origin: "https://evil.example" }, payload: {} });
    expect(res.statusCode).toBe(403);
  });
});

describe("scripts sync", () => {
  it("upserts with increasing versions, lists, and tombstones deletions", async () => {
    const { cookie } = await register();
    const id = randomUUID();
    const put = (title: string) =>
      app.inject({ method: "PUT", url: `/scripts/${id}`, headers: req(cookie), payload: { title, source: "Hello world", updatedAt: new Date().toISOString() } });
    expect((await put("v1")).json()).toEqual({ version: 1 });
    expect((await put("v2")).json()).toEqual({ version: 2 });
    let list = (await app.inject({ url: "/scripts", headers: { cookie } })).json().scripts;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, title: "v2", version: 2, deleted: false });
    await app.inject({ method: "DELETE", url: `/scripts/${id}`, headers: req(cookie) });
    list = (await app.inject({ url: "/scripts", headers: { cookie } })).json().scripts;
    expect(list[0]).toMatchObject({ deleted: true, version: 3, source: "" });
  });

  it("isolates users", async () => {
    const a = await register("a@example.com");
    const b = await register("b@example.com");
    await app.inject({ method: "PUT", url: `/scripts/${randomUUID()}`, headers: req(a.cookie), payload: { title: "a", source: "x", updatedAt: new Date().toISOString() } });
    expect((await app.inject({ url: "/scripts", headers: { cookie: b.cookie } })).json().scripts).toHaveLength(0);
  });
});

describe("sessions and research", () => {
  it("stores session summaries idempotently", async () => {
    const { cookie } = await register();
    const payload = { id: randomUUID(), scriptId: "s1", startedAt: new Date().toISOString(), durationMs: 60000, summary: { score: 80, wpm: 150, fillers: 2, stumbles: 1, eyeContactPct: 90, coverage: 1 } };
    expect((await app.inject({ method: "POST", url: "/sessions", headers: req(cookie), payload })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/sessions", headers: req(cookie), payload })).statusCode).toBe(200);
    expect((await app.inject({ url: "/sessions", headers: { cookie } })).json().sessions).toHaveLength(1);
  });

  it("requires consent, rejects media, exports for admins, and deletes on withdrawal", async () => {
    const { cookie, user } = await register();
    const record = { version: 1, id: randomUUID(), scriptSource: "Hi there", durationMs: 1000, tokenTimings: [], transcript: [], gaze: [], face: [] };
    expect((await app.inject({ method: "POST", url: "/research/sessions", headers: req(cookie), payload: { record } })).statusCode).toBe(403);
    await app.inject({ method: "POST", url: "/research/consent", headers: req(cookie), payload: { consent: true } });
    expect((await app.inject({ method: "POST", url: "/research/sessions", headers: req(cookie), payload: { record: { ...record, video: "x" } } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/research/sessions", headers: req(cookie), payload: { record } })).statusCode).toBe(201);

    expect((await app.inject({ url: "/research/export" })).statusCode).toBe(401);
    const exp = await app.inject({ url: "/research/export", headers: { authorization: "Bearer admin-token-123" } });
    const lines = exp.body.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ participant: user.id, id: record.id });
    expect(exp.body).not.toContain("ana@example.com");

    await app.inject({ method: "POST", url: "/research/consent", headers: req(cookie), payload: { consent: false } });
    const after = await app.inject({ url: "/research/export", headers: { authorization: "Bearer admin-token-123" } });
    expect(after.body.trim()).toBe("");
  });
});

describe("cloud speech tokens", () => {
  it("is a Pro feature and never exposes the API key", async () => {
    const { cookie, user } = await register();
    expect((await app.inject({ method: "POST", url: "/asr/token", headers: req(cookie) })).statusCode).toBe(402);
    await db.updateTable("users").set({ plan: "pro" }).where("id", "=", user.id).execute();
    const res = await app.inject({ method: "POST", url: "/asr/token", headers: req(cookie) });
    expect(res.json()).toEqual({ token: "dg-jwt", expiresIn: 60 });
    expect(res.body).not.toContain("dg-key");
    expect(fetchCalls[0]!.url).toBe("https://api.deepgram.com/v1/auth/grant");
  });
});

function reflectiveSamples(ch: LivenessChallenge, live: boolean) {
  const rand = seededRandom(live ? "live" : "replay");
  const out = [];
  for (let t = 0; t < ch.totalMs + 300; t += 33) {
    const tint = tintAt(ch, t - 100) ?? [210, 210, 210];
    const rgb = [180, 130, 110].map((b, c) => b + (live ? (tint[c]! - 210) * 0.15 : (rand() - 0.5) * 12) + (rand() - 0.5) * 3);
    out.push({ t, rgb });
  }
  return out;
}

describe("liveness", () => {
  it("issues a challenge, scores it server-side and signs a verifiable attestation", async () => {
    const { cookie } = await register();
    const ch = (await app.inject({ method: "POST", url: "/liveness/challenge", headers: req(cookie) })).json() as LivenessChallenge;
    expect(ch.steps.length).toBeGreaterThan(5);
    const res = await app.inject({ method: "POST", url: "/liveness/verify", headers: req(cookie), payload: { challengeId: ch.id, samples: reflectiveSamples(ch, true) } });
    const body = res.json();
    expect(body.result.passed).toBe(true);
    expect(body.attestation.keyId).toBe("dev");

    const check = await app.inject({ method: "POST", url: "/liveness/attestations/verify", payload: body.attestation });
    expect(check.json()).toMatchObject({ valid: true, claims: { type: "promptsense.liveness", passed: true, challengeId: ch.id } });
    const tampered = await app.inject({ method: "POST", url: "/liveness/attestations/verify", payload: { ...body.attestation, payload: body.attestation.payload.replace("true", "false") } });
    expect(tampered.json().valid).toBe(false);

    // Single use.
    const again = await app.inject({ method: "POST", url: "/liveness/verify", headers: req(cookie), payload: { challengeId: ch.id, samples: reflectiveSamples(ch, true) } });
    expect(again.statusCode).toBe(409);

    const keys = (await app.inject({ url: "/liveness/keys" })).json().keys;
    expect(keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", kid: "dev" });
  });

  it("does not sign a failed check and rejects other users' challenges", async () => {
    const a = await register("a@example.com");
    const b = await register("b@example.com");
    const ch = (await app.inject({ method: "POST", url: "/liveness/challenge", headers: req(a.cookie) })).json() as LivenessChallenge;
    const stolen = await app.inject({ method: "POST", url: "/liveness/verify", headers: req(b.cookie), payload: { challengeId: ch.id, samples: reflectiveSamples(ch, true) } });
    expect(stolen.statusCode).toBe(404);
    const res = (await app.inject({ method: "POST", url: "/liveness/verify", headers: req(a.cookie), payload: { challengeId: ch.id, samples: reflectiveSamples(ch, false) } })).json();
    expect(res.result.passed).toBe(false);
    expect(res.attestation).toBeNull();
  });
});

function signStripe(payload: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

describe("billing", () => {
  it("creates checkout sessions", async () => {
    const { cookie } = await register();
    const res = await app.inject({ method: "POST", url: "/billing/checkout", headers: req(cookie) });
    expect(res.json().url).toBe("https://checkout.stripe.test/s");
    expect(String(fetchCalls[0]!.init!.body)).toContain("client_reference_id=");
  });

  it("upgrades and downgrades from signed webhooks only", async () => {
    const { cookie, user } = await register();
    const completed = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: user.id, customer: "cus_1" } } });
    const forged = await app.inject({ method: "POST", url: "/billing/webhook", headers: { "content-type": "application/json", "stripe-signature": signStripe(completed, "wrong") }, payload: completed });
    expect(forged.statusCode).toBe(400);
    await app.inject({ method: "POST", url: "/billing/webhook", headers: { "content-type": "application/json", "stripe-signature": signStripe(completed, "whsec_test") }, payload: completed });
    expect((await app.inject({ url: "/auth/me", headers: { cookie } })).json().user.plan).toBe("pro");

    const cancelled = JSON.stringify({ type: "customer.subscription.deleted", data: { object: { customer: "cus_1", status: "canceled" } } });
    await app.inject({ method: "POST", url: "/billing/webhook", headers: { "content-type": "application/json", "stripe-signature": signStripe(cancelled, "whsec_test") }, payload: cancelled });
    expect((await app.inject({ url: "/auth/me", headers: { cookie } })).json().user.plan).toBe("free");
  });

  it("rejects stale webhook timestamps", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyStripeSignature("{}", signStripe("{}", "s", old), "s")).toBe(false);
    expect(verifyStripeSignature("{}", signStripe("{}", "s"), "s")).toBe(true);
  });
});

describe("account", () => {
  it("exports and deletes everything", async () => {
    const { cookie } = await register();
    await app.inject({ method: "PUT", url: `/scripts/${randomUUID()}`, headers: req(cookie), payload: { title: "a", source: "x", updatedAt: new Date().toISOString() } });
    const exp = (await app.inject({ url: "/account/export", headers: { cookie } })).json();
    expect(exp.scripts).toHaveLength(1);
    expect(exp.user.email).toBe("ana@example.com");
    expect(JSON.stringify(exp)).not.toContain("password");
    await app.inject({ method: "DELETE", url: "/account", headers: req(cookie) });
    expect(await db.selectFrom("users").selectAll().execute()).toHaveLength(0);
    expect(await db.selectFrom("scripts").selectAll().execute()).toHaveLength(0);
  });
});

describe("misc", () => {
  it("reports health and features", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.json()).toMatchObject({ status: "ok", db: true, features: { cloudSpeech: true, billing: true, signedLiveness: false } });
  });
  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
  it("migrations are idempotent", async () => {
    expect(await migrate(db)).toBe(0);
  });
});

describe("anonymous user counter", () => {
  it("counts each browser once, by a hash of its random id", async () => {
    const id1 = randomUUID();
    const hello = (id: string) => app.inject({ method: "POST", url: "/stats/hello", headers: { origin: ORIGIN }, payload: { id } });
    expect((await app.inject({ method: "GET", url: "/stats" })).json()).toEqual({ users: 0 });
    expect((await hello(id1)).json()).toEqual({ users: 1, new: true });
    expect((await hello(id1)).json()).toEqual({ users: 1, new: false }); // same browser again
    expect((await hello(randomUUID())).json()).toEqual({ users: 2, new: true });
    expect((await app.inject({ method: "GET", url: "/stats" })).json().users).toBe(2);
    // Only the hash is stored, never the id itself.
    const rows = await db.selectFrom("installs").selectAll().execute();
    expect(rows.map((r) => r.id_hash).some((h) => h.includes(id1))).toBe(false);
    expect((await hello("not-a-uuid")).statusCode).toBe(400);
  });
});
