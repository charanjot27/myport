import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("0.0.0.0"),
  /** postgres://… in production; a file path or ":memory:" for SQLite. */
  DATABASE_URL: z.string().default("./data/promptsense.sqlite"),
  /** Comma-separated origins allowed to call the API with cookies. */
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:4173"),
  /** "lax" when the web app and API share a site (recommended), "none" for cross-site. */
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_DAYS: z.coerce.number().default(30),
  DEEPGRAM_API_KEY: z.string().optional(),
  /** Let free accounts use cloud speech (e.g. for a pilot). */
  CLOUD_ASR_FOR_ALL: z.coerce.boolean().default(false),
  /** Ed25519 private key (PKCS#8 PEM) for liveness attestations. Generated per process if missing (dev only). */
  LIVENESS_PRIVATE_KEY: z.string().optional(),
  LIVENESS_KEY_ID: z.string().default("dev"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  /** Public URL of the web app, used for Stripe redirects. */
  APP_URL: z.string().default("http://localhost:5173"),
  /** Bearer token for admin endpoints (research export). */
  ADMIN_TOKEN: z.string().optional(),
  /** Maximum research record upload size in bytes. */
  MAX_RESEARCH_BYTES: z.coerce.number().default(25 * 1024 * 1024),
  TRUST_PROXY: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof schema> & { corsOrigins: string[]; production: boolean };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.parse(env);
  const config: Config = {
    ...parsed,
    corsOrigins: parsed.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    production: parsed.NODE_ENV === "production",
  };
  if (config.production) {
    const missing = (["LIVENESS_PRIVATE_KEY"] as const).filter((k) => !config[k]);
    if (missing.length) throw new Error(`Missing required production settings: ${missing.join(", ")}`);
    if (config.DATABASE_URL.startsWith("./") || config.DATABASE_URL === ":memory:") {
      console.warn("Production is using SQLite. Use PostgreSQL (DATABASE_URL=postgres://…) for multi-instance deployments.");
    }
  }
  return config;
}
