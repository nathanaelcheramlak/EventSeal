import { organizers, type DbClient } from "@prom-event/db";
import { eq } from "drizzle-orm";

export type OrganizerCredentials = {
  id: string;
  username: string;
  passwordHash: string;
};

export const PASSWORD_HASH_COST = 12;

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function findOrganizerByUsername(
  db: DbClient,
  username: string
): Promise<OrganizerCredentials | undefined> {
  const [organizer] = await db
    .select({
      id: organizers.id,
      username: organizers.username,
      passwordHash: organizers.passwordHash
    })
    .from(organizers)
    .where(eq(organizers.username, username))
    .limit(1);

  return organizer;
}
