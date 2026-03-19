import { z } from "zod";

export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    has_more: boolean;
  };
}

export function buildPaginatedResponse<T extends { id: string }>(
  items: T[],
  limit: number,
): PaginatedResponse<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const cursor = hasMore ? data[data.length - 1].id : null;
  return {
    data,
    pagination: { cursor, has_more: hasMore },
  };
}
