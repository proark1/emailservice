import { z } from "zod";

export const createDomainSchema = z.object({
  name: z.string().min(1).max(255).regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
    "Invalid domain name",
  ),
  mode: z.enum(["send", "receive", "both"]).optional().default("both"),
  dmarc_rua_email: z.string().email().optional(),
  return_path_domain: z.string().min(1).max(255).optional(),
  send_rate_per_minute: z.number().int().min(1).max(100_000).optional(),
});

export const updateDomainSchema = z.object({
  dmarc_rua_email: z.string().email().nullable().optional(),
  return_path_domain: z.string().min(1).max(255).nullable().optional(),
  send_rate_per_minute: z.number().int().min(1).max(100_000).nullable().optional(),
});

export const domainResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["pending", "verified", "failed"]),
  records: z.array(z.object({
    type: z.string(),
    name: z.string(),
    value: z.string(),
    purpose: z.string(),
    verified: z.boolean(),
  })),
  created_at: z.string(),
});

export type CreateDomainInput = z.infer<typeof createDomainSchema>;
