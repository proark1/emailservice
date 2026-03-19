import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import IORedis from "ioredis";
import { getConfig } from "../config/index.js";

async function rateLimitPlugin(app: FastifyInstance) {
  const config = getConfig();

  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    redis: new IORedis.default(config.REDIS_URL),
    keyGenerator: (request) => {
      // Use API key ID if authenticated, otherwise IP
      return request.apiKey?.id || request.ip;
    },
    errorResponseBuilder: () => ({
      error: {
        type: "rate_limit_exceeded",
        message: "Too many requests. Please retry later.",
      },
    }),
  });
}

export default fp(rateLimitPlugin, { name: "rate-limit" });
