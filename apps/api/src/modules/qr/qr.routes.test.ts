import jwt from "@fastify/jwt";
import type { DbClient } from "@prom-event/db";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";
import { signQrToken, verifyQrToken } from "../../utils/qr-token.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { qrRoutes } from "./qr.routes.js";

vi.mock("../audit/audit.service.js", () => ({
  writeAuditLog: vi.fn()
}));

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

describe("QR generation route", () => {
  let app: FastifyInstance;
  let dbMock: ReturnType<typeof createInsertDbMock>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbMock = createInsertDbMock();
    app = await buildQrTestApp(dbMock.db);
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates an active QR record and returns a signed token plus image", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const response = await app.inject({
      method: "POST",
      url: "/qr",
      headers: authHeaders(app),
      payload: {
        name: "John Doe",
        phone: "09171234567",
        expiresAt
      }
    });

    expect(response.statusCode).toBe(200);
    expect(dbMock.values).toHaveBeenCalledWith({
      createdBy: organizerId,
      name: "John Doe",
      phone: "09171234567",
      status: "ACTIVE",
      expiresAt: expect.any(Date)
    });

    const body = response.json<{
      qrId: string;
      qrToken: string;
      qrImage: string;
    }>();

    expect(body.qrId).toBe(qrCodeId);
    expect(body.qrImage).toMatch(/^data:image\/png;base64,/);

    const tokenPayload = verifyQrToken(body.qrToken, config.QR_SIGNING_SECRET);

    expect(tokenPayload).toEqual({
      id: qrCodeId,
      exp: Math.floor(new Date(expiresAt).getTime() / 1000)
    });
    expect(Object.keys(tokenPayload).sort()).toEqual(["exp", "id"]);
    expect(JSON.stringify(tokenPayload)).not.toContain("John Doe");
    expect(JSON.stringify(tokenPayload)).not.toContain("09171234567");

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        qrCodeId,
        action: "QR_GENERATED",
        result: "SUCCESS"
      },
      expect.anything()
    );
  });

  it("stores a missing phone number as null", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const response = await app.inject({
      method: "POST",
      url: "/qr",
      headers: authHeaders(app),
      payload: {
        name: "John Doe",
        expiresAt
      }
    });

    expect(response.statusCode).toBe(200);
    expect(dbMock.values).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: null
      })
    );
  });

  it("rejects past expiration dates", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/qr",
      headers: authHeaders(app),
      payload: {
        name: "John Doe",
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Expiration must be in the future" });
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("rejects expiration dates beyond the configured maximum", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/qr",
      headers: authHeaders(app),
      payload: {
        name: "John Doe",
        expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Expiration cannot be more than 30 days in the future" });
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("QR verification route", () => {
  let app: FastifyInstance;
  let dbMock: ReturnType<typeof createSelectDbMock>;

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns stored QR data for a valid active token", async () => {
    dbMock = createSelectDbMock([qrRecord({ status: "ACTIVE" })]);
    app = await buildQrTestApp(dbMock.db);

    const response = await verifyRequest(app, validQrToken());

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      valid: true,
      status: "ACTIVE",
      data: {
        name: "John Doe",
        phone: "09171234567"
      }
    });
    expect(dbMock.limit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        qrCodeId,
        action: "QR_VERIFY_SUCCESS",
        result: "SUCCESS"
      },
      expect.anything()
    );
  });

  it("rejects modified tokens before database lookup", async () => {
    dbMock = createSelectDbMock([qrRecord({ status: "ACTIVE" })]);
    app = await buildQrTestApp(dbMock.db);
    const token = validQrToken();
    const modifiedToken = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    const response = await verifyRequest(app, modifiedToken);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ valid: false, reason: "INVALID_TOKEN" });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        action: "QR_VERIFY_FAILED",
        result: "FAILURE",
        metadata: { reason: "INVALID_TOKEN" }
      },
      expect.anything()
    );
  });

  it("rejects expired token payloads before database lookup", async () => {
    dbMock = createSelectDbMock([qrRecord({ status: "ACTIVE" })]);
    app = await buildQrTestApp(dbMock.db);

    const response = await verifyRequest(app, validQrToken(-60));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ valid: false, reason: "EXPIRED" });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        qrCodeId,
        action: "QR_VERIFY_FAILED",
        result: "FAILURE",
        metadata: { reason: "EXPIRED" }
      },
      expect.anything()
    );
  });

  it("rejects missing QR records", async () => {
    dbMock = createSelectDbMock([]);
    app = await buildQrTestApp(dbMock.db);

    const response = await verifyRequest(app, validQrToken());

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ valid: false, reason: "NOT_FOUND" });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        qrCodeId,
        action: "QR_VERIFY_FAILED",
        result: "FAILURE",
        metadata: { reason: "NOT_FOUND" }
      },
      expect.anything()
    );
  });

  it("rejects QR records whose database expiration has passed", async () => {
    dbMock = createSelectDbMock([qrRecord({ status: "ACTIVE", expiresAtOffsetSeconds: -60 })]);
    app = await buildQrTestApp(dbMock.db);

    const response = await verifyRequest(app, validQrToken(3600));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ valid: false, reason: "EXPIRED" });
  });

  it.each(["USED", "REVOKED", "EXPIRED"] as const)("rejects %s QR records", async (status) => {
    dbMock = createSelectDbMock([qrRecord({ status })]);
    app = await buildQrTestApp(dbMock.db);

    const response = await verifyRequest(app, validQrToken());

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ valid: false, reason: status });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        qrCodeId,
        action: "QR_VERIFY_FAILED",
        result: "FAILURE",
        metadata: { reason: status }
      },
      expect.anything()
    );
  });
});

