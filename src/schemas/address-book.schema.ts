import { z } from "zod";

export const createAddressBookContactSchema = z.object({
  email: z.string().email(),
  name: z.string().max(255).optional(),
  company: z.string().max(255).optional(),
  notes: z.string().optional(),
});

export const updateAddressBookContactSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().max(255).optional(),
  company: z.string().max(255).optional(),
  notes: z.string().optional(),
});

export type CreateAddressBookContactInput = z.infer<typeof createAddressBookContactSchema>;
export type UpdateAddressBookContactInput = z.infer<typeof updateAddressBookContactSchema>;
