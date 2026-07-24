import { organizers, qrCodes } from "@prom-event/db";
import {
  createQrRequestSchema,
  verifyQrRequestSchema,
  type QrRecordSummary,
  type VerifyQrFailureReason
} from "@prom-event/shared";
import { and, desc, eq, lt } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import { writeAuditLog } from "../audit/audit.service.js";
import { HttpError } from "../../utils/http-error.js";
import { QrTokenError, signQrToken, verifyQrToken } from "../../utils/qr-token.js";
import { validateQrExpiration } from "./qr.service.js";

function getOrganizerId(user: unknown): string {
  if (typeof user === "object" && user && "sub" in user && typeof user.sub === "string") {
    return user.sub;
  }

  throw new HttpError(401, "Unauthorized");
}

const qrListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().datetime({ offset: true }).optional()
});

const qrIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const qrRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    const query = qrListQuerySchema.parse(request.query);
    const cursorDate = query.cursor ? new Date(query.cursor) : undefined;
    const whereClause = cursorDate ? lt(qrCodes.createdAt, cursorDate) : undefined;

    const rows = await app.db
      .select({
        id: qrCodes.id,
        name: qrCodes.name,
        phone: qrCodes.phone,
        status: qrCodes.status,
        createdBy: qrCodes.createdBy,
        createdByUsername: organizers.username,
        createdAt: qrCodes.createdAt,
        expiresAt: qrCodes.expiresAt
      })
      .from(qrCodes)
      .leftJoin(organizers, eq(qrCodes.createdBy, organizers.id))
      .where(whereClause)
      .orderBy(desc(qrCodes.createdAt))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const next = rows.length > query.limit ? rows[query.limit] : undefined;

    return {
      records: page.map(toQrRecordSummary),
      nextCursor: next?.createdAt.toISOString() ?? null
    };
  });

  app.get("/:id", { preHandler: app.authenticate }, async (request) => {
    const params = qrIdParamsSchema.parse(request.params);
    const [row] = await app.db
      .select({
        id: qrCodes.id,
        name: qrCodes.name,
        phone: qrCodes.phone,
        status: qrCodes.status,
        createdBy: qrCodes.createdBy,
        createdByUsername: organizers.username,
        createdAt: qrCodes.createdAt,
        expiresAt: qrCodes.expiresAt
      })
      .from(qrCodes)
      .leftJoin(organizers, eq(qrCodes.createdBy, organizers.id))
      .where(eq(qrCodes.id, params.id))
      .limit(1);

    if (!row) {
      throw new HttpError(404, "QR record not found");
    }

    return {
      record: toQrRecordSummary(row)
    };
  });

  app.post("/", { preHandler: app.authenticate }, async (request) => {
    const organizerId = getOrganizerId(request.user);
    const body = createQrRequestSchema.parse(request.body);
    const expiresAt = new Date(body.expiresAt);

    validateQrExpiration(expiresAt, app.config.QR_MAX_TTL_DAYS);

    const [qrCode] = await app.db
      .insert(qrCodes)
      .values({
        createdBy: organizerId,
        name: body.name,
        phone: body.phone || null,
        status: "ACTIVE",
        expiresAt
      })
      .returning();

    if (!qrCode) {
      throw new HttpError(500, "Failed to create QR code");
    }

    const qrToken = signQrToken(
      {
        id: qrCode.id,
        exp: Math.floor(expiresAt.getTime() / 1000)
      },
      app.config.QR_SIGNING_SECRET
    );

    const qrImage = await QRCode.toDataURL(qrToken, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320
    });

    await writeAuditLog(
      app.db,
      {
        organizerId,
        qrCodeId: qrCode.id,
        action: "QR_GENERATED",
        result: "SUCCESS"
      },
      request.log
    );

    return {
      qrId: qrCode.id,
      qrToken,
      qrImage
    };
  });

  app.post("/:id/revoke", { preHandler: app.authenticate }, async (request) => {
    const organizerId = getOrganizerId(request.user);
    const params = qrIdParamsSchema.parse(request.params);

    const [revoked] = await app.db
      .update(qrCodes)
      .set({
        status: "REVOKED"
      })
      .where(and(eq(qrCodes.id, params.id), eq(qrCodes.status, "ACTIVE")))
      .returning();

    if (!revoked) {
      const [existing] = await app.db.select().from(qrCodes).where(eq(qrCodes.id, params.id)).limit(1);

      if (!existing) {
        throw new HttpError(404, "QR record not found");
      }

      throw new HttpError(409, `Cannot revoke QR with status ${existing.status}`);
    }

    await writeAuditLog(
      app.db,
      {
        organizerId,
        qrCodeId: revoked.id,
        action: "QR_REVOKED",
        result: "SUCCESS",
        metadata: { previousStatus: "ACTIVE", nextStatus: "REVOKED" }
      },
      request.log
    );

    const [row] = await app.db
      .select({
        id: qrCodes.id,
        name: qrCodes.name,
        phone: qrCodes.phone,
        status: qrCodes.status,
        createdBy: qrCodes.createdBy,
        createdByUsername: organizers.username,
        createdAt: qrCodes.createdAt,
        expiresAt: qrCodes.expiresAt
      })
      .from(qrCodes)
      .leftJoin(organizers, eq(qrCodes.createdBy, organizers.id))
      .where(eq(qrCodes.id, revoked.id))
      .limit(1);

    return {
      record: toQrRecordSummary(row ?? { ...revoked, createdByUsername: null })
    };
  });

  app.post(
    "/verify",
    { preHandler: app.authenticate, config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const organizerId = getOrganizerId(request.user);
      const body = verifyQrRequestSchema.parse(request.body);

      let payload;
      try {
        payload = verifyQrToken(body.token, app.config.QR_SIGNING_SECRET);
      } catch (error) {
        if (!(error instanceof QrTokenError)) {
          throw error;
        }

        await writeAuditLog(
          app.db,
          {
            organizerId,
            action: "QR_VERIFY_FAILED",
            result: "FAILURE",
            metadata: { reason: "INVALID_TOKEN" }
          },
          request.log
        );

        reply.code(400);
        return invalid("INVALID_TOKEN");
      }

      if (payload.exp <= Math.floor(Date.now() / 1000)) {
        await writeAuditLog(
          app.db,
          {
            organizerId,
            qrCodeId: payload.id,
            action: "QR_VERIFY_FAILED",
            result: "FAILURE",
            metadata: { reason: "EXPIRED" }
          },
          request.log
        );

        reply.code(400);
        return invalid("EXPIRED");
      }

      const [qrCode] = await app.db
        .select()
        .from(qrCodes)
        .where(eq(qrCodes.id, payload.id))
        .limit(1);

      if (!qrCode) {
        await writeAuditLog(
          app.db,
          {
            organizerId,
            qrCodeId: payload.id,
            action: "QR_VERIFY_FAILED",
            result: "FAILURE",
            metadata: { reason: "NOT_FOUND" }
          },
          request.log
        );

        reply.code(404);
        return invalid("NOT_FOUND");
      }

      if (qrCode.expiresAt.getTime() <= Date.now()) {
        await writeAuditLog(
          app.db,
          {
            organizerId,
            qrCodeId: qrCode.id,
            action: "QR_VERIFY_FAILED",
            result: "FAILURE",
            metadata: { reason: "EXPIRED" }
          },
          request.log
        );

        reply.code(400);
        return invalid("EXPIRED");
      }

      if (qrCode.status !== "ACTIVE") {
        const reason =
          qrCode.status === "USED" || qrCode.status === "REVOKED" || qrCode.status === "EXPIRED"
            ? qrCode.status
            : "INACTIVE";

        await writeAuditLog(
          app.db,
          {
            organizerId,
            qrCodeId: qrCode.id,
            action: "QR_VERIFY_FAILED",
            result: "FAILURE",
            metadata: { reason }
          },
          request.log
        );

        reply.code(409);
        return invalid(reason);
      }

      await writeAuditLog(
        app.db,
        {
          organizerId,
          qrCodeId: qrCode.id,
          action: "QR_VERIFY_SUCCESS",
          result: "SUCCESS"
        },
        request.log
      );

      return {
        valid: true,
        status: qrCode.status,
        data: {
          name: qrCode.name,
          phone: qrCode.phone
        }
      };
    }
  );
};

function toQrRecordSummary(row: {
  id: string;
  name: string;
  phone: string | null;
  status: QrRecordSummary["status"];
  createdBy: string;
  createdByUsername: string | null;
  createdAt: Date;
  expiresAt: Date;
}): QrRecordSummary {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    createdBy: row.createdBy,
    createdByUsername: row.createdByUsername,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString()
  };
}

function invalid(reason: VerifyQrFailureReason) {
  return {
    valid: false,
    reason
  } as const;
}
