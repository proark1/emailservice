import { z } from "zod";

export const createDomainSchema = z.object({
  name: z.string().min(1).max(255).regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
    "Invalid domain name",
  ),
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
