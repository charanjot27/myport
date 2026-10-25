import type { FastifyInstance } from "fastify";
import { ping } from "../db.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", { config: { rateLimit: false } }, async (_req, reply) => {
    const db = await ping(app.db);
    return reply.code(db ? 200 : 503).send({
      status: db ? "ok" : "degraded",
      db,
      features: {
        cloudSpeech: !!app.config.DEEPGRAM_API_KEY,
        billing: !!(app.config.STRIPE_SECRET_KEY && app.config.STRIPE_PRICE_ID),
        signedLiveness: !!app.config.LIVENESS_PRIVATE_KEY,
      },
    });
  });
}
