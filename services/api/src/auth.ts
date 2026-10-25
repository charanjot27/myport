import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import type { DB, UserTable } from "./db.js";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

/** scrypt parameters: N=2^15 is ~50 ms per hash on a server core. */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_COOKIE = "ps_session";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: DB, config: Config, userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.SESSION_DAYS * 86400_000);
  await db
    .insertInto("session_tokens")
    .values({ token_hash: hashToken(token), user_id: userId, expires_at: expires.toISOString(), created_at: new Date().toISOString() })
    .execute();
  return { token, expires };
}

export function setSessionCookie(reply: FastifyReply, config: Config, token: string, expires: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: config.production || config.COOKIE_SAMESITE === "none",
    sameSite: config.COOKIE_SAMESITE,
    expires,
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/", ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}) });
}

export async function userFromRequest(db: DB, req: FastifyRequest): Promise<UserTable | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = await db
    .selectFrom("session_tokens")
    .innerJoin("users", "users.id", "session_tokens.user_id")
    .selectAll("users")
    .select("session_tokens.expires_at")
    .where("session_tokens.token_hash", "=", hashToken(token))
    .executeTakeFirst();
  if (!row || row.expires_at < new Date().toISOString()) return null;
  const { expires_at: _expires, ...user } = row;
  return user;
}

export function publicUser(u: UserTable) {
  return { id: u.id, email: u.email, plan: u.plan, researchConsent: !!u.research_consent };
}
