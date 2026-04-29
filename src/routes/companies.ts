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

  app.post("/", async (request, reply) => {
    const input = createCompanySchema.parse(request.body);
    // Company-scoped keys cannot create new companies — user keys only.
    if (request.apiKey.companyId) {
      throw new ForbiddenError("Company-scoped API keys cannot create companies");
    }
    const company = await companyService.createCompany(request.account.id, input);
    return reply.status(201).send({ data: companyService.formatCompanyResponse(company) });
  });

  app.get("/", async (request) => {
    const keyCompanyId = request.apiKey.companyId;
    const rows = await companyService.listCompaniesForAccount(request.account.id, {
      companyId: keyCompanyId,
    });
    return { data: rows.map((r) => companyService.formatCompanyResponse(r as any)) };
  });

  app.get<{ Params: { companyId: string } }>("/:companyId", async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const company = await companyService.getCompany(request.account.id, request.params.companyId);
    return { data: companyService.formatCompanyResponse(company) };
  });

  app.patch<{ Params: { companyId: string } }>("/:companyId", async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const input = updateCompanySchema.parse(request.body);
    const updated = await companyService.updateCompany(request.account.id, request.params.companyId, input);
    return { data: companyService.formatCompanyResponse(updated) };
  });

  app.delete<{ Params: { companyId: string } }>("/:companyId", async (request) => {
    assertCompanyScope(request, request.params.companyId);
    if (request.apiKey.companyId) {
      throw new ForbiddenError("Company-scoped API keys cannot delete the company");
    }
    await companyService.deleteCompany(request.account.id, request.params.companyId);
    return { data: { success: true } };
  });

  // -------------------- Company API keys --------------------

  app.post<{ Params: { companyId: string } }>("/:companyId/api-keys", async (request, reply) => {
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
        key: fullKey, // shown once, never again
      },
    });
  });

  app.get<{ Params: { companyId: string } }>("/:companyId/api-keys", async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const keys = await companyService.listCompanyApiKeys(request.account.id, request.params.companyId);
    return { data: keys.map(companyService.formatCompanyApiKeyResponse) };
  });

  app.delete<{ Params: { companyId: string; keyId: string } }>("/:companyId/api-keys/:keyId", async (request) => {
    assertCompanyScope(request, request.params.companyId);
    await companyService.revokeCompanyApiKey(request.account.id, request.params.companyId, request.params.keyId);
    return { data: { success: true } };
  });

  // -------------------- Domain linkage --------------------

  app.post<{ Params: { companyId: string } }>("/:companyId/domains", async (request, reply) => {
    assertCompanyScope(request, request.params.companyId);
    const input = linkDomainSchema.parse(request.body);
    const domain = "domain_id" in input
      ? await companyService.linkDomainToCompany(request.account.id, request.params.companyId, input.domain_id)
      : await companyService.createAndLinkDomain(request.account.id, request.params.companyId, {
          name: input.name,
          mode: input.mode,
        });
    // Return the full domain response including DNS records so the caller can
    // surface them to the customer configuring the domain.
    const { formatDomainResponse } = await import("../services/domain.service.js");
    return reply.status(201).send({ data: formatDomainResponse(domain) });
  });

  app.get<{ Params: { companyId: string } }>("/:companyId/domains", async (request) => {
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
  app.post<{ Params: { companyId: string } }>("/:companyId/adopt-domains", async (request) => {
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

  app.post<{ Params: { companyId: string } }>("/:companyId/members", async (request, reply) => {
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
        generated_password: result.generatedPassword, // null if caller supplied one
        api_key: result.issuedKey ? { id: result.issuedKey.id, key: result.issuedKey.fullKey } : null,
      },
    });
  });

  app.get<{ Params: { companyId: string } }>("/:companyId/members", async (request) => {
    assertCompanyScope(request, request.params.companyId);
    const members = await memberService.listMembers(request.account.id, request.params.companyId);
    return { data: members.map(memberService.formatMemberResponse) };
  });

  app.get<{ Params: { companyId: string; memberId: string } }>(
    "/:companyId/members/:memberId",
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

  app.post<{ Params: { companyId: string } }>("/:companyId/mailboxes", async (request, reply) => {
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
    async (request) => {
      assertCompanyScope(request, request.params.companyId);
      await mailboxService.removeMailbox(request.account.id, request.params.companyId, request.params.mailboxId);
      return { data: { success: true } };
    },
  );
}
