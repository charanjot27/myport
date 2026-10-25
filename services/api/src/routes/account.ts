import type { FastifyInstance } from "fastify";
import { clearSessionCookie, publicUser } from "../auth.js";

/** Data-subject rights: export everything we hold, or delete it all. */
export async function accountRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  app.get("/export", async (req) => {
    const userId = req.user!.id;
    const [scripts, sessions, research, attestations] = await Promise.all([
      app.db.selectFrom("scripts").selectAll().where("user_id", "=", userId).execute(),
      app.db.selectFrom("practice_sessions").selectAll().where("user_id", "=", userId).execute(),
      app.db.selectFrom("research_sessions").select(["id", "created_at", "record"]).where("user_id", "=", userId).execute(),
      app.db.selectFrom("attestations").selectAll().where("user_id", "=", userId).execute(),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      user: { ...publicUser(req.user!), createdAt: req.user!.created_at },
      scripts,
      sessions: sessions.map((s) => ({ ...s, summary: JSON.parse(s.summary) as unknown })),
      research: research.map((r) => ({ ...r, record: JSON.parse(r.record) as unknown })),
      attestations,
    };
  });

  app.delete("/", async (req, reply) => {
    const userId = req.user!.id;
    // Explicit deletes so this also works where foreign-key cascades are off.
    await app.db.transaction().execute(async (tx) => {
      for (const table of ["session_tokens", "scripts", "practice_sessions", "research_sessions", "liveness_challenges", "attestations"] as const) {
        await tx.deleteFrom(table).where("user_id", "=", userId).execute();
      }
      await tx.deleteFrom("users").where("id", "=", userId).execute();
    });
    clearSessionCookie(reply, app.config);
    return { deleted: true };
  });
}
