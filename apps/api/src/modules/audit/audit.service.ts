import type { AuditAction, AuditResult } from "@prom-event/shared";
import { auditLogs, type DbClient } from "@prom-event/db";
import type { FastifyBaseLogger } from "fastify";

type AuditEntry = {
  organizerId?: string | null;
  qrCodeId?: string | null;
  action: AuditAction;
  result: AuditResult;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(
  db: DbClient,
  entry: AuditEntry,
  logger?: FastifyBaseLogger
) {
  try {
    await db.insert(auditLogs).values({
      organizerId: entry.organizerId ?? null,
      qrCodeId: entry.qrCodeId ?? null,
      action: entry.action,
      result: entry.result,
      metadata: entry.metadata ?? {}
    });
  } catch (error) {
    logger?.error({ err: error }, "Failed to write audit log");
  }
}

