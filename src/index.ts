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

  // Run database migrations before starting server
  const { runMigrations } = await import("./db/index.js");
  await runMigrations();

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
    secret: config.JWT_SECRET ?? "dev-jwt-secret-do-not-use-in-production",
    cookie: { cookieName: "token", signed: false },
  });

  // OpenAPI docs
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Email Service API",
        description: "Self-hosted email service platform — send, receive, and manage email at scale",
        version: "1.4.0",
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
  // CORS: restrict to own origin in production
  const allowedOrigins = config.NODE_ENV === "production"
    ? [config.BASE_URL, config.TRACKING_URL].filter(Boolean)
    : true;
  await app.register(cors, { origin: allowedOrigins, credentials: true });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        frameSrc: ["'self'"],
      },
    },
  });

  // Plugins
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register((await import("./plugins/api-logger.js")).default);

  // API Routes
  await registerRoutes(app);

  // Serve React frontend (built to web/dist)
  const frontendPath = path.join(__dirname, "..", "web", "dist");
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: "/",
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
      request.url.startsWith("/c/") ||
      request.url.startsWith("/unsubscribe/")
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

  // Start workers in-process if Redis is available
  const { isRedisConfigured } = await import("./queues/index.js");
  if (isRedisConfigured()) {
    const { startAllWorkers } = await import("./workers/index.js");
    startAllWorkers();
    app.log.info("Background workers started (Redis connected)");
  } else {
    app.log.info("Running without Redis — emails will be sent directly (no queue)");
  }

  // Start SMTP servers in-process (inbound receiving + relay for users)
  try {
    const { createInboundServer } = await import("./smtp/inbound-server.js");
    const inboundServer = createInboundServer();
    inboundServer.listen(config.SMTP_INBOUND_PORT, "0.0.0.0", () => {
      app.log.info(`SMTP inbound server listening on port ${config.SMTP_INBOUND_PORT}`);
    });
    inboundServer.on("error", (err: Error) => {
      app.log.error({ err }, "SMTP inbound server error");
    });
  } catch (err) {
    app.log.warn({ err }, "Failed to start SMTP inbound server");
  }

  try {
    const { createRelayServer } = await import("./smtp/relay-server.js");
    const relayServer = createRelayServer();
    relayServer.listen(config.SMTP_RELAY_PORT, "0.0.0.0", () => {
      app.log.info(`SMTP relay server listening on port ${config.SMTP_RELAY_PORT}`);
    });
    relayServer.on("error", (err: Error) => {
      app.log.error({ err }, "SMTP relay server error");
    });
  } catch (err) {
    app.log.warn({ err }, "Failed to start SMTP relay server");
  }

  // Start
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`Email Service API running on http://${config.API_HOST}:${config.API_PORT}`);
  app.log.info(`API docs available at http://${config.API_HOST}:${config.API_PORT}/docs`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
