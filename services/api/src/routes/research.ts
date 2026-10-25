import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const record = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    scriptSource: z.string().max(500_000),
    durationMs: z.number(),
    tokenTimings: z.array(z.object({ token: z.number(), t: z.number() })),
    transcript: z.array(z.object({ t: z.number(), text: z.string(), isFinal: z.boolean() })),
    gaze: z.array(z.record(z.unknown())),
    face: z.array(z.record(z.unknown())),
  })
  .passthrough();

/**
 * Research data collection. Uploads require explicit consent on the account,
 * and consent can be withdrawn, which deletes everything uploaded.
 */
export async function researchRoutes(app: FastifyInstance) {
  app.post("/consent", { preHandler: app.requireUser }, async (req) => {
    const { consent } = z.object({ consent: z.boolean() }).parse(req.body);
    await app.db.updateTable("users").set({ research_consent: consent ? 1 : 0 }).where("id", "=", req.user!.id).execute();
    if (!consent) await app.db.deleteFrom("research_sessions").where("user_id", "=", req.user!.id).execute();
    return { consent };
  });

  app.post("/sessions", { preHandler: app.requireUser, bodyLimit: app.config.MAX_RESEARCH_BYTES }, async (req, reply) => {
    if (!req.user!.research_consent) return reply.code(403).send({ error: "Research consent is required" });
    const rec = record.parse((req.body as { record?: unknown })?.record);
    // Never accept media, even if a modified client sends it.
    for (const key of ["video", "audio", "frames", "images"]) {
      if (key in rec) return reply.code(400).send({ error: `Field "${key}" is not accepted` });
    }
    const json = JSON.stringify(rec);
    const existing = await app.db.selectFrom("research_sessions").select("id").where("user_id", "=", req.user!.id).where("id", "=", rec.id).executeTakeFirst();
    if (existing) {
      await app.db.updateTable("research_sessions").set({ record: json, bytes: json.length }).where("user_id", "=", req.user!.id).where("id", "=", rec.id).execute();
    } else {
      await app.db.insertInto("research_sessions").values({ id: rec.id, user_id: req.user!.id, created_at: new Date().toISOString(), record: json, bytes: json.length }).execute();
    }
    return reply.code(existing ? 200 : 201).send({ ok: true });
  });

  /** Admin: export all consented research sessions as JSON Lines for the training pipeline. */
  app.get("/export", { preHandler: requireAdmin(app) }, async (_req, reply) => {
    const rows = await app.db
      .selectFrom("research_sessions")
      .innerJoin("users", "users.id", "research_sessions.user_id")
      .select(["research_sessions.record", "research_sessions.user_id"])
      .where("users.research_consent", "=", 1)
      .orderBy("research_sessions.created_at")
      .execute();
    reply.header("content-type", "application/x-ndjson");
    // Participant ids are pseudonymous; emails never leave the database.
    return rows.map((r) => JSON.stringify({ participant: r.user_id, ...(JSON.parse(r.record) as object) })).join("\n") + (rows.length ? "\n" : "");
  });
}

export function requireAdmin(app: FastifyInstance) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const expected = app.config.ADMIN_TOKEN;
    const given = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const ok = !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) return reply.code(401).send({ error: "Admin token required" });
  };
}
