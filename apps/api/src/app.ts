import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { createDb, type DbClient } from "@prom-event/db";
import Fastify from "fastify";
import { ZodError } from "zod";
import { loadEnv } from "./config/env.js";
import type { Env } from "./config/env.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { auditRoutes } from "./modules/audit/audit.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { qrRoutes } from "./modules/qr/qr.routes.js";
import { HttpError } from "./utils/http-error.js";

type BuildAppOptions = {
  config?: Env;
  dbClient?: {
    db: DbClient;
    pool: {
      end: () => Promise<void>;
    };
  };
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadEnv();
  const dbClient = options.dbClient ?? createDb(config.DATABASE_URL);

  const app = Fastify({
    logger: options.logger ?? true
  });

  app.decorate("config", config);
  app.decorate("db", dbClient.db);
  app.decorate("dbPool", dbClient.pool);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.WEB_ORIGINS,
    credentials: false
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });
  await app.register(jwt, {
    secret: config.JWT_SECRET
  });

  app.decorate("authenticate", async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new HttpError(401, "Unauthorized");
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        message: "Validation failed",
        issues: error.issues
      });
      return;
    }

    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ message: error.message });
      return;
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled request error");
    }

    reply.code(statusCode).send({
      message: statusCode >= 500 ? "Internal server error" : error.message
    });
  });

  app.addHook("onClose", async () => {
    await dbClient.pool.end();
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(qrRoutes, { prefix: "/qr" });
  await app.register(auditRoutes, { prefix: "/logs" });

  return app;
}
