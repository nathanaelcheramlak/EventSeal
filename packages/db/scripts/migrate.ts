import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { readDatabaseUrl } from "./env.js";

const { Pool } = pg;
const databaseUrl = readDatabaseUrl();

const migrationsDir = path.resolve(process.cwd(), "migrations");
const migrationFiles = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

if (migrationFiles.length === 0) {
  console.log("No migrations found.");
  process.exit(0);
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  idleTimeoutMillis: 5_000
});

const client = await pool.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  for (const migrationFile of migrationFiles) {
    const applied = await client.query("select id from schema_migrations where id = $1", [migrationFile]);

    if (applied.rowCount) {
      console.log(`Skipping ${migrationFile}; already applied.`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, migrationFile), "utf8");

    console.log(`Applying ${migrationFile}...`);

    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [migrationFile]);
      await client.query("commit");
      console.log(`Applied ${migrationFile}.`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  console.log("Database migrations complete.");
} finally {
  client.release();
  await pool.end();
}
