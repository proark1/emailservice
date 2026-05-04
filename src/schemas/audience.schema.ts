import { z } from "zod";

export const createAudienceSchema = z.object({
  name: z.string().min(1).max(255),
}).meta({
  description: "Create an audience to group contacts for broadcasts and sequences.",
  examples: [{ name: "Newsletter subscribers" }],
});

export type CreateAudienceInput = z.infer<typeof createAudienceSchema>;
