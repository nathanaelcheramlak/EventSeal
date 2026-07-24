import { HttpError } from "../../utils/http-error.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function validateQrExpiration(expiresAt: Date, maxTtlDays: number, now = new Date()) {
  const expiresAtTime = expiresAt.getTime();
  const nowTime = now.getTime();

  if (Number.isNaN(expiresAtTime)) {
    throw new HttpError(400, "Expiration must be a valid date");
  }

  if (expiresAtTime <= nowTime) {
    throw new HttpError(400, "Expiration must be in the future");
  }

  const maxExpiresAt = nowTime + maxTtlDays * MS_PER_DAY;

  if (expiresAtTime > maxExpiresAt) {
    throw new HttpError(400, `Expiration cannot be more than ${maxTtlDays} days in the future`);
  }
}

