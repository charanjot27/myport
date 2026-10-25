import type { FastifyInstance } from "fastify";
import { z } from "zod";

const summary = z.object({
  score: z.number().min(0).max(100),
  wpm: z.number().min(0).max(1000),
  fillers: z.number().int().min(0),
  stumbles: z.number().int().min(0),
  eyeContactPct: z.number().min(0).max(100).nullable(),
  coverage: z.number().min(0).max(1),
});

const body = z.object({
  id: z.string().uuid(),
  scriptId: z.string().max(64),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().min(0).max(24 * 3600_000),
  summary,
});

/** Practice-session summaries (metrics only, never transcripts or media). */
export async function sessionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  app.post("/", async (req, reply) => {
    const b = body.parse(req.body);
    const userId = req.user!.id;
    const exists = await app.db.selectFrom("practice_sessions").select("id").where("user_id", "=", userId).where("id", "=", b.id).executeTakeFirst();
    if (!exists) {
      await app.db
        .insertInto("practice_sessions")
        .values({ id: b.id, user_id: userId, script_id: b.scriptId, started_at: b.startedAt, duration_ms: b.durationMs, summary: JSON.stringify(b.summary) })
        .execute();
    }
    return reply.code(exists ? 200 : 201).send({ ok: true });
  });

  app.get("/", async (req) => {
    const rows = await app.db
      .selectFrom("practice_sessions")
      .selectAll()
      .where("user_id", "=", req.user!.id)
      .orderBy("started_at", "desc")
      .limit(200)
      .execute();
    return {
      sessions: rows.map((r) => ({ id: r.id, scriptId: r.script_id, startedAt: r.started_at, durationMs: r.duration_ms, summary: JSON.parse(r.summary) as unknown })),
    };
  });
}
