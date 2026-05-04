import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createCompanySchema,
  updateCompanySchema,
  provisionMemberSchema,
  updateMemberSchema,
  assignMailboxSchema,
  createCompanyApiKeySchema,
  linkDomainSchema,
  adoptDomainsSchema,
} from "../schemas/company.schema.js";
import * as companyService from "../services/company.service.js";
import * as memberService from "../services/company-member.service.js";
import * as mailboxService from "../services/company-mailbox.service.js";
import { ForbiddenError } from "../lib/errors.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const companyParam = z.object({ companyId: z.string().uuid() });
const memberParam = z.object({ companyId: z.string().uuid(), memberId: z.string().uuid() });
const mailboxParam = z.object({ companyId: z.string().uuid(), mailboxId: z.string().uuid() });
const keyParam = z.object({ companyId: z.string().uuid(), keyId: z.string().uuid() });
const companyDomainParam = z.object({ companyId: z.string().uuid(), domainId: z.string().uuid() });

const companyResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  owner_account_id: z.string().uuid(),
  created_at: z.string(),
}).passthrough();

const companyApiKeyResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key_prefix: z.string(),
  rate_limit: z.number(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
}).passthrough();

const memberResponse = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(["owner", "admin", "member"]),
  created_at: z.string(),
}).passthrough();

const mailboxResponse = z.object({
  id: z.string().uuid(),
  domain_id: z.string().uuid(),
  account_id: z.string().uuid(),
  local_part: z.string(),
  created_at: z.string(),
}).passthrough();

const successResponse = z.object({ success: z.boolean() });

const companyDomainSummary = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["pending", "verified", "failed"]),
  mode: z.enum(["send", "receive", "both"]).nullable(),
  company_id: z.string().uuid().nullable(),
});

const provisionMemberResponse = z.object({
  member_id: z.string().uuid(),
  account_id: z.string().uuid(),
  account_email: z.string().email(),
  mailbox: z.object({
    id: z.string().uuid(),
    local_part: z.string(),
    domain_id: z.string().uuid(),
  }).nullable(),
  generated_password: z.string().nullable(),
  api_key: z.object({ id: z.string().uuid(), key: z.string() }).nullable(),
});

const adoptDomainsResponse = z.object({
  linked: z.number(),
  skipped: z.number(),
  errored: z.number(),
  results: z.array(z.object({
    domain_id: z.string().uuid(),
    status: z.enum(["linked", "skipped", "error"]),
    reason: z.string().optional(),
  }).passthrough()),
});

/**
 * Authorize the caller against a `:companyId` path param.
 *
 * - User-level API keys (no companyId on the key) are authorized via
 *   `requireCompanyRole` inside each service call.
 * - Company-scoped keys must match the path's companyId exactly; they are
 *   otherwise treated as if the owning account had made the request.
 */
function assertCompanyScope(request: FastifyRequest, companyId: string) {
  const keyCompanyId = request.apiKey.companyId;
  if (keyCompanyId && keyCompanyId !== companyId) {
    throw new ForbiddenError("API key is not scoped to this company");
  }
}

