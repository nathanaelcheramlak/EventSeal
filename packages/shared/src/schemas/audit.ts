import { z } from "zod";

export const auditActionSchema = z.enum([
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "QR_GENERATED",
  "QR_VERIFY_SUCCESS",
  "QR_VERIFY_FAILED"
]);

export const auditResultSchema = z.enum(["SUCCESS", "FAILURE"]);

export const auditLogSchema = z.object({
  id: z.number(),
  organizerId: z.string().uuid().nullable(),
  organizerUsername: z.string().nullable(),
  qrCodeId: z.string().uuid().nullable(),
  action: auditActionSchema,
  result: auditResultSchema,
  metadata: z.record(z.unknown()),
  createdAt: z.string()
});

export const auditLogsResponseSchema = z.object({
  logs: z.array(auditLogSchema),
  nextCursor: z.number().nullable()
});

export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;

