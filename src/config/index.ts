import crypto from "node:crypto";
import { z } from "zod";

// Generate a default encryption key for development/first-run
const DEFAULT_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_PUBLIC_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default("0.0.0.0"),
  BASE_URL: z.string().default("http://localhost:3000"),
  TRACKING_URL: z.string().default("http://localhost:3000"),
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
  PORT: z.coerce.number().optional(), // Cloud platforms often set PORT
});

export type Env = z.infer<typeof envSchema>;

let _config: Env | null = null;

export function loadConfig(): Env {
  if (_config) return _config;
  const parsed = envSchema.parse(process.env);
  // Resolve DATABASE_URL from multiple possible env var names
  if (!parsed.DATABASE_URL && parsed.DATABASE_PUBLIC_URL) {
    parsed.DATABASE_URL = parsed.DATABASE_PUBLIC_URL;
  }
  if (!parsed.DATABASE_URL) {
    throw new Error("DATABASE_URL or DATABASE_PUBLIC_URL environment variable is required");
  }
  // Cloud platforms set PORT — use it as API_PORT fallback
  if (parsed.PORT) {
    parsed.API_PORT = parsed.PORT;
  }
  _config = parsed;
  return _config;
}

export function getConfig(): Env {
  if (!_config) return loadConfig();
  return _config;
}
