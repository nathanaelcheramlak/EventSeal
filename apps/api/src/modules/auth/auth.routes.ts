import { organizers } from "@prom-event/db";
import { loginRequestSchema } from "@prom-event/shared";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { writeAuditLog } from "../audit/audit.service.js";
import { HttpError } from "../../utils/http-error.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (request) => {
    const body = loginRequestSchema.parse(request.body);

    const [organizer] = await app.db
      .select()
      .from(organizers)
      .where(eq(organizers.username, body.username))
      .limit(1);

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
          metadata: { username: body.username }
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

