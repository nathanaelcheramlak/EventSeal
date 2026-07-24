import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), override: false });
loadDotenv({ path: path.resolve(process.cwd(), ".env"), override: false });

export function readDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  validateDatabaseUrl(databaseUrl);

  return databaseUrl;
}

function validateDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";

    if (!isPostgres || !url.hostname || !url.pathname || url.pathname === "/") {
      throw new Error("Invalid PostgreSQL URL shape");
    }
  } catch {
    console.error("DATABASE_URL is not a valid PostgreSQL connection URL.");
    console.error("Expected format:");
    console.error("postgresql://user:password@host:port/database?sslmode=require");
    console.error("If the password contains @, #, ?, /, :, or spaces, percent-encode those characters.");
    process.exit(1);
  }
}

