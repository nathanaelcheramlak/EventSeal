import { createDb, organizers } from "@prom-event/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { loadEnv } from "../src/config/env.js";

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Usage: pnpm create-organizer <username> "<password>"');
  process.exit(1);
}

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);

try {
  const [existing] = await db
    .select({ id: organizers.id })
    .from(organizers)
    .where(eq(organizers.username, username))
    .limit(1);

  if (existing) {
    console.error(`Organizer "${username}" already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [created] = await db
    .insert(organizers)
    .values({
      username,
      passwordHash
    })
    .returning({
      id: organizers.id,
      username: organizers.username
    });

  console.log(`Created organizer "${created.username}" with id ${created.id}.`);
} finally {
  await pool.end();
}
