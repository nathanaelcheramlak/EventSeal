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
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(86_400)
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}
