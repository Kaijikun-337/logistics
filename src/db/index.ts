import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The database is optional. Without DATABASE_URL the app runs in demo mode:
 * parsing, dashboards and exports all work, but nothing is persisted and the
 * import history is empty. This keeps `next build` and `next start` working on
 * a host where no Postgres has been provisioned yet.
 */
const databaseUrl = process.env.DATABASE_URL;

export const isDatabaseConfigured = Boolean(databaseUrl);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: ReturnType<typeof drizzle>;
};

let cached: ReturnType<typeof drizzle> | null = null;

export function getDb(): ReturnType<typeof drizzle> | null {
  if (!databaseUrl) return null;
  if (cached) return cached;

  const pool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({
      connectionString: databaseUrl,
      max: 5,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }

  cached = globalForDb.__arenaNextJsPostgresqlDb ?? drizzle(pool);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlDb = cached;
  }

  return cached;
}

/** Message used wherever persistence is unavailable. */
export const DEMO_MODE_MESSAGE =
  "Demo mode: no database is configured, so this import was parsed but not saved. Add DATABASE_URL to keep history.";
