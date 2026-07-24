import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), override: false });
loadDotenv({ path: path.resolve(process.cwd(), ".env"), override: false });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  QR_SIGNING_SECRET: z.string().min(32),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  QR_MAX_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30)
});

export type Env = z.infer<typeof envSchema> & {
  WEB_ORIGINS: string[];
};

export function loadEnv(): Env {
  const env = envSchema.parse(process.env);
  const webOrigins = env.WEB_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

  for (const origin of webOrigins) {
    try {
      new URL(origin);
    } catch {
      throw new Error(`Invalid WEB_ORIGIN value: ${origin}`);
    }
  }

  return {
    ...env,
    WEB_ORIGINS: webOrigins
  };
}
