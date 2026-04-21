import crypto from "node:crypto";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_PUBLIC_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default("0.0.0.0"),
  BASE_URL: z.string().default("http://localhost:3000"),
  TRACKING_URL: z.string().default("http://localhost:3000"),
  // The hostname where this service is reachable for SMTP (MX records point here)
  MAIL_HOST: z.string().min(1).optional(),
  SMTP_RELAY_PORT: z.coerce.number().default(587),
  SMTP_RELAY_TLS_PORT: z.coerce.number().default(465),
  SMTP_TLS_KEY: z.string().optional(),
  SMTP_TLS_CERT: z.string().optional(),
  SMTP_INBOUND_PORT: z.coerce.number().default(2525),
  SMTP_DEV_HOST: z.string().default("localhost"),
  SMTP_DEV_PORT: z.coerce.number().default(1025),
  // Production SMTP relay (optional — if set, used instead of direct send)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.string().optional(), // "true" for port 465
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)").optional(),
  TRACKING_HMAC_SECRET: z.string().min(32, "TRACKING_HMAC_SECRET must be at least 32 characters").optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(600),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().optional(),
  // Railway / Render / Cloud Run provide these
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  RENDER_EXTERNAL_HOSTNAME: z.string().optional(),
});

type RawEnv = z.infer<typeof envSchema>;
// After loadConfig() runs, these are guaranteed non-null — either set in env or
// populated by the loader's dev fallbacks / platform auto-detection.
export type Env = Omit<RawEnv, "ENCRYPTION_KEY" | "JWT_SECRET" | "DATABASE_URL"> & {
  ENCRYPTION_KEY: string;
  JWT_SECRET: string;
  DATABASE_URL: string;
};

let _config: Env | null = null;

export function loadConfig(): Env {
  if (_config) return _config;
  const parsed = envSchema.parse(process.env);
  if (!parsed.DATABASE_URL && parsed.DATABASE_PUBLIC_URL) {
    parsed.DATABASE_URL = parsed.DATABASE_PUBLIC_URL;
  }
  if (!parsed.DATABASE_URL) {
    throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL environment variable is required");
  }
  if (parsed.PORT) {
    parsed.API_PORT = parsed.PORT;
  }
  // Auto-detect MAIL_HOST from platform env vars or BASE_URL
  if (!parsed.MAIL_HOST) {
    if (parsed.RAILWAY_PUBLIC_DOMAIN) {
      parsed.MAIL_HOST = parsed.RAILWAY_PUBLIC_DOMAIN;
    } else if (parsed.RENDER_EXTERNAL_HOSTNAME) {
      parsed.MAIL_HOST = parsed.RENDER_EXTERNAL_HOSTNAME;
    } else {
      try {
        const host = new URL(parsed.BASE_URL).hostname;
        if (host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0") {
          parsed.MAIL_HOST = host;
        }
      } catch {}
    }
  }
  if (!parsed.ENCRYPTION_KEY) {
    if (parsed.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY environment variable must be set in production. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    // Dev/test: synthesize a deterministic-per-process key so restarts with a
    // database still decrypt successfully. Log a visible warning so developers
    // know this isn't persisted.
    parsed.ENCRYPTION_KEY = crypto.createHash("sha256").update("mailnowapi-dev-fallback").digest("hex");
    console.warn("[config] ENCRYPTION_KEY not set — using a deterministic dev-only fallback. Set ENCRYPTION_KEY in .env to a 32-byte hex string.");
  }
  if (!parsed.JWT_SECRET) {
    if (parsed.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable must be set in production. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    parsed.JWT_SECRET = "dev-only-jwt-secret-do-not-use-outside-local-development-12345678";
    console.warn("[config] JWT_SECRET not set — using a deterministic dev-only fallback.");
  }
  if (parsed.NODE_ENV === "production" && !parsed.TRACKING_HMAC_SECRET) {
    throw new Error(
      "TRACKING_HMAC_SECRET environment variable must be set in production. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  _config = parsed as Env;
  return _config;
}

export function getConfig(): Env {
  if (!_config) return loadConfig();
  return _config;
}

/**
 * Get the mail hostname for DNS records (MX, SPF).
 * Falls back to BASE_URL hostname, then to a placeholder.
 */
export function getMailHost(): string {
  const config = getConfig();
  if (config.MAIL_HOST) return config.MAIL_HOST;
  try {
    const host = new URL(config.BASE_URL).hostname;
    if (host !== "localhost" && host !== "127.0.0.1") return host;
  } catch {}
  return "your-server-hostname.com";
}

/**
 * Get the HMAC secret used for click tracking URL signatures.
 *
 * Production requires TRACKING_HMAC_SECRET to be set explicitly so that
 * compromise of ENCRYPTION_KEY does not automatically compromise tracking
 * signatures. In development we derive a stable fallback from ENCRYPTION_KEY.
 */
export function getTrackingSecret(): string {
  const config = getConfig();
  if (config.TRACKING_HMAC_SECRET) return config.TRACKING_HMAC_SECRET;
  return crypto.createHmac("sha256", config.ENCRYPTION_KEY).update("tracking").digest("hex");
}
