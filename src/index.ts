import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import { loadConfig } from "./config/index.js";
import authPlugin from "./plugins/auth.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import errorHandler from "./plugins/error-handler.js";
import { registerRoutes } from "./routes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
    },
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  // Cookie + JWT for web auth
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.ENCRYPTION_KEY,
    cookie: { cookieName: "token", signed: false },
  });

  // OpenAPI docs
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Email Service API",
        description: "Self-hosted email service platform — send, receive, and manage email at scale",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "API key (es_xxxxx)",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, { routePrefix: "/docs" });

  // Security
  await app.register(cors, { origin: true, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });

  // Plugins
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);

  // API Routes
  await registerRoutes(app);

  // Serve React frontend (built to web/dist)
  const frontendPath = path.join(__dirname, "..", "web", "dist");
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: "/",
    decorateReply: false,
    wildcard: false,
  });

  // SPA fallback: any non-API route serves index.html
  app.setNotFoundHandler(async (request, reply) => {
    if (
      request.url.startsWith("/v1/") ||
      request.url.startsWith("/auth/") ||
      request.url.startsWith("/admin/") ||
      request.url.startsWith("/dashboard/") ||
      request.url.startsWith("/health") ||
      request.url.startsWith("/docs") ||
      request.url.startsWith("/t/") ||
      request.url.startsWith("/c/")
    ) {
      return reply.status(404).send({
        error: { type: "not_found", message: "Route not found" },
      });
    }
    return reply.sendFile("index.html", frontendPath);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    const { closeDb } = await import("./db/index.js");
    await closeDb();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Start
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`Email Service API running on http://${config.API_HOST}:${config.API_PORT}`);
  app.log.info(`API docs available at http://${config.API_HOST}:${config.API_PORT}/docs`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
