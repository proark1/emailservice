import { z } from "zod";

export const confirmImportSchema = z.object({
  column_mapping: z.record(z.string(), z.string()).refine(
    (mapping) => Object.values(mapping).includes("email"),
    { message: "Column mapping must include an 'email' field" },
  ),
  duplicate_strategy: z.enum(["skip", "update"]).default("skip"),
});

export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;
