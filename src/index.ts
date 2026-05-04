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
import {
  OPENAPI_TAGS,
  buildOpenapiWebhooks,
  openapiTransform,
  serializerCompiler,
  validatorCompiler,
} from "./lib/openapi.js";

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

  // Cookie + JWT for web auth — JWT_SECRET is validated by loadConfig().
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: "token", signed: false },
  });

  // Zod-typed request validation + response serialization. Routes opt in by
  // declaring `schema: { body, querystring, params, response }` with Zod
  // schemas; routes without a `schema` block are unaffected.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // OpenAPI docs — UI at /docs, raw spec at /docs/json + /openapi.json.
  await app.register(swagger, {
    openapi: {
      // OpenAPI 3.1 — needed for `examples` (array) at the schema level, JSON
      // Schema 2020-12 alignment, and `webhooks` for documenting outbound
      // events. Swagger UI 5.x renders 3.1 fine.
      openapi: "3.1.0",
      info: {
        title: "MailNowAPI",
        description: [
          "Self-hosted email service platform — send transactional and marketing email,",
          "receive inbound mail, manage domains and webhooks, run sequences and broadcasts.",
          "",
          "**Authentication.** All `/v1/*` endpoints require a bearer API key (`Authorization: Bearer es_xxxx`).",
          "Mint keys at `POST /v1/api-keys` or in the dashboard. Company-scoped keys (`POST /v1/companies/:id/api-keys`)",
          "are restricted to that company's domains.",
          "",
          "**Response envelope.** Successful responses are wrapped in `{ data }`; lists are `{ data, pagination }`.",
          "Errors are `{ error: { type, message, details? } }` with a stable `type` string per error class.",
          "",
          "**Idempotency.** `POST /v1/emails` accepts an `idempotency_key` field (≤255 chars). Replays within the",
          "retention window return the original response unchanged.",
        ].join("\n"),
        version: process.env.npm_package_version ?? "1.6.1",
        contact: { name: "MailNowAPI support", url: "https://mailnowapi.com" },
        license: { name: "ISC" },
      },
      servers: [
        { url: "https://mailnowapi.com", description: "Production" },
        { url: "http://localhost:3000", description: "Local development" },
      ],
      tags: [...OPENAPI_TAGS, { name: "Webhook events", description: "Outbound events MailNowAPI POSTs to subscribed webhooks." }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "API key in the form `es_xxxxxxxx`. Pass as `Authorization: Bearer es_xxx`.",
          },
        },
      },
      security: [{ bearerAuth: [] }],
      webhooks: buildOpenapiWebhooks() as any,
    } as any,
    transform: openapiTransform,
    hideUntagged: false,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true, persistAuthorization: true },
  });

  // Top-level OpenAPI artifact for tooling (Stainless, openapi-generator,
  // Postman) that expects the spec at a stable, conventional URL. The same
  // document is also at /docs/json via swagger-ui.
  app.get(
    "/openapi.json",
    { schema: { hide: true } as any },
    async () => app.swagger(),
  );

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
  await app.register((await import("./plugins/csrf.js")).default);
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
      request.url.startsWith("/readyz") ||
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

  // Background handles we need to drain on SIGTERM.
  const smtpServers: Array<{ name: string; server: { close: (cb?: (err?: Error) => void) => void } }> = [];
  let inProcessWorkers: Array<{ close: () => Promise<void> }> = [];

  // Graceful shutdown — stop accepting new connections first (HTTP + SMTP),
  // then close workers/queues, then the DB. Orchestration platforms usually
  // wait 10–30s before SIGKILL, so we target <10s total.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`Received ${signal}, shutting down...`);
    // 1. Close SMTP listeners so we stop accepting new mail.
    await Promise.all(
      smtpServers.map(
        ({ name, server }) =>
          new Promise<void>((resolve) => {
            try {
              server.close((err) => {
                if (err) app.log.warn({ err }, `SMTP ${name} close error`);
                resolve();
              });
            } catch {
              resolve();
            }
          }),
      ),
    );
    // 2. Close the HTTP server — Fastify drains in-flight requests.
    try { await app.close(); } catch (err) { app.log.warn({ err }, "app.close failed"); }
    // 3. Drain in-process BullMQ workers BEFORE closing the queue/Redis
    //    connection. `worker.close()` waits for the currently-running job
    //    handler to finish — without this step, in-flight email sends and
    //    scheduled-email claims are abandoned mid-execution and either get
    //    re-tried (potential duplicate sends) or dropped.
    try {
      await Promise.all(inProcessWorkers.map((w) => w.close()));
    } catch (err) { app.log.warn({ err }, "worker close failed"); }
    // 4. Close BullMQ queues and Redis connection.
    try {
      const { closeQueues } = await import("./queues/index.js");
      await closeQueues();
    } catch (err) { app.log.warn({ err }, "closeQueues failed"); }
    // 4. Close DB pool last.
    try {
      const { closeDb } = await import("./db/index.js");
      await closeDb();
    } catch (err) { app.log.warn({ err }, "closeDb failed"); }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Start workers in-process if Redis is available
  const { isRedisConfigured } = await import("./queues/index.js");
  if (isRedisConfigured()) {
    const { startAllWorkers } = await import("./workers/index.js");
    inProcessWorkers = startAllWorkers();
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
    smtpServers.push({ name: "inbound", server: inboundServer });
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
    smtpServers.push({ name: "relay", server: relayServer });
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
