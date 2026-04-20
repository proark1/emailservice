import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDomainSchema, updateDomainSchema } from "../schemas/domain.schema.js";
import * as domainService from "../services/domain.service.js";
import { getDnsVerifyQueue } from "../queues/index.js";

export default async function domainRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/domains
  app.post("/", async (request, reply) => {
    const input = createDomainSchema.parse(request.body);
    const domain = await domainService.createDomain(request.account.id, input);

    // Queue initial DNS verification with 60s delay
    await getDnsVerifyQueue().add("dns-verify", { domainId: domain.id, attempt: 0, startedAt: Date.now() }, { delay: 60_000 });

    const data: Record<string, unknown> = domainService.formatDomainResponse(domain);
    // Soft guardrail: if a master/user key (no company scope) creates a domain
    // that isn't linked to any company, surface a deprecation hint pointing the
    // platform at POST /v1/companies/:id/domains. Multi-tenant platforms that
    // pool domains on the master account hurt their ability to scope sends and
    // billing per customer later.
    const isCompanyScopedKey = !!(request.apiKey as any)?.companyId;
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
  app.get("/", async (request) => {
    const query = z.object({
      unlinked: z.coerce.boolean().optional(),
      company_id: z.string().uuid().optional(),
    }).parse(request.query);
    const domainList = await domainService.listDomains(request.account.id, {
      unlinked: query.unlinked,
      companyId: query.company_id,
    });
    return { data: domainList.map(domainService.formatDomainResponse) };
  });

  // GET /v1/domains/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const domain = await domainService.getDomain(request.account.id, request.params.id);
    return { data: domainService.formatDomainResponse(domain) };
  });

  // PATCH /v1/domains/:id — deliverability tuning (DMARC rua, return-path, rate limit)
  app.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateDomainSchema.parse(request.body);
    const updated = await domainService.updateDomain(request.account.id, request.params.id, input);
    return { data: domainService.formatDomainResponse(updated) };
  });

  // DELETE /v1/domains/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await domainService.deleteDomain(request.account.id, request.params.id);
    return { data: domainService.formatDomainResponse(deleted) };
  });

  // POST /v1/domains/:id/verify
  app.post<{ Params: { id: string } }>("/:id/verify", async (request) => {
    const domain = await domainService.getDomain(request.account.id, request.params.id);
    await getDnsVerifyQueue().add("dns-verify", { domainId: domain.id, attempt: 0, startedAt: Date.now() });
    return { data: { message: "Verification initiated" } };
  });
}
