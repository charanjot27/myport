import type { FastifyInstance } from "fastify";

/**
 * Short-lived Deepgram token for browser streaming. The long-lived API key
 * stays on the server; the browser gets a JWT valid for 60 seconds, enough
 * to open the WebSocket (the connection outlives the token).
 */
export async function asrRoutes(app: FastifyInstance) {
  app.post("/token", { preHandler: app.requireUser, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const key = app.config.DEEPGRAM_API_KEY;
    if (!key) return reply.code(503).send({ error: "Cloud speech is not configured on this server" });
    if (req.user!.plan !== "pro" && !app.config.CLOUD_ASR_FOR_ALL) {
      return reply.code(402).send({ error: "Cloud speech is a Pro feature" });
    }
    const res = await app.fetchImpl("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { authorization: `Token ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });
    if (!res.ok) {
      req.log.error({ status: res.status }, "deepgram grant failed");
      return reply.code(502).send({ error: "Speech provider unavailable" });
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return { token: data.access_token, expiresIn: data.expires_in };
  });
}
