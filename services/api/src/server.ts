import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb, migrate } from "./db.js";

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const applied = await migrate(db);
const app = await buildApp({ db, config });
if (applied) app.log.info(`applied ${applied} migration(s)`);
if (!config.LIVENESS_PRIVATE_KEY) app.log.warn("LIVENESS_PRIVATE_KEY not set: using a throwaway signing key (dev only)");

// Expired sessions and challenges are cleaned up hourly.
const cleanup = setInterval(() => {
  const now = new Date().toISOString();
  void db.deleteFrom("session_tokens").where("expires_at", "<", now).execute().catch(() => undefined);
  void db.deleteFrom("liveness_challenges").where("expires_at", "<", now).execute().catch(() => undefined);
}, 3600_000);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  clearInterval(cleanup);
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.PORT, host: config.HOST });
