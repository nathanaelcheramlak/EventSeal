import { loginRequestSchema } from "@prom-event/shared";
import bcrypt from "bcryptjs";
import type { FastifyPluginAsync } from "fastify";
import { writeAuditLog } from "../audit/audit.service.js";
import { HttpError } from "../../utils/http-error.js";
import { findOrganizerByUsername, normalizeUsername } from "./auth.service.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const body = loginRequestSchema.parse(request.body);
    const username = normalizeUsername(body.username);

    const organizer = await findOrganizerByUsername(app.db, username);

    const passwordMatches = organizer
      ? await bcrypt.compare(body.password, organizer.passwordHash)
      : false;

    if (!organizer || !passwordMatches) {
      await writeAuditLog(
        app.db,
        {
          organizerId: organizer?.id ?? null,
          action: "LOGIN_FAILED",
          result: "FAILURE",
          metadata: { username }
        },
        request.log
      );

      throw new HttpError(401, "Invalid username or password");
    }

    await writeAuditLog(
      app.db,
      {
        organizerId: organizer.id,
        action: "LOGIN_SUCCESS",
        result: "SUCCESS"
      },
      request.log
    );

    const token = app.jwt.sign(
      {
        username: organizer.username
      },
      {
        sub: organizer.id,
        expiresIn: app.config.TOKEN_TTL_SECONDS
      }
    );

    return { token };
  });
};
