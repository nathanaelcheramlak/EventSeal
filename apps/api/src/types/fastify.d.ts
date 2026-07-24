import type { FastifyReply, FastifyRequest } from "fastify";
import type { DbClient } from "@prom-event/db";
import type { Env } from "../config/env.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      username: string;
    };
    user: {
      sub: string;
      username: string;
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
    db: DbClient;
    dbPool: {
      end: () => Promise<void>;
    };
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
