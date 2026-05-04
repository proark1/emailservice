import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDomainSchema, updateDomainSchema } from "../schemas/domain.schema.js";
import * as domainService from "../services/domain.service.js";
import { getDnsVerifyQueue } from "../queues/index.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const dnsRecord = z.object({
  type: z.string(),
  name: z.string(),
  value: z.string(),
  purpose: z.string(),
  verified: z.boolean(),
});

const domainResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["pending", "verified", "failed"]),
  mode: z.enum(["send", "receive", "both"]).optional(),
  company_id: z.string().uuid().nullable().optional(),
  records: z.array(dnsRecord),
  created_at: z.string(),
  // Soft-guardrail nudge for non-company-scoped POSTs.
  _warning: z.string().optional(),
}).passthrough();

const listDomainsQuery = z.object({
  unlinked: z.coerce.boolean().optional(),
  company_id: z.string().uuid().optional(),
});

/**
 * Company-scoped API keys may only operate on domains linked to their own
 * company. This guard fails closed: if the scoped key tries to touch a domain
 * belonging to a sibling company (or no company at all), we return 404 to
 * avoid leaking the domain's existence.
 */
async function assertDomainInScope(
  apiKey: { companyId: string | null } | undefined,
  accountId: string,
  domainId: string,
) {
  const companyScopeId = apiKey?.companyId ?? null;
  if (!companyScopeId) return;
  const domain = await domainService.getDomain(accountId, domainId);
  if (domain.companyId !== companyScopeId) {
    throw new NotFoundError("Domain");
  }
}

export default async function domainRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/domains
  app.post("/", {
    schema: {
      summary: "Add a sending domain",
      description: "Registers a domain and generates the SPF / DKIM / DMARC records you need to add. DNS verification is queued automatically (60s delay) and retries with backoff for up to 72h. Use `POST /v1/domains/:id/verify` to trigger immediately. **Multi-tenant platforms should prefer `POST /v1/companies/:id/domains`** so each customer's domain is scoped to their company.",
      body: createDomainSchema,
      response: { 201: dataEnvelope(domainResponse), 400: errorResponseSchema, 403: errorResponseSchema, 409: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createDomainSchema.parse(request.body);
    // Company-scoped keys must create domains under their company path:
    // /v1/companies/:id/domains. This preserves tenant isolation for billing
    // and keeps ownership unambiguous at creation time.
    if (request.apiKey.companyId) {
      throw new ForbiddenError("Company-scoped API keys must create domains via POST /v1/companies/:id/domains");
    }
    const domain = await domainService.createDomain(request.account.id, input);

    // Queue initial DNS verification with 60s delay
    await getDnsVerifyQueue().add("dns-verify", { domainId: domain.id, attempt: 0, startedAt: Date.now() }, { delay: 60_000 });

    const data: Record<string, unknown> = domainService.formatDomainResponse(domain);
    // Soft guardrail: if a master/user key (no company scope) creates a domain
    // that isn't linked to any company, surface a deprecation hint pointing the
    // platform at POST /v1/companies/:id/domains. Multi-tenant platforms that
    // pool domains on the master account hurt their ability to scope sends and
    // billing per customer later.
    const isCompanyScopedKey = !!request.apiKey.companyId;
    if (!isCompanyScopedKey && !domain.companyId) {
      reply.header(
        "Deprecation",
        'true; description="Pool-on-master-account flow"',
      );
      reply.header(
        "Link",
        '</v1/companies/:id/domains>; rel="successor-version"',
      );
      data._warning = "This domain was created without a company link. For multi-tenant platforms, prefer POST /v1/companies/:id/domains so each customer's domain stays scoped to their company. Existing master-account domains can be moved with POST /v1/companies/:id/adopt-domains.";
    }
    return reply.status(201).send({ data });
  });

  // GET /v1/domains?unlinked=true&company_id=...
  app.get("/", {
    schema: {
      summary: "List domains",
      description: "Lists domains owned by the authenticated account. Filter with `?unlinked=true` for domains not linked to any company, or `?company_id=...` to scope to one company.",
      querystring: listDomainsQuery,
      response: { 200: dataEnvelope(z.array(domainResponse)), 403: errorResponseSchema },
    },
  }, async (request) => {
    const query = listDomainsQuery.parse(request.query);
    // A company-scoped key implicitly filters by its own company. If the caller
    // also passed a company_id, require it to match.
    const keyCompanyId = request.apiKey.companyId;
    if (keyCompanyId && query.company_id && query.company_id !== keyCompanyId) {
      throw new ForbiddenError("API key is scoped to a different company");
    }
    const domainList = await domainService.listDomains(request.account.id, {
      unlinked: keyCompanyId ? false : query.unlinked,
      companyId: keyCompanyId ?? query.company_id,
    });
    return { data: domainList.map(domainService.formatDomainResponse) };
  });

  // GET /v1/domains/:id
  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get a domain",
      description: "Returns the domain plus the current verification status of each DNS record.",
      params: idParam,
      response: { 200: dataEnvelope(domainResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    await assertDomainInScope(request.apiKey, request.account.id, request.params.id);
    const domain = await domainService.getDomain(request.account.id, request.params.id);
    return { data: domainService.formatDomainResponse(domain) };
  });

  // PATCH /v1/domains/:id — deliverability tuning (DMARC rua, return-path, rate limit)
  app.patch<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update domain deliverability settings",
      description: "Tune DMARC rua, return-path domain, per-domain send rate limit, BIMI logo URLs, MTA-STS mode, and TLS-RPT rua. Pass `null` for any field to unset it.",
      params: idParam,
      body: updateDomainSchema,
      response: { 200: dataEnvelope(domainResponse), 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    await assertDomainInScope(request.apiKey, request.account.id, request.params.id);
    const input = updateDomainSchema.parse(request.body);
    const updated = await domainService.updateDomain(request.account.id, request.params.id, input);
    return { data: domainService.formatDomainResponse(updated) };
  });

  // DELETE /v1/domains/:id
  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete a domain",
      params: idParam,
      response: { 200: dataEnvelope(domainResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    await assertDomainInScope(request.apiKey, request.account.id, request.params.id);
    const deleted = await domainService.deleteDomain(request.account.id, request.params.id);
    return { data: domainService.formatDomainResponse(deleted) };
  });

  // POST /v1/domains/:id/verify
  app.post<{ Params: { id: string } }>("/:id/verify", {
    schema: {
      summary: "Run DNS verification now",
      description: "Triggers an immediate DNS verification pass on the domain (skipping the regular polling delay). Returns once the job is enqueued — poll `GET /v1/domains/:id` for the result.",
      params: idParam,
      response: {
        200: dataEnvelope(z.object({ message: z.string() })),
        404: errorResponseSchema,
      },
    },
  }, async (request) => {
    await assertDomainInScope(request.apiKey, request.account.id, request.params.id);
    const domain = await domainService.getDomain(request.account.id, request.params.id);
    await getDnsVerifyQueue().add("dns-verify", { domainId: domain.id, attempt: 0, startedAt: Date.now() });
    return { data: { message: "Verification initiated" } };
  });
}
