import { createHash } from "node:crypto";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import IORedis from "ioredis";
import { getConfig } from "../config/index.js";
import { getRateLimitMax } from "../services/settings.service.js";

async function rateLimitPlugin(app: FastifyInstance) {
  const config = getConfig();

  const opts: Parameters<typeof rateLimit>[1] = {
    max: getRateLimitMax,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      // Hash the Bearer token so the raw API key secret is never stored in Redis.
      const auth = request.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        return createHash("sha256").update(auth.slice(7)).digest("hex");
      }
      return request.ip;
    },
    errorResponseBuilder: () => ({
      error: {
        type: "rate_limit_exceeded",
        message: "Too many requests. Please retry later.",
      },
    }),
  };

  // Use Redis for rate limiting if available, otherwise in-memory
  if (config.REDIS_URL) {
    (opts as any).redis = new IORedis.default(config.REDIS_URL);
  }

  await app.register(rateLimit, opts);
}

export default fp(rateLimitPlugin, { name: "rate-limit" });
