import { z } from "zod";

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256)
});

export const loginResponseSchema = z.object({
  token: z.string().min(1)
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;

