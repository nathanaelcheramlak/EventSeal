import { auditLogs, organizers } from "@prom-event/db";
import { auditLogFiltersSchema } from "@prom-event/shared";
import { and, desc, eq, lt } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    const query = auditLogFiltersSchema.parse(request.query);
    const conditions: SQL[] = [];

    if (query.cursor) {
      conditions.push(lt(auditLogs.id, query.cursor));
    }

    if (query.action) {
      conditions.push(eq(auditLogs.action, query.action));
    }

    if (query.result) {
      conditions.push(eq(auditLogs.result, query.result));
    }

    if (query.organizerId) {
      conditions.push(eq(auditLogs.organizerId, query.organizerId));
    }

    if (query.organizerUsername) {
      conditions.push(eq(organizers.username, query.organizerUsername.toLowerCase()));
    }

    if (query.qrCodeId) {
      conditions.push(eq(auditLogs.qrCodeId, query.qrCodeId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await app.db
      .select({
        id: auditLogs.id,
        organizerId: auditLogs.organizerId,
        organizerUsername: organizers.username,
        qrCodeId: auditLogs.qrCodeId,
        action: auditLogs.action,
        result: auditLogs.result,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt
      })
      .from(auditLogs)
      .leftJoin(organizers, eq(auditLogs.organizerId, organizers.id))
      .where(whereClause)
      .orderBy(desc(auditLogs.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const next = rows.length > query.limit ? rows[query.limit] : undefined;

    return {
      logs: page.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString()
      })),
      nextCursor: next?.id ?? null
    };
  });
};
