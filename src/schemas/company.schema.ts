import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase alphanumeric with dashes"),
});

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export const provisionMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.enum(["admin", "member"]).default("member"),
  password: z.string().min(8).max(255).optional(),
  // Optional handle assignment. When both supplied, a company_mailbox is created and
  // the member is auto-added to the domain's team with that mailbox filter.
  domain_id: z.string().uuid().optional(),
  local_part: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._+-]+$/).optional(),
  // When true, also mint an API key for this member and return it once.
  issue_api_key: z.boolean().default(false),
  api_key_name: z.string().max(255).optional(),
}).refine(
  (v) => (v.domain_id && v.local_part) || (!v.domain_id && !v.local_part),
  { message: "domain_id and local_part must be provided together" },
);

export const updateMemberSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  name: z.string().min(1).max(255).optional(),
});

export const assignMailboxSchema = z.object({
  account_id: z.string().uuid(),
  domain_id: z.string().uuid(),
  local_part: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._+-]+$/),
});

export const createCompanyApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  rate_limit: z.number().int().min(1).max(10_000).optional(),
  expires_at: z.string().datetime().optional(),
});

// Accepts either shape:
//   { domain_id }          → link an existing domain to the company
//   { name, mode? }        → create a new domain under the caller's account and link it in one call
export const linkDomainSchema = z.union([
  z.object({
    domain_id: z.string().uuid(),
  }),
  z.object({
    name: z.string().min(1).max(255),
    mode: z.enum(["send", "receive", "both"]).default("both").optional(),
  }),
]);

export const adoptDomainsSchema = z.object({
  domain_ids: z.array(z.string().uuid()).min(1).max(100),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type ProvisionMemberInput = z.infer<typeof provisionMemberSchema>;
export type UpdateCompanyMemberInput = z.infer<typeof updateMemberSchema>;
export type AssignMailboxInput = z.infer<typeof assignMailboxSchema>;
export type CreateCompanyApiKeyInput = z.infer<typeof createCompanyApiKeySchema>;
export type LinkDomainInput = z.infer<typeof linkDomainSchema>;
export type AdoptDomainsInput = z.infer<typeof adoptDomainsSchema>;
