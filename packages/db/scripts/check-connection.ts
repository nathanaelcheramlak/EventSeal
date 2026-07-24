import pg from "pg";
import { readDatabaseUrl } from "./env.js";

const { Pool } = pg;
const databaseUrl = readDatabaseUrl();

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  idleTimeoutMillis: 5_000
});

try {
  const nowResult = await pool.query<{ now: Date }>("select now()");
  const schemaResult = await pool.query<{
    organizers_exists: boolean;
    qr_codes_exists: boolean;
    audit_logs_exists: boolean;
    schema_migrations_exists: boolean;
  }>(`
    select
      to_regclass('public.organizers') is not null as organizers_exists,
      to_regclass('public.qr_codes') is not null as qr_codes_exists,
      to_regclass('public.audit_logs') is not null as audit_logs_exists,
      to_regclass('public.schema_migrations') is not null as schema_migrations_exists
  `);

  const schema = schemaResult.rows[0];

  console.log("Database connection OK.");
  console.log(`Server time: ${nowResult.rows[0]?.now.toISOString()}`);
  console.log(`organizers table: ${schema?.organizers_exists ? "present" : "missing"}`);
  console.log(`qr_codes table: ${schema?.qr_codes_exists ? "present" : "missing"}`);
  console.log(`audit_logs table: ${schema?.audit_logs_exists ? "present" : "missing"}`);
  console.log(`schema_migrations table: ${schema?.schema_migrations_exists ? "present" : "missing"}`);
} finally {
  await pool.end();
}
