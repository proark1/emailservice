import { z } from "zod";

export const uuidParam = z.object({
  id: z.string().uuid(),
});

export const paginationQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const successResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.object({ data: dataSchema });

export const listResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    pagination: z.object({
      cursor: z.string().uuid().nullable(),
      has_more: z.boolean(),
    }),
  });

export const errorResponse = z.object({
  error: z.object({
    type: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
