import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clearSessionCookie, createSession, hashPassword, hashToken, publicUser, SESSION_COOKIE, setSessionCookie, verifyPassword } from "../auth.js";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(10, "Password must be at least 10 characters").max(256),
});

// A real hash, so unknown emails take as long as wrong passwords.
const DUMMY_HASH = await hashPassword("timing-equaliser-password");

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/register", strict, async (req, reply) => {
    const { email, password } = credentials.parse(req.body);
    const existing = await app.db.selectFrom("users").select("id").where("email", "=", email).executeTakeFirst();
    if (existing) return reply.code(409).send({ error: "An account with this email already exists" });
    const user = {
      id: randomUUID(),
      email,
      password_hash: await hashPassword(password),
      plan: "free" as const,
      research_consent: 0,
      stripe_customer_id: null,
      created_at: new Date().toISOString(),
    };
    await app.db.insertInto("users").values(user).execute();
    const { token, expires } = await createSession(app.db, app.config, user.id);
    setSessionCookie(reply, app.config, token, expires);
    return reply.code(201).send({ user: publicUser(user) });
  });

  app.post("/login", strict, async (req, reply) => {
    const { email, password } = credentials.parse(req.body);
    const user = await app.db.selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst();
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) return reply.code(401).send({ error: "Wrong email or password" });
    const { token, expires } = await createSession(app.db, app.config, user.id);
    setSessionCookie(reply, app.config, token, expires);
    return { user: publicUser(user) };
  });

  app.post("/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await app.db.deleteFrom("session_tokens").where("token_hash", "=", hashToken(token)).execute();
    clearSessionCookie(reply, app.config);
    return { ok: true };
  });

  app.get("/me", { preHandler: app.requireUser }, async (req) => ({ user: publicUser(req.user!) }));
}
