import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { getDb } from "../db/index.js";

async function apiLoggerPlugin(app: FastifyInstance) {
  app.addHook("onResponse", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) return;
    try {
      const { apiLogs } = await import("../db/schema/index.js");
      const db = getDb();
      db.insert(apiLogs).values({
        accountId: (request as any).account?.id || null,
        apiKeyId: (request as any).apiKey?.id || null,
        method: request.method,
        path: request.url.split("?")[0],
        statusCode: reply.statusCode,
        responseTime: Math.round(reply.elapsedTime),
        userAgent: request.headers["user-agent"]?.slice(0, 500) || null,
        ip: request.ip,
      }).execute().catch(() => {});
    } catch {}
  });
}

export default fp(apiLoggerPlugin, { name: "api-logger" });
