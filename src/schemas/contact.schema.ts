import { z } from "zod";

export const createContactSchema = z.object({
  email: z.string().email().max(255),
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  subscribed: z.boolean().optional().default(true),
});

export const updateContactSchema = z.object({
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  subscribed: z.boolean().optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
