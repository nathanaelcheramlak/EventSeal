import { createDb, organizers } from "@prom-event/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { loadEnv } from "../src/config/env.js";
import { normalizeUsername, PASSWORD_HASH_COST } from "../src/modules/auth/auth.service.js";

const [, , rawUsername, password] = process.argv;

if (!rawUsername || !password) {
  console.error('Usage: pnpm create-organizer <username> "<password>"');
  process.exit(1);
}

const username = normalizeUsername(rawUsername);

if (!username) {
  console.error("Username cannot be empty.");
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

  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_COST);

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

  if (!created) {
    console.error("Failed to create organizer.");
    process.exit(1);
  }

  console.log(`Created organizer "${created.username}" with id ${created.id}.`);
} finally {
  await pool.end();
}
