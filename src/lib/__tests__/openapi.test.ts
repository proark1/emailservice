import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import { z } from "zod";
import {
  OPENAPI_TAGS,
  dataEnvelope,
  errorResponseSchema,
  openapiTransform,
  serializerCompiler,
  validatorCompiler,
} from "../openapi.js";

/**
 * Smoke tests for the OpenAPI generation pipeline. These prove that:
 *  1. Zod schemas declared on a route end up as JSON Schema in the spec.
 *  2. Routes under public prefixes get auto-tagged from their URL.
 *  3. Routes under hidden prefixes (auth/, dashboard/, admin/, t/, c/) are
 *     omitted from the public spec.
 */

async function buildAppWithOpenapi() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(swagger, {
    openapi: {
      info: { title: "Test", version: "0.0.0" },
      tags: [...OPENAPI_TAGS],
    },
    transform: openapiTransform,
  });
  return app;
}

describe("openapi", () => {
  it("converts Zod schemas to JSON Schema in the OpenAPI document", async () => {
    const app = await buildAppWithOpenapi();
    app.post(
      "/v1/emails",
      {
        schema: {
          summary: "Send email",
          body: z.object({ to: z.string().email(), subject: z.string() }),
          response: { 201: dataEnvelope(z.object({ id: z.string().uuid() })) },
        },
      },
      async () => ({ data: { id: "00000000-0000-0000-0000-000000000000" } }),
    );
    await app.ready();

    const spec = app.swagger() as any;
    const op = spec.paths["/v1/emails"].post;
    expect(op.summary).toBe("Send email");
    expect(op.tags).toEqual(["Emails"]);
    expect(op.requestBody.content["application/json"].schema.required).toContain("to");
    expect(op.responses["201"].description).toBeDefined();
  });

  it("auto-tags v1 routes from their URL prefix when no tag is set", async () => {
    const app = await buildAppWithOpenapi();
    app.get("/v1/api-keys", { schema: { summary: "List keys" } }, async () => []);
    app.get("/v1/address-book", { schema: { summary: "List entries" } }, async () => []);
    app.get("/v1/domains/:id", { schema: { summary: "Get domain" } }, async () => ({}));
    await app.ready();

    const spec = app.swagger() as any;
    expect(spec.paths["/v1/api-keys"].get.tags).toEqual(["Api Keys"]);
    expect(spec.paths["/v1/address-book"].get.tags).toEqual(["Address Book"]);
    expect(spec.paths["/v1/domains/{id}"].get.tags).toEqual(["Domains"]);
  });

  it("hides non-public prefixes (auth, dashboard, admin, tracking, health) from the spec", async () => {
    const app = await buildAppWithOpenapi();
    app.post("/auth/login", async () => ({ ok: true }));
    app.get("/dashboard/stats", async () => ({ ok: true }));
    app.get("/admin/accounts", async () => ({ ok: true }));
    app.get("/t/:id", async () => Buffer.from(""));
    app.get("/c/:id", async () => ({ ok: true }));
    app.get("/health", async () => ({ status: "healthy" }));
    app.get("/v1/emails", async () => []);
    await app.ready();

    const spec = app.swagger() as any;
    expect(spec.paths["/auth/login"]).toBeUndefined();
    expect(spec.paths["/dashboard/stats"]).toBeUndefined();
    expect(spec.paths["/admin/accounts"]).toBeUndefined();
    expect(spec.paths["/t/{id}"]).toBeUndefined();
    expect(spec.paths["/c/{id}"]).toBeUndefined();
    expect(spec.paths["/health"]).toBeUndefined();
    // Sanity: a /v1 route still appears.
    expect(spec.paths["/v1/emails"]).toBeDefined();
  });

  it("validates request bodies via the Zod compiler", async () => {
    const app = await buildAppWithOpenapi();
    app.post(
      "/v1/emails",
      { schema: { body: z.object({ to: z.string().email() }) } },
      async () => ({ ok: true }),
    );
    const ok = await app.inject({
      method: "POST",
      url: "/v1/emails",
      payload: { to: "valid@example.com" },
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: "POST",
      url: "/v1/emails",
      payload: { to: "not-an-email" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("error response schema has the expected envelope shape", () => {
    const sample = { error: { type: "not_found", message: "Email" } };
    expect(() => errorResponseSchema.parse(sample)).not.toThrow();
  });
});
