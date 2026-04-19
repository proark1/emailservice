import { FastifyInstance } from "fastify";
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

    return reply.status(201).send({
      data: domainService.formatDomainResponse(domain),
    });
  });

  // GET /v1/domains
  app.get("/", async (request) => {
    const domainList = await domainService.listDomains(request.account.id);
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
