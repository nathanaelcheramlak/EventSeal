import jwt from "@fastify/jwt";
import type { DbClient } from "@prom-event/db";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";
import { auditRoutes } from "./audit.routes.js";

const organizerId = "2ef47ea7-8280-4d48-bbde-40c98b138a19";
const qrCodeId = "51bb3bf9-7448-4428-aa28-df8fd94da122";

const config: Env = {
  NODE_ENV: "test",
  PORT: 4000,
  DATABASE_URL: "postgresql://user:password@example.com:5432/database",
  JWT_SECRET: "test-jwt-secret-with-at-least-32-characters",
  QR_SIGNING_SECRET: "test-qr-secret-with-at-least-32-characters",
  WEB_ORIGIN: "http://localhost:5173",
  WEB_ORIGINS: ["http://localhost:5173"],
  TOKEN_TTL_SECONDS: 60,
  QR_MAX_TTL_DAYS: 30
};

describe("audit routes", () => {
  let app: FastifyInstance;
  let dbMock: ReturnType<typeof createAuditSelectDbMock>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbMock = createAuditSelectDbMock([auditRow(2), auditRow(1)]);
    app = await buildAuditTestApp(dbMock.db);
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects requests without an organizer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/logs"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Unauthorized" });
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("returns paginated logs newest first", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/logs?limit=1",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(dbMock.orderBy).toHaveBeenCalledTimes(1);
    expect(dbMock.limit).toHaveBeenCalledWith(2);
    expect(response.json()).toEqual({
      logs: [
        {
          id: 2,
          organizerId,
          organizerUsername: "alice",
          qrCodeId,
          action: "QR_GENERATED",
          result: "SUCCESS",
          metadata: {},
          createdAt: expect.any(String)
        }
      ],
      nextCursor: 1
    });
  });

  it("accepts supported audit filters", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/logs?action=QR_GENERATED&result=SUCCESS&organizerUsername=Alice&qrCodeId=${qrCodeId}&limit=50`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(dbMock.where).toHaveBeenCalledWith(expect.anything());
    expect(dbMock.limit).toHaveBeenCalledWith(51);
  });

  it("rejects unsupported audit filter values", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/logs?action=QR_DELETED",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Validation failed" });
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

async function buildAuditTestApp(db: DbClient) {
  const app = Fastify({ logger: false });

  app.decorate("config", config);
  app.decorate("db", db);
  app.decorate("dbPool", { end: async () => undefined });

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

  app.setErrorHandler((error, _request, reply) => {
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

    reply.code(500).send({ message: "Internal server error" });
  });

  await app.register(auditRoutes, { prefix: "/logs" });

  return app;
}

function authHeaders(app: FastifyInstance) {
  const token = app.jwt.sign(
    {
      username: "alice"
    },
    {
      sub: organizerId
    }
  );

  return {
    authorization: `Bearer ${token}`
  };
}

function createAuditSelectDbMock(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  const select = vi.fn().mockReturnValue({ from });

  return {
    db: { select } as unknown as DbClient,
    select,
    from,
    leftJoin,
    where,
    orderBy,
    limit
  };
}

function auditRow(id: number) {
  return {
    id,
    organizerId,
    organizerUsername: "alice",
    qrCodeId,
    action: "QR_GENERATED",
    result: "SUCCESS",
    metadata: {},
    createdAt: new Date("2026-07-24T08:00:00.000Z")
  };
}
