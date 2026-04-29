import { FastifyInstance } from "fastify";
import { createApiKeySchema } from "../schemas/api-key.schema.js";
import * as apiKeyService from "../services/api-key.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";

export default async function apiKeyRoutes(app: FastifyInstance) {
  // All routes require authentication. Account-level API key management is
  // not exposed to company-scoped keys — those manage their own keys via
  // POST /v1/companies/:id/api-keys.
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // POST /v1/api-keys
  app.post("/", async (request, reply) => {
    const input = createApiKeySchema.parse(request.body);
    const { apiKey, fullKey } = await apiKeyService.createApiKey(request.account.id, input);

    return reply.status(201).send({
      data: {
        ...apiKeyService.formatApiKeyResponse(apiKey),
        key: fullKey, // Only returned on creation
      },
    });
  });

  // GET /v1/api-keys
  app.get("/", async (request) => {
    const keys = await apiKeyService.listApiKeys(request.account.id);
    return {
      data: keys.map(apiKeyService.formatApiKeyResponse),
    };
  });

  // DELETE /v1/api-keys/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const revoked = await apiKeyService.revokeApiKey(request.account.id, request.params.id);
    return reply.send({
      data: apiKeyService.formatApiKeyResponse(revoked),
    });
  });
}
