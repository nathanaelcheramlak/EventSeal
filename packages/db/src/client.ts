import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

export function createDb(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}

export type DbClient = ReturnType<typeof createDb>["db"];

