import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default("0.0.0.0"),
  BASE_URL: z.string().url().default("http://localhost:3000"),
  TRACKING_URL: z.string().url().default("http://localhost:3000"),
  SMTP_RELAY_PORT: z.coerce.number().default(587),
  SMTP_RELAY_TLS_PORT: z.coerce.number().default(465),
  SMTP_TLS_KEY: z.string().optional(),
  SMTP_TLS_CERT: z.string().optional(),
  SMTP_INBOUND_PORT: z.coerce.number().default(2525),
  SMTP_DEV_HOST: z.string().default("localhost"),
  SMTP_DEV_PORT: z.coerce.number().default(1025),
  ENCRYPTION_KEY: z.string().length(64),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let _config: Env | null = null;

export function loadConfig(): Env {
  if (_config) return _config;
  _config = envSchema.parse(process.env);
  return _config;
}

export function getConfig(): Env {
  if (!_config) return loadConfig();
  return _config;
}
