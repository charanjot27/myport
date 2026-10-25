import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";

const Hello = z.object({ id: z.string().uuid() });

/**
 * Public, anonymous user counter. Each browser makes a random ID once and says
 * hello; we keep only a hash of it, so the count is unique browsers with no
 * account, email or IP address stored.
 */
export async function statsRoutes(app: FastifyInstance) {
  let cache: { users: number; at: number } | null = null;
  const count = async (fresh = false): Promise<number> => {
    if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.users;
    const row = await app.db.selectFrom("installs").select(sql<number>`count(*)`.as("n")).executeTakeFirst();
    cache = { users: Number(row?.n ?? 0), at: Date.now() };
    return cache.users;
  };

  app.get("/", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (_req, reply) => {
    reply.header("cache-control", "public, max-age=30");
    return { users: await count() };
  });

  app.post("/hello", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = Hello.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid id" });
    const idHash = createHash("sha256").update(`jotr-install:${body.data.id}`).digest("hex");
    const res = await app.db
      .insertInto("installs")
      .values({ id_hash: idHash, first_seen: new Date().toISOString() })
      .onConflict((oc) => oc.column("id_hash").doNothing())
      .executeTakeFirst();
    const isNew = Number(res.numInsertedOrUpdatedRows ?? 0) > 0;
    return { users: await count(isNew), new: isNew };
  });
}
