import { z } from "zod";

export const createAudienceSchema = z.object({
  name: z.string().min(1).max(255),
});

export type CreateAudienceInput = z.infer<typeof createAudienceSchema>;
