import type { FastifyInstance } from "fastify";
import { z } from "zod";

const id = z.string().uuid();
const body = z.object({
  title: z.string().max(300),
  source: z.string().max(500_000),
  updatedAt: z.string().datetime(),
});

export async function scriptRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireUser);

  app.get("/", async (req) => {
    const rows = await app.db.selectFrom("scripts").selectAll().where("user_id", "=", req.user!.id).execute();
    return {
      scripts: rows.map((r) => ({ id: r.id, title: r.title, source: r.deleted ? "" : r.source, updatedAt: r.updated_at, version: r.version, deleted: !!r.deleted })),
    };
  });

  /** Upsert. The server version increments on every write so clients can detect remote changes. */
  app.put("/:id", async (req) => {
    const scriptId = id.parse((req.params as { id: string }).id);
    const b = body.parse(req.body);
    const userId = req.user!.id;
    return app.db.transaction().execute(async (tx) => {
      const existing = await tx.selectFrom("scripts").select(["version"]).where("user_id", "=", userId).where("id", "=", scriptId).executeTakeFirst();
      const version = (existing?.version ?? 0) + 1;
      if (existing) {
        await tx
          .updateTable("scripts")
          .set({ title: b.title, source: b.source, updated_at: b.updatedAt, version, deleted: 0 })
          .where("user_id", "=", userId)
          .where("id", "=", scriptId)
          .execute();
      } else {
        await tx.insertInto("scripts").values({ id: scriptId, user_id: userId, title: b.title, source: b.source, updated_at: b.updatedAt, version, deleted: 0 }).execute();
      }
      return { version };
    });
  });

  /** Soft delete: keeps a tombstone so other devices learn about the deletion. */
  app.delete("/:id", async (req) => {
    const scriptId = id.parse((req.params as { id: string }).id);
    const res = await app.db
      .updateTable("scripts")
      .set((eb) => ({ deleted: 1, source: "", updated_at: new Date().toISOString(), version: eb("version", "+", 1) }))
      .where("user_id", "=", req.user!.id)
      .where("id", "=", scriptId)
      .executeTakeFirst();
    return { deleted: Number(res.numUpdatedRows) > 0 };
  });
}
