import { z } from "zod";

export const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
