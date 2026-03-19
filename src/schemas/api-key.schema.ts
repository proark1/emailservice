import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  permissions: z.record(z.string(), z.boolean()).optional().default({}),
  expires_at: z.string().datetime().optional(),
  rate_limit: z.number().int().min(1).max(10000).optional().default(60),
});

export const apiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key_prefix: z.string(),
  permissions: z.record(z.string(), z.boolean()),
  rate_limit: z.number(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
