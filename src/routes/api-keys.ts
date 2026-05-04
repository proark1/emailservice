import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createApiKeySchema } from "../schemas/api-key.schema.js";
import * as apiKeyService from "../services/api-key.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const apiKeyResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key_prefix: z.string(),
  permissions: z.record(z.string(), z.boolean()),
  rate_limit: z.number(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
});

const createApiKeyResponse = apiKeyResponse.extend({
  key: z.string().describe("Full API key — shown only once on creation. Save it securely."),
});

export default async function apiKeyRoutes(app: FastifyInstance) {
  // All routes require authentication. Account-level API key management is
  // not exposed to company-scoped keys — those manage their own keys via
  // POST /v1/companies/:id/api-keys.
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // POST /v1/api-keys
  app.post(
    "/",
    {
      schema: {
        summary: "Create an API key",
        description: "Mint a new API key for the authenticated account. The full key is returned **only once** in the `key` field — store it before navigating away.",
        body: createApiKeySchema,
        response: { 201: dataEnvelope(createApiKeyResponse), 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const input = createApiKeySchema.parse(request.body);
      const { apiKey, fullKey } = await apiKeyService.createApiKey(request.account.id, input);

      return reply.status(201).send({
        data: {
          ...apiKeyService.formatApiKeyResponse(apiKey),
          key: fullKey, // Only returned on creation
        },
      });
    },
  );

  // GET /v1/api-keys
  app.get(
    "/",
    {
      schema: {
        summary: "List API keys",
        response: { 200: dataEnvelope(z.array(apiKeyResponse)) },
      },
    },
    async (request) => {
      const keys = await apiKeyService.listApiKeys(request.account.id);
      return {
        data: keys.map(apiKeyService.formatApiKeyResponse),
      };
    },
  );

  // DELETE /v1/api-keys/:id
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        summary: "Revoke an API key",
        description: "Revokes the key immediately. Subsequent requests using it will return 401.",
        params: idParam,
        response: { 200: dataEnvelope(apiKeyResponse), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const revoked = await apiKeyService.revokeApiKey(request.account.id, request.params.id);
      return reply.send({
        data: apiKeyService.formatApiKeyResponse(revoked),
      });
    },
  );
}
