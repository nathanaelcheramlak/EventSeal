import { createHmac, timingSafeEqual } from "node:crypto";
import { qrTokenPayloadSchema, type QrTokenPayload } from "@prom-event/shared";

export class QrTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QrTokenError";
  }
}

export function signQrToken(payload: QrTokenPayload, secret: string): string {
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = createSignature(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyQrToken(token: string, secret: string): QrTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new QrTokenError("Invalid QR token format");
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = createSignature(encodedPayload, secret);

  if (!safeEqual(signature, expectedSignature)) {
    throw new QrTokenError("Invalid QR token signature");
  }

  try {
    const json = Buffer.from(base64UrlToBase64(encodedPayload), "base64").toString("utf8");
    return qrTokenPayloadSchema.parse(JSON.parse(json));
  } catch {
    throw new QrTokenError("Invalid QR token payload");
  }
}

function createSignature(encodedPayload: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(encodedPayload).digest());
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBase64(input: string): string {
  const padding = "=".repeat((4 - (input.length % 4)) % 4);
  return `${input.replaceAll("-", "+").replaceAll("_", "/")}${padding}`;
}

