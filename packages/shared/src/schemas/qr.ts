import { z } from "zod";

export const qrStatusSchema = z.enum(["ACTIVE", "USED", "REVOKED", "EXPIRED"]);

export const createQrRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).optional(),
  expiresAt: z.string().datetime({ offset: true })
});

export const createQrResponseSchema = z.object({
  qrId: z.string().uuid(),
  qrToken: z.string().min(1),
  qrImage: z.string().startsWith("data:image/png;base64,")
});

export const verifyQrRequestSchema = z.object({
  token: z.string().trim().min(1)
});

export const verifyQrSuccessResponseSchema = z.object({
  valid: z.literal(true),
  status: qrStatusSchema,
  data: z.object({
    name: z.string(),
    phone: z.string().nullable()
  })
});

export const verifyQrFailureReasonSchema = z.enum([
  "INVALID_TOKEN",
  "EXPIRED",
  "NOT_FOUND",
  "USED",
  "REVOKED",
  "INACTIVE"
]);

export const verifyQrFailureResponseSchema = z.object({
  valid: z.literal(false),
  reason: verifyQrFailureReasonSchema
});

export const verifyQrResponseSchema = z.union([
  verifyQrSuccessResponseSchema,
  verifyQrFailureResponseSchema
]);

export const qrTokenPayloadSchema = z.object({
  id: z.string().uuid(),
  exp: z.number().int().positive()
});

export type QrStatus = z.infer<typeof qrStatusSchema>;
export type CreateQrRequest = z.infer<typeof createQrRequestSchema>;
export type CreateQrResponse = z.infer<typeof createQrResponseSchema>;
export type VerifyQrRequest = z.infer<typeof verifyQrRequestSchema>;
export type VerifyQrResponse = z.infer<typeof verifyQrResponseSchema>;
export type VerifyQrFailureReason = z.infer<typeof verifyQrFailureReasonSchema>;
export type QrTokenPayload = z.infer<typeof qrTokenPayloadSchema>;

