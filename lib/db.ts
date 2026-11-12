// One tiny query helper for the whole app.
// - On Vercel: Neon Postgres over HTTP (set DATABASE_URL).
// - On your laptop with no DATABASE_URL: an embedded Postgres (PGlite) saved in ./.localdb
import { neon } from "@neondatabase/serverless";
import { createRequire } from "node:module";
import path from "node:path";

type Row = Record<string, any>;
type Runner = (text: string, params?: unknown[]) => Promise<Row[]>;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
     id serial PRIMARY KEY,
     name text NOT NULL,
     name_key text NOT NULL UNIQUE,
     pass_hash text NOT NULL,
     is_admin boolean NOT NULL DEFAULT false,
     avatar text NOT NULL DEFAULT '🦊',
     color text NOT NULL DEFAULT 'marigold',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS invites (
     token text PRIMARY KEY,
     name text NOT NULL,
     kind text NOT NULL DEFAULT 'invite',
     user_id integer,
     created_at timestamptz NOT NULL DEFAULT now(),
     used_at timestamptz
   )`,
  `CREATE TABLE IF NOT EXISTS games (
     id serial PRIMARY KEY,
     host_id integer NOT NULL,
     status text NOT NULL DEFAULT 'lobby',
     pairs integer NOT NULL,
     invited jsonb NOT NULL DEFAULT '[]',
     players jsonb NOT NULL DEFAULT '[]',
     state jsonb,
     result jsonb,
     version integer NOT NULL DEFAULT 1,
     rematch_of integer,
     next_game_id integer,
     created_at timestamptz NOT NULL DEFAULT now(),
     started_at timestamptz,
     finished_at timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS games_status_idx ON games (status)`,
];

const g = globalThis as unknown as { __jodiDb?: Promise<Runner> };

async function connect(): Promise<Runner> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let run: Runner;
  if (url) {
    const sql = neon(url);
    run = async (text, params = []) => (await sql.query(text, params as any[])) as Row[];
  } else {
    if (process.env.VERCEL) {
      throw new Error("No database connected. Add a Neon Postgres database to this Vercel project (DATABASE_URL).");
    }
    // Loaded lazily so it never ships to production.
    const req = createRequire(path.join(process.cwd(), "package.json"));
    const pkg = "@electric-sql/pglite";
    const { PGlite } = req(pkg);
    const db = new PGlite(process.env.LOCAL_DB_DIR || path.join(process.cwd(), ".localdb"));
    run = async (text, params = []) => (await db.query(text, params)).rows as Row[];
  }
  for (const stmt of SCHEMA) await run(stmt);
  return run;
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!g.__jodiDb) {
    g.__jodiDb = connect().catch((e) => {
      g.__jodiDb = undefined;
      throw e;
    });
  }
  const run = await g.__jodiDb;
  return (await run(text, params)) as T[];
}
