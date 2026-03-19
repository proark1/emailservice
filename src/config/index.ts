import crypto from "node:crypto";
import { z } from "zod";

const DEFAULT_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

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
  ENCRYPTION_KEY: z.string().min(1).default(DEFAULT_ENCRYPTION_KEY),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().optional(),
  // Railway / Render / Cloud Run provide these
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  RENDER_EXTERNAL_HOSTNAME: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

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
  _config = parsed;
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
