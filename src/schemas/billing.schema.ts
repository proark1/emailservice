import { z } from "zod";

export const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  stripe_price_id: z.string().optional(),
  monthly_email_limit: z.number().int().min(1).nullable().optional(),
  domains_limit: z.number().int().min(1).default(1),
  api_keys_limit: z.number().int().min(1).default(2),
  templates_limit: z.number().int().min(1).default(10),
  features: z.record(z.string(), z.boolean()).optional(),
  rate_limit: z.number().int().min(1).default(60),
  price: z.number().int().min(0).default(0),
  is_default: z.boolean().default(false),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  stripe_price_id: z.string().nullable().optional(),
  monthly_email_limit: z.number().int().min(1).nullable().optional(),
  domains_limit: z.number().int().min(1).optional(),
  api_keys_limit: z.number().int().min(1).optional(),
  templates_limit: z.number().int().min(1).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  rate_limit: z.number().int().min(1).optional(),
  price: z.number().int().min(0).optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const checkoutSchema = z.object({
  plan_id: z.string().uuid(),
});

export const changePlanSchema = z.object({
  plan_id: z.string().uuid(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
