import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import IORedis from "ioredis";
import { getConfig } from "../config/index.js";

async function rateLimitPlugin(app: FastifyInstance) {
  const config = getConfig();

  const opts: Parameters<typeof rateLimit>[1] = {
    max: config.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      // request.apiKey is populated by the per-route auth hook which runs AFTER this
      // global onRequest hook, so it is always undefined here. Extract the raw Bearer
      // token from the Authorization header directly — it's a stable per-API-key
      // identifier without needing a DB lookup.
      const auth = request.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        return auth.slice(7);
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
