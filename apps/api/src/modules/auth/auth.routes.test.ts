import jwt from "@fastify/jwt";
import type { DbClient } from "@prom-event/db";
import Fastify, { type FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";
import { authRoutes } from "./auth.routes.js";
import { findOrganizerByUsername, PASSWORD_HASH_COST, type OrganizerCredentials } from "./auth.service.js";
import { writeAuditLog } from "../audit/audit.service.js";

vi.mock("./auth.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth.service.js")>();
  return {
    ...actual,
    findOrganizerByUsername: vi.fn()
  };
});

vi.mock("../audit/audit.service.js", () => ({
  writeAuditLog: vi.fn()
}));

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

const organizerId = "2ef47ea7-8280-4d48-bbde-40c98b138a19";

describe("auth routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildAuthTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns a token for valid organizer credentials", async () => {
    const organizer = await organizerWithPassword("alice", "correct-password");
    vi.mocked(findOrganizerByUsername).mockResolvedValue(organizer);

    const response = await app.inject({
      method: "POST",
      url: "/login",
      payload: {
        username: " Alice ",
        password: "correct-password"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(findOrganizerByUsername)).toHaveBeenCalledWith(expect.anything(), "alice");
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        action: "LOGIN_SUCCESS",
        result: "SUCCESS"
      },
      expect.anything()
    );

    const payload = response.json<{ token: string }>();
    const decoded = app.jwt.verify<{ sub: string; username: string }>(payload.token);

    expect(decoded.sub).toBe(organizerId);
    expect(decoded.username).toBe("alice");
  });

  it("rejects an unknown username with a generic error and audit log", async () => {
    vi.mocked(findOrganizerByUsername).mockResolvedValue(undefined);

    const response = await app.inject({
      method: "POST",
      url: "/login",
      payload: {
        username: "missing",
        password: "any-password"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Invalid username or password" });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId: null,
        action: "LOGIN_FAILED",
        result: "FAILURE",
        metadata: { username: "missing" }
      },
      expect.anything()
    );
  });

  it("rejects an incorrect password with a generic error and audit log", async () => {
    const organizer = await organizerWithPassword("alice", "correct-password");
    vi.mocked(findOrganizerByUsername).mockResolvedValue(organizer);

    const response = await app.inject({
      method: "POST",
      url: "/login",
      payload: {
        username: "alice",
        password: "wrong-password"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Invalid username or password" });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      {
        organizerId,
        action: "LOGIN_FAILED",
        result: "FAILURE",
        metadata: { username: "alice" }
      },
      expect.anything()
    );
  });

  it("rejects protected requests without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/protected"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Unauthorized" });
  });

  it("rejects protected requests with an invalid token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: {
        authorization: "Bearer not-a-valid-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Unauthorized" });
  });

  it("rejects protected requests with an expired token", async () => {
    const expiredPayload = {
      username: "alice",
      exp: Math.floor(Date.now() / 1000) - 60
    };

    const token = app.jwt.sign(expiredPayload, {
      sub: organizerId
    });

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Unauthorized" });
  });
});

async function buildAuthTestApp() {
  const app = Fastify({ logger: false });

  app.decorate("config", config);
  app.decorate("db", {} as DbClient);
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

  await app.register(authRoutes);
  app.get("/protected", { preHandler: app.authenticate }, async () => ({
    ok: true
  }));

  return app;
}

async function organizerWithPassword(username: string, password: string): Promise<OrganizerCredentials> {
  return {
    id: organizerId,
    username,
    passwordHash: await bcrypt.hash(password, PASSWORD_HASH_COST)
  };
}
