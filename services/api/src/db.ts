import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SQLite from "better-sqlite3";
import { Kysely, PostgresDialect, SqliteDialect, sql, type Generated } from "kysely";
import pg from "pg";

/**
 * One schema, two engines: PostgreSQL in production, SQLite for local
 * development and tests. Timestamps are ISO strings and JSON is stored as
 * text so queries stay portable.
 */

export interface UserTable {
  id: string;
  email: string;
  password_hash: string;
  plan: "free" | "pro";
  research_consent: number;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface SessionTokenTable {
  token_hash: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface ScriptTable {
  id: string;
  user_id: string;
  title: string;
  source: string;
  updated_at: string;
  version: number;
  deleted: number;
}

export interface PracticeSessionTable {
  id: string;
  user_id: string;
  script_id: string;
  started_at: string;
  duration_ms: number;
  summary: string;
}

export interface ResearchSessionTable {
  id: string;
  user_id: string;
  created_at: string;
  record: string;
  bytes: number;
}

export interface LivenessChallengeTable {
  id: string;
  user_id: string;
  seed: string;
  expires_at: string;
  used: number;
}

export interface AttestationTable {
  id: Generated<number>;
  user_id: string;
  challenge_id: string;
  passed: number;
  score: number;
  created_at: string;
}

/** One row per browser that opened JOTR: a hash of a random ID it made, nothing else. */
export interface InstallTable {
  id_hash: string;
  first_seen: string;
}

export interface Database {
  users: UserTable;
  session_tokens: SessionTokenTable;
  scripts: ScriptTable;
  practice_sessions: PracticeSessionTable;
  research_sessions: ResearchSessionTable;
  liveness_challenges: LivenessChallengeTable;
  attestations: AttestationTable;
  installs: InstallTable;
  schema_migrations: { version: number; applied_at: string };
}

export type DB = Kysely<Database>;
export type Engine = "postgres" | "sqlite";

const engines = new WeakMap<object, Engine>();

export function engineOf(db: DB): Engine {
  return engines.get(db) ?? "sqlite";
}

export function createDb(url: string): DB {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 10 }) }) });
    engines.set(db, "postgres");
    return db;
  }
  if (url !== ":memory:") mkdirSync(dirname(url), { recursive: true });
  const sqlite = new SQLite(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  engines.set(db, "sqlite");
  return db;
}

type Migration = (db: Kysely<unknown>, engine: Engine) => Promise<void>;

const MIGRATIONS: Migration[] = [
  async (db, engine) => {
    await db.schema
      .createTable("users")
      .addColumn("id", "varchar(36)", (c) => c.primaryKey())
      .addColumn("email", "varchar(320)", (c) => c.notNull().unique())
      .addColumn("password_hash", "text", (c) => c.notNull())
      .addColumn("plan", "varchar(16)", (c) => c.notNull().defaultTo("free"))
      .addColumn("research_consent", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("stripe_customer_id", "varchar(64)")
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema
      .createTable("session_tokens")
      .addColumn("token_hash", "varchar(64)", (c) => c.primaryKey())
      .addColumn("user_id", "varchar(36)", (c) => c.notNull().references("users.id").onDelete("cascade"))
      .addColumn("expires_at", "varchar(32)", (c) => c.notNull())
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema
      .createTable("scripts")
      .addColumn("id", "varchar(36)", (c) => c.notNull())
      .addColumn("user_id", "varchar(36)", (c) => c.notNull().references("users.id").onDelete("cascade"))
      .addColumn("title", "text", (c) => c.notNull())
      .addColumn("source", "text", (c) => c.notNull())
      .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
      .addColumn("version", "integer", (c) => c.notNull())
      .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
      .addPrimaryKeyConstraint("scripts_pk", ["user_id", "id"])
      .execute();
    await db.schema
      .createTable("practice_sessions")
      .addColumn("id", "varchar(36)", (c) => c.notNull())
      .addColumn("user_id", "varchar(36)", (c) => c.notNull().references("users.id").onDelete("cascade"))
      .addColumn("script_id", "varchar(36)", (c) => c.notNull())
      .addColumn("started_at", "varchar(32)", (c) => c.notNull())
      .addColumn("duration_ms", "integer", (c) => c.notNull())
      .addColumn("summary", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint("practice_sessions_pk", ["user_id", "id"])
      .execute();
    await db.schema
      .createTable("research_sessions")
      .addColumn("id", "varchar(36)", (c) => c.notNull())
      .addColumn("user_id", "varchar(36)", (c) => c.notNull().references("users.id").onDelete("cascade"))
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .addColumn("record", "text", (c) => c.notNull())
      .addColumn("bytes", "integer", (c) => c.notNull())
      .addPrimaryKeyConstraint("research_sessions_pk", ["user_id", "id"])
      .execute();
    await db.schema
      .createTable("liveness_challenges")
      .addColumn("id", "varchar(36)", (c) => c.primaryKey())
      .addColumn("user_id", "varchar(36)", (c) => c.notNull().references("users.id").onDelete("cascade"))
      .addColumn("seed", "varchar(64)", (c) => c.notNull())
      .addColumn("expires_at", "varchar(32)", (c) => c.notNull())
      .addColumn("used", "integer", (c) => c.notNull().defaultTo(0))
      .execute();
    await db.schema
      .createTable("attestations")
      .addColumn("id", "integer", (c) => (engine === "postgres" ? c.primaryKey().generatedAlwaysAsIdentity() : c.primaryKey().autoIncrement()))
      .addColumn("user_id", "varchar(36)", (c) => c.notNull().references("users.id").onDelete("cascade"))
      .addColumn("challenge_id", "varchar(36)", (c) => c.notNull())
      .addColumn("passed", "integer", (c) => c.notNull())
      .addColumn("score", "real", (c) => c.notNull())
      .addColumn("created_at", "varchar(32)", (c) => c.notNull())
      .execute();
    await db.schema.createIndex("session_tokens_user").on("session_tokens").column("user_id").execute();
  },
  // 2: anonymous user counter
  async (db) => {
    await db.schema
      .createTable("installs")
      .addColumn("id_hash", "varchar(64)", (c) => c.primaryKey())
      .addColumn("first_seen", "varchar(32)", (c) => c.notNull())
      .execute();
  },
];

/** Apply pending migrations in order. Idempotent; safe to call on every start. */
export async function migrate(db: DB): Promise<number> {
  await db.schema
    .createTable("schema_migrations")
    .ifNotExists()
    .addColumn("version", "integer", (c) => c.primaryKey())
    .addColumn("applied_at", "varchar(32)", (c) => c.notNull())
    .execute();
  const applied = new Set((await db.selectFrom("schema_migrations").select("version").execute()).map((r) => r.version));
  let count = 0;
  for (let v = 1; v <= MIGRATIONS.length; v++) {
    if (applied.has(v)) continue;
    await db.transaction().execute(async (tx) => {
      await MIGRATIONS[v - 1]!(tx as unknown as Kysely<unknown>, engineOf(db));
      await tx.insertInto("schema_migrations").values({ version: v, applied_at: new Date().toISOString() }).execute();
    });
    count++;
  }
  return count;
}

export async function ping(db: DB): Promise<boolean> {
  try {
    await sql`select 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}
