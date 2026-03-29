import { z } from "zod";

export const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
  mailboxes: z.array(z.string().email()).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  mailboxes: z.array(z.string().email()).nullable().optional(),
});

export const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
  mailboxes: z.array(z.string().email()).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
