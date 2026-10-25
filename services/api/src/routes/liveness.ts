import { randomBytes, randomUUID } from "node:crypto";
import { generateChallenge, scoreLiveness } from "@promptsense/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const CHALLENGE_TTL_MS = 60_000;

const verifyBody = z.object({
  challengeId: z.string().uuid(),
  samples: z
    .array(z.object({ t: z.number().finite(), rgb: z.tuple([z.number().min(0).max(255), z.number().min(0).max(255), z.number().min(0).max(255)]) }))
    .min(1)
    .max(2000),
});

/**
 * Screen-light liveness. The server picks the random seed, so the colour
 * sequence is unknown until the check starts; it scores the samples itself
 * and signs the outcome. Challenges are single-use and expire after a minute.
 */
export async function livenessRoutes(app: FastifyInstance) {
  app.post("/challenge", { preHandler: app.requireUser, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const id = randomUUID();
    const seed = randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + CHALLENGE_TTL_MS);
    await app.db.insertInto("liveness_challenges").values({ id, user_id: req.user!.id, seed, expires_at: expires.toISOString(), used: 0 }).execute();
    return { ...generateChallenge(id, seed), expiresAt: expires.toISOString() };
  });

  app.post("/verify", { preHandler: app.requireUser }, async (req, reply) => {
    const { challengeId, samples } = verifyBody.parse(req.body);
    const userId = req.user!.id;
    const row = await app.db
      .selectFrom("liveness_challenges")
      .selectAll()
      .where("id", "=", challengeId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (!row) return reply.code(404).send({ error: "Unknown challenge" });
    if (row.used) return reply.code(409).send({ error: "Challenge already used" });
    // Allow the challenge duration plus slack after expiry of the issue window.
    if (row.expires_at < new Date(Date.now() - 30_000).toISOString()) return reply.code(410).send({ error: "Challenge expired" });

    const marked = await app.db
      .updateTable("liveness_challenges")
      .set({ used: 1 })
      .where("id", "=", challengeId)
      .where("used", "=", 0)
      .executeTakeFirst();
    if (Number(marked.numUpdatedRows) === 0) return reply.code(409).send({ error: "Challenge already used" });

    const challenge = generateChallenge(row.id, row.seed);
    const result = scoreLiveness(challenge, samples);
    const now = new Date().toISOString();
    await app.db
      .insertInto("attestations")
      .values({ user_id: userId, challenge_id: challengeId, passed: result.passed ? 1 : 0, score: result.score, created_at: now })
      .execute();

    const attestation = result.passed
      ? app.signer.sign({
          v: 1,
          type: "promptsense.liveness",
          challengeId,
          subject: userId,
          passed: true,
          score: Math.round(result.score * 1000) / 1000,
          lagMs: result.lagMs,
          verifiedAt: now,
        })
      : null;
    return { result, attestation };
  });

  app.get("/keys", async () => ({ keys: [app.signer.jwk()] }));

  /** Public: check an attestation's signature. */
  app.post("/attestations/verify", async (req) => {
    const { payload, signature } = z.object({ payload: z.string().max(10_000), signature: z.string().max(200) }).parse(req.body);
    const valid = app.signer.verify(payload, signature);
    return { valid, ...(valid ? { claims: JSON.parse(payload) as unknown } : {}) };
  });
}