export default async function companyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // -------------------- Companies --------------------

  app.post("/", {
    schema: {
      summary: "Create a company",
      description: "Create a sub-tenant company under the authenticated root account. Multi-tenant platforms create one company per customer. Company-scoped API keys cannot create new companies.",
      body: createCompanySchema,
      response: { 201: dataEnvelope(companyResponse), 400: errorResponseSchema, 403: errorResponseSchema, 409: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createCompanySchema.parse(request.body);
    if (request.apiKey.companyId) {
      throw new ForbiddenError("Company-scoped API keys cannot create companies");
    }
    const company = await companyService.createCompany(request.account.id, input);
    return reply.status(201).send({ data: companyService.formatCompanyResponse(company) });
  });

  app.get("/", {
    schema: {
      summary: "List companies",
      description: "Lists companies the caller can see. User-level keys see all companies they own; company-scoped keys see only their own company.",
      response: { 200: dataEnvelope(z.array(companyResponse)) },
    },
  }, async (request) => {
    const keyCompanyId = request.apiKey.companyId;
    const rows = await companyService.listCompaniesForAccount(request.account.id, {
      companyId: keyCompanyId,
    });
    return { data: rows.map((r) => companyService.formatCompanyResponse(r as any)) };
  });

  app.get<{ Params: { companyId: string } }>("/:companyId", {
    schema: {
      summary: "Get a company",
      params: companyParam,
      response: { 200: dataEnvelope(companyResponse), 403: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const company = await companyService.getCompany(request.account.id, request.params.companyId);
    return { data: companyService.formatCompanyResponse(company) };
  });

  app.patch<{ Params: { companyId: string } }>("/:companyId", {
    schema: {
      summary: "Update a company",
      params: companyParam,
      body: updateCompanySchema,
      response: { 200: dataEnvelope(companyResponse), 403: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const input = updateCompanySchema.parse(request.body);
    const updated = await companyService.updateCompany(request.account.id, request.params.companyId, input);
    return { data: companyService.formatCompanyResponse(updated) };
  });

  app.delete<{ Params: { companyId: string } }>("/:companyId", {
    schema: {
      summary: "Delete a company",
      description: "Permanently deletes the company. Company-scoped keys cannot delete their own company — only the owning root account can.",
      params: companyParam,
      response: { 200: dataEnvelope(successResponse), 403: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    assertCompanyScope(request, request.params.companyId);
    if (request.apiKey.companyId) {
      throw new ForbiddenError("Company-scoped API keys cannot delete the company");
    }
    await companyService.deleteCompany(request.account.id, request.params.companyId);
    return { data: { success: true } };
  });

  // -------------------- Company API keys --------------------

  app.post<{ Params: { companyId: string } }>("/:companyId/api-keys", {
    schema: {
      summary: "Mint a company-scoped API key",
      description: "Creates an API key restricted to the company's domains. The full key is returned **only once** in the `key` field — store it before navigating away.",
      params: companyParam,
      body: createCompanyApiKeySchema,
      response: {
        201: dataEnvelope(companyApiKeyResponse.extend({ key: z.string() })),
        403: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    assertCompanyScope(request, request.params.companyId);
    const input = createCompanyApiKeySchema.parse(request.body);
    const { apiKey, fullKey } = await companyService.createCompanyApiKey(
      request.account.id,
      request.params.companyId,
      input,
    );
    return reply.status(201).send({
      data: {
        ...companyService.formatCompanyApiKeyResponse(apiKey),
        key: fullKey,
      },
    });
  });

  app.get<{ Params: { companyId: string } }>("/:companyId/api-keys", {
    schema: {
      summary: "List company API keys",
      params: companyParam,
      response: { 200: dataEnvelope(z.array(companyApiKeyResponse)), 403: errorResponseSchema },
    },
  }, async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const keys = await companyService.listCompanyApiKeys(request.account.id, request.params.companyId);
    return { data: keys.map(companyService.formatCompanyApiKeyResponse) };
  });

  app.delete<{ Params: { companyId: string; keyId: string } }>("/:companyId/api-keys/:keyId", {
    schema: {
      summary: "Revoke a company API key",
      params: keyParam,
      response: { 200: dataEnvelope(successResponse), 403: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    assertCompanyScope(request, request.params.companyId);
    await companyService.revokeCompanyApiKey(request.account.id, request.params.companyId, request.params.keyId);
    return { data: { success: true } };
  });

  // -------------------- Domain linkage --------------------

  app.post<{ Params: { companyId: string } }>("/:companyId/domains", {
    schema: {
      summary: "Create or link a domain to the company",
      description: "Pass `{ domain_id }` to link an existing domain, or `{ name, mode? }` to create and link a new one in a single call. The response includes DNS records for the customer to configure.",
      params: companyParam,
      body: linkDomainSchema,
      response: { 201: dataEnvelope(z.any()), 400: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    assertCompanyScope(request, request.params.companyId);
    const input = linkDomainSchema.parse(request.body);
    const domain = "domain_id" in input
      ? await companyService.linkDomainToCompany(request.account.id, request.params.companyId, input.domain_id)
      : await companyService.createAndLinkDomain(request.account.id, request.params.companyId, {
          name: input.name,
          mode: input.mode,
        });
    const { formatDomainResponse } = await import("../services/domain.service.js");
    return reply.status(201).send({ data: formatDomainResponse(domain) });
  });

  app.get<{ Params: { companyId: string } }>("/:companyId/domains", {
    schema: {
      summary: "List domains linked to the company",
      params: companyParam,
      response: { 200: dataEnvelope(z.array(companyDomainSummary)), 403: errorResponseSchema },
    },
  }, async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const domains = await companyService.listCompanyDomains(request.account.id, request.params.companyId);
    return {
      data: domains.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        mode: d.mode,
        company_id: d.companyId,
      })),
    };
  });

  app.delete<{ Params: { companyId: string; domainId: string } }>(
    "/:companyId/domains/:domainId",
    {
      schema: {
        summary: "Unlink a domain from the company",
        description: "Detaches the domain from the company without deleting it. The domain remains owned by the root account.",
        params: companyDomainParam,
        response: { 200: dataEnvelope(successResponse), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      assertCompanyScope(request, request.params.companyId);
      await companyService.unlinkDomainFromCompany(
        request.account.id,
        request.params.companyId,
        request.params.domainId,
      );
      return { data: { success: true } };
    },
  );

  // POST /v1/companies/:companyId/adopt-domains — bulk-migrate stranded master-account
  // domains into this company. Per-domain result so callers can act on partial failure.
  app.post<{ Params: { companyId: string } }>("/:companyId/adopt-domains", {
    schema: {
      summary: "Bulk-adopt master-account domains into a company",
      description: "Migrates up to 100 stranded domains from the root account into this company in one call. Returns per-domain status so partial failures can be acted on.",
      params: companyParam,
      body: adoptDomainsSchema,
      response: { 200: dataEnvelope(adoptDomainsResponse), 400: errorResponseSchema, 403: errorResponseSchema },
    },
  }, async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const input = adoptDomainsSchema.parse(request.body);
    const results = await companyService.adoptDomainsIntoCompany(
      request.account.id,
      request.params.companyId,
      input.domain_ids,
    );
    const linked = results.filter((r) => r.status === "linked").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errored = results.filter((r) => r.status === "error").length;
    return { data: { linked, skipped, errored, results } };
  });

  // -------------------- Members --------------------

  app.post<{ Params: { companyId: string } }>("/:companyId/members", {
    schema: {
      summary: "Provision a member",
      description: "Creates a new account, adds it as a company member, optionally assigns a mailbox handle, and optionally mints a per-member API key — all in one call. The generated password and API key are returned **only once**.",
      params: companyParam,
      body: provisionMemberSchema,
      response: { 201: dataEnvelope(provisionMemberResponse), 400: errorResponseSchema, 403: errorResponseSchema },
    },
  }, async (request, reply) => {
    assertCompanyScope(request, request.params.companyId);
    const input = provisionMemberSchema.parse(request.body);
    const result = await memberService.provisionMember(request.account.id, request.params.companyId, input);
    return reply.status(201).send({
      data: {
        member_id: result.member.id,
        account_id: result.account.id,
        account_email: result.account.email,
        mailbox: result.mailbox
          ? { id: result.mailbox.id, local_part: result.mailbox.localPart, domain_id: result.mailbox.domainId }
          : null,
        generated_password: result.generatedPassword,
        api_key: result.issuedKey ? { id: result.issuedKey.id, key: result.issuedKey.fullKey } : null,
      },
    });
  });

  app.get<{ Params: { companyId: string } }>("/:companyId/members", {
    schema: {
      summary: "List company members",
      params: companyParam,
      response: { 200: dataEnvelope(z.array(memberResponse)), 403: errorResponseSchema },
    },
  }, async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const members = await memberService.listMembers(request.account.id, request.params.companyId);
    return { data: members.map(memberService.formatMemberResponse) };
  });

  app.get<{ Params: { companyId: string; memberId: string } }>(
    "/:companyId/members/:memberId",
    {
      schema: {
        summary: "Get a company member",
        params: memberParam,
        response: { 200: dataEnvelope(memberResponse), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      assertCompanyScope(request, request.params.companyId);
      const member = await memberService.getMember(
        request.account.id,
        request.params.companyId,
        request.params.memberId,
      );
      return { data: memberService.formatMemberResponse(member) };
    },
  );

  app.patch<{ Params: { companyId: string; memberId: string } }>(
    "/:companyId/members/:memberId",
    {
      schema: {
        summary: "Update a company member",
        params: memberParam,
        body: updateMemberSchema,
        response: {
          200: dataEnvelope(z.object({ id: z.string().uuid(), role: z.enum(["owner", "admin", "member"]) })),
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      assertCompanyScope(request, request.params.companyId);
      const input = updateMemberSchema.parse(request.body);
      const updated = await memberService.updateMember(
        request.account.id,
        request.params.companyId,
        request.params.memberId,
        input,
      );
      return { data: { id: updated.id, role: updated.role } };
    },
  );

  app.delete<{ Params: { companyId: string; memberId: string }; Querystring: { hard_delete?: string } }>(
    "/:companyId/members/:memberId",
    {
      schema: {
        summary: "Remove a company member",
        description: "Soft-removes the member from the company. Pass `?hard_delete=true` to also delete the underlying account.",
        params: memberParam,
        querystring: z.object({ hard_delete: z.coerce.boolean().default(false) }),
        response: { 200: dataEnvelope(successResponse), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      assertCompanyScope(request, request.params.companyId);
      const hardDelete = z.coerce.boolean().default(false).parse(request.query.hard_delete);
      await memberService.removeMember(
        request.account.id,
        request.params.companyId,
        request.params.memberId,
        { hardDelete },
      );
      return { data: { success: true } };
    },
  );

  // -------------------- Mailboxes --------------------

  app.post<{ Params: { companyId: string } }>("/:companyId/mailboxes", {
    schema: {
      summary: "Assign a mailbox handle to a member",
      description: "Maps `local_part@domain` to a member account so that inbound mail to that address routes to the member.",
      params: companyParam,
      body: assignMailboxSchema,
      response: { 201: dataEnvelope(mailboxResponse), 400: errorResponseSchema, 403: errorResponseSchema, 409: errorResponseSchema },
    },
  }, async (request, reply) => {
    assertCompanyScope(request, request.params.companyId);
    const input = assignMailboxSchema.parse(request.body);
    const mailbox = await mailboxService.assignMailbox(request.account.id, request.params.companyId, {
      accountId: input.account_id,
      domainId: input.domain_id,
      localPart: input.local_part,
    });
    return reply.status(201).send({ data: mailboxService.formatMailboxResponse(mailbox) });
  });

  app.get<{ Params: { companyId: string }; Querystring: { domain_id?: string; account_id?: string } }>(
    "/:companyId/mailboxes",
    {
      schema: {
        summary: "List company mailboxes",
        description: "Filter by `domain_id` or `account_id` to narrow results.",
        params: companyParam,
        querystring: z.object({
          domain_id: z.string().uuid().optional(),
          account_id: z.string().uuid().optional(),
        }),
        response: { 200: dataEnvelope(z.array(mailboxResponse)), 403: errorResponseSchema },
      },
    },
    async (request) => {
      assertCompanyScope(request, request.params.companyId);
      const rows = await mailboxService.listMailboxes(request.account.id, request.params.companyId, {
        domainId: request.query.domain_id,
        accountId: request.query.account_id,
      });
      return { data: rows.map(mailboxService.formatMailboxResponse) };
    },
  );

  app.delete<{ Params: { companyId: string; mailboxId: string } }>(
    "/:companyId/mailboxes/:mailboxId",
    {
      schema: {
        summary: "Remove a mailbox",
        params: mailboxParam,
        response: { 200: dataEnvelope(successResponse), 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      assertCompanyScope(request, request.params.companyId);
      await mailboxService.removeMailbox(request.account.id, request.params.companyId, request.params.mailboxId);
      return { data: { success: true } };
    },
  );
}
