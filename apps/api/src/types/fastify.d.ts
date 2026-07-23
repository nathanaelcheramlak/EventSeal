import type { FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
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
    dbPool: pg.Pool;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

