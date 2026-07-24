export function getJwtExpiresAt(token: string): number | null {
  const payload = decodeJwtPayload(token);

  if (!payload || typeof payload.exp !== "number") {
    return null;
  }

  return payload.exp * 1000;
}

export function isJwtExpired(token: string, now = Date.now()): boolean {
  const expiresAt = getJwtExpiresAt(token);
  return !expiresAt || expiresAt <= now;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, encodedPayload] = token.split(".");

  if (!encodedPayload) {
    return null;
  }

  try {
    const base64 = encodedPayload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

