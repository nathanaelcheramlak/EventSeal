import { z } from "zod";

export const auditActionValues = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "QR_GENERATED",
  "QR_REVOKED",
  "QR_VERIFY_SUCCESS",
  "QR_VERIFY_FAILED"
] as const;

export const auditResultValues = ["SUCCESS", "FAILURE"] as const;

export const auditActionSchema = z.enum(auditActionValues);

export const auditResultSchema = z.enum(auditResultValues);

export const auditLogFiltersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().positive().optional(),
  action: auditActionSchema.optional(),
  result: auditResultSchema.optional(),
  organizerId: z.string().uuid().optional(),
  organizerUsername: z.string().trim().min(1).max(80).optional(),
  qrCodeId: z.string().uuid().optional()
});

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
export type AuditLogFilters = z.infer<typeof auditLogFiltersSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;
