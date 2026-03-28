import { z } from "zod";

export const listInboxSchema = z.object({
  folder_id: z.string().uuid().optional(),
  folder_slug: z.string().optional(),
  thread_id: z.string().optional(),
  search: z.string().optional(),
  is_read: z.enum(["true", "false"]).optional(),
  is_starred: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const updateInboxEmailSchema = z.object({
  is_read: z.boolean().optional(),
  is_starred: z.boolean().optional(),
});

export const moveEmailSchema = z.object({
  folder_id: z.string().uuid(),
});

export const bulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["mark_read", "mark_unread", "star", "unstar", "move_to_folder", "move_to_trash", "permanent_delete"]),
  folder_id: z.string().uuid().optional(),
});

export type ListInboxInput = z.infer<typeof listInboxSchema>;
export type UpdateInboxEmailInput = z.infer<typeof updateInboxEmailSchema>;
export type MoveEmailInput = z.infer<typeof moveEmailSchema>;
export type BulkActionInput = z.infer<typeof bulkActionSchema>;
