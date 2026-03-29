import { z } from "zod";

export const validateEmailSchema = z.object({
  email: z.string().min(1).max(255),
});

export const validateBatchSchema = z.object({
  emails: z.array(z.string().min(1).max(255)).min(1).max(100),
});
