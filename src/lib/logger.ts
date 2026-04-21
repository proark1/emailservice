import pino from "pino";
import { getConfig } from "../config/index.js";

let _logger: pino.Logger | null = null;

/**
 * Shared pino logger for code paths that run outside a Fastify request
 * (workers, queue callbacks, startup, SMTP handlers). Prefer `request.log`
 * inside route handlers so that the `x-request-id` correlation field stays
 * attached automatically.
 */
export function getLogger(): pino.Logger {
  if (_logger) return _logger;
  const config = getConfig();
  _logger = pino({
    level: config.LOG_LEVEL,
    base: { service: "mailnowapi" },
    ...(config.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
  });
  return _logger;
}

/**
 * Named child logger for a specific subsystem. The `module` field makes it
 * trivial to grep for e.g. all email-send events: `module=email-send`.
 */
export function childLogger(module: string): pino.Logger {
  return getLogger().child({ module });
}
