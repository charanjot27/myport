import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { userFromRequest } from "./auth.js";
import type { Config } from "./config.js";
import type { DB, UserTable } from "./db.js";
import { accountRoutes } from "./routes/account.js";
import { asrRoutes } from "./routes/asr.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { healthRoutes } from "./routes/health.js";
import { livenessRoutes } from "./routes/liveness.js";
import { researchRoutes } from "./routes/research.js";
import { scriptRoutes } from "./routes/scripts.js";
import { sessionRoutes } from "./routes/sessions.js";
import { AttestationSigner } from "./signing.js";

declare module "fastify" {
  interface FastifyRequest {
    user: UserTable | null;
  }
  interface FastifyInstance {
    db: DB;
    config: Config;
    signer: AttestationSigner;
    fetchImpl: typeof fetch;
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AppDeps {
  db: DB;
  config: Config;
  /** Injected for tests so Deepgram/Stripe calls can be faked. */
  fetchImpl?: typeof fetch;
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp({ db, config, fetchImpl = fetch }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === "test" ? false : { level: config.production ? "info" : "debug", redact: ["req.headers.cookie", "req.headers.authorization"] },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  app.decorate("db", db);
  app.decorate("config", config);
  app.decorate("signer", new AttestationSigner(config.LIVENESS_PRIVATE_KEY, config.LIVENESS_KEY_ID));
  app.decorate("fetchImpl", fetchImpl);
  app.decorateRequest("user", null);

  await app.register(cookie);
  await app.register(cors, { origin: config.corsOrigins, credentials: true, methods: ["GET", "POST", "PUT", "DELETE"] });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  // Keep the raw body for Stripe webhook signature checks.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
    if (!body) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch (e) {
      (e as Error & { statusCode?: number }).statusCode = 400;
      done(e as Error, undefined);
    }
  });

  // CSRF defence for cookie auth: state-changing requests must come from an allowed origin.
  app.addHook("onRequest", async (req, reply) => {
    if (!UNSAFE.has(req.method) || req.url.startsWith("/billing/webhook")) return;
    const origin = req.headers.origin;
    if (origin && !config.corsOrigins.includes(origin)) {
      return reply.code(403).send({ error: "Origin not allowed" });
    }
  });

  app.addHook("preHandler", async (req) => {
    req.user = await userFromRequest(db, req);
  });

  app.decorate("requireUser", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: "Sign in required" });
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid request", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? "Internal error" : (err as Error).message });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(scriptRoutes, { prefix: "/scripts" });
  await app.register(sessionRoutes, { prefix: "/sessions" });
  await app.register(researchRoutes, { prefix: "/research" });
  await app.register(asrRoutes, { prefix: "/asr" });
  await app.register(livenessRoutes, { prefix: "/liveness" });
  await app.register(billingRoutes, { prefix: "/billing" });
  await app.register(accountRoutes, { prefix: "/account" });
  return app;
}