describe("QR lifecycle routes", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists generated QR records newest first", async () => {
    const dbMock = createLifecycleSelectDbMock([qrRecord({ status: "ACTIVE" })]);
    app = await buildQrTestApp(dbMock.db);

    const response = await app.inject({
      method: "GET",
      url: "/qr",
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      records: [
        {
          id: qrCodeId,
          name: "John Doe",
          phone: "09171234567",
          status: "ACTIVE",
          createdBy: organizerId,
          createdByUsername: "alice",
          createdAt: expect.any(String),
          expiresAt: expect.any(String)
        }
      ],
      nextCursor: null
    });
    expect(dbMock.limit).toHaveBeenCalledWith(51);
  });

  it("returns one QR record detail", async () => {
    const dbMock = createLifecycleSelectDbMock([qrRecord({ status: "ACTIVE" })]);
    app = await buildQrTestApp(dbMock.db);

    const response = await app.inject({
      method: "GET",
      url: `/qr/${qrCodeId}`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      record: {
        id: qrCodeId,
        name: "John Doe",
        phone: "09171234567",
        status: "ACTIVE",
        createdBy: organizerId,
        createdByUsername: "alice",
        createdAt: expect.any(String),
        expiresAt: expect.any(String)
      }
    });
  });

  it("revokes an active QR record and writes an audit entry", async () => {
    const dbMock = createRevokeDbMock({
      revokedRows: [qrRecord({ status: "REVOKED" })],
      detailRows: [qrRecord({ status: "REVOKED" })]
    });
    app = await buildQrTestApp(dbMock.db);

    const response = await app.inject({
      method: "POST",
      url: `/qr/${qrCodeId}/revoke`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(dbMock.set).toHaveBeenCalledWith({ status: "REVOKED" });
    expect(response.json()).toEqual({
      record: {
        id: qrCodeId,
        name: "John Doe",
        phone: "09171234567",
        status: "REVOKED",
        createdBy: organizerId,
        createdByUsername: "alice",
        createdAt: expect.any(String),
        expiresAt: expect.any(String)
      }
    });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        qrCodeId,
        action: "QR_REVOKED",
        result: "SUCCESS",
        metadata: { previousStatus: "ACTIVE", nextStatus: "REVOKED" }
      },
      expect.anything()
    );
  });

  it("rejects revoking a non-active QR record", async () => {
    const dbMock = createRevokeDbMock({
      revokedRows: [],
      detailRows: [qrRecord({ status: "USED" })]
    });
    app = await buildQrTestApp(dbMock.db);

    const response = await app.inject({
      method: "POST",
      url: `/qr/${qrCodeId}/revoke`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "Cannot revoke QR with status USED" });
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });
});

async function buildQrTestApp(db: DbClient) {
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

  await app.register(qrRoutes, { prefix: "/qr" });

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

function createInsertDbMock() {
  const returning = vi.fn().mockResolvedValue([
    {
      id: qrCodeId,
      createdBy: organizerId,
      name: "John Doe",
      phone: "09171234567",
      status: "ACTIVE",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  return {
    db: { insert } as unknown as DbClient,
    insert,
    values,
    returning
  };
}

function createSelectDbMock(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return {
    db: { select } as unknown as DbClient,
    select,
    from,
    where,
    limit
  };
}

function createLifecycleSelectDbMock(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin, where });
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

function createRevokeDbMock({
  revokedRows,
  detailRows
}: {
  revokedRows: unknown[];
  detailRows: unknown[];
}) {
  const returning = vi.fn().mockResolvedValue(revokedRows);
  const updateWhere = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set });

  const selectMock = createLifecycleSelectDbMock(detailRows);

  return {
    db: {
      update,
      select: selectMock.select
    } as unknown as DbClient,
    update,
    set,
    updateWhere,
    returning,
    select: selectMock.select
  };
}

function qrRecord({
  status,
  expiresAtOffsetSeconds = 3600
}: {
  status: "ACTIVE" | "USED" | "REVOKED" | "EXPIRED";
  expiresAtOffsetSeconds?: number;
}) {
  return {
    id: qrCodeId,
    createdBy: organizerId,
    createdByUsername: "alice",
    name: "John Doe",
    phone: "09171234567",
    status,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + expiresAtOffsetSeconds * 1000)
  };
}

function validQrToken(expiresInSeconds = 3600) {
  return signQrToken(
    {
      id: qrCodeId,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds
    },
    config.QR_SIGNING_SECRET
  );
}

async function verifyRequest(app: FastifyInstance, token: string) {
  return app.inject({
    method: "POST",
    url: "/qr/verify",
    headers: authHeaders(app),
    payload: {
      token
    }
  });
}
