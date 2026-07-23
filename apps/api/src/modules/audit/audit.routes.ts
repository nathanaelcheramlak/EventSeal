import { auditLogs, organizers } from "@prom-event/db";
import { desc, eq, lt } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const logsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().positive().optional()
});

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    const query = logsQuerySchema.parse(request.query);

    const whereClause = query.cursor ? lt(auditLogs.id, query.cursor) : undefined;

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

