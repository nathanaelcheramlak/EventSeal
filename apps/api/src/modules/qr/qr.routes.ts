import { qrCodes } from "@prom-event/db";
import {
  createQrRequestSchema,
  verifyQrRequestSchema,
  type VerifyQrFailureReason
} from "@prom-event/shared";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import QRCode from "qrcode";
import { writeAuditLog } from "../audit/audit.service.js";
import { HttpError } from "../../utils/http-error.js";
import { QrTokenError, signQrToken, verifyQrToken } from "../../utils/qr-token.js";

function getOrganizerId(user: unknown): string {
  if (typeof user === "object" && user && "sub" in user && typeof user.sub === "string") {
    return user.sub;
  }

  throw new HttpError(401, "Unauthorized");
}

export const qrRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", { preHandler: app.authenticate }, async (request) => {
    const organizerId = getOrganizerId(request.user);
    const body = createQrRequestSchema.parse(request.body);
    const expiresAt = new Date(body.expiresAt);

    if (expiresAt.getTime() <= Date.now()) {
      throw new HttpError(400, "Expiration must be in the future");
    }

    const [qrCode] = await app.db
      .insert(qrCodes)
      .values({
        createdBy: organizerId,
        name: body.name,
        phone: body.phone || null,
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

  app.post("/verify", { preHandler: app.authenticate }, async (request, reply) => {
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

    if (qrCode.status !== "ACTIVE") {
      const reason = qrCode.status === "USED" || qrCode.status === "REVOKED" ? qrCode.status : "INACTIVE";

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
  });
};

function invalid(reason: VerifyQrFailureReason) {
  return {
    valid: false,
    reason
  } as const;
}
