/**
 * Build a stubbed Fastify instance, register every public /v1/* route, then
 * dump the resulting OpenAPI 3.1 document to `openapi.json` at the repo root.
 *
 * The script doesn't talk to Postgres or Redis — it stubs `app.authenticate`,
 * `request.account`, and `request.apiKey` so route registration succeeds
 * without any infrastructure. Running this in CI doubles as a "the spec
 * compiles" check: any route whose Zod schema can't round-trip through the
 * Zod-to-JSON-Schema bridge will fail here before we ship.
 *
 * Usage:
 *   pnpm openapi:export                      → writes openapi.json + prints stats
 *   pnpm openapi:export --check              → fails if openapi.json on disk is stale
 */

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import {
  OPENAPI_TAGS,
  buildOpenapiWebhooks,
  injectStandardResponses,
  openapiTransform,
  serializerCompiler,
  validatorCompiler,
} from "../src/lib/openapi.js";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputPath = path.join(repoRoot, "openapi.json");

async function build() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Stub the auth decorator and request decorations so route handlers' onRequest
  // hooks succeed during registration. We never actually invoke the handlers.
  app.decorate("authenticate", async () => {});
  app.decorateRequest("account", null as any);
  app.decorateRequest("apiKey", null as any);
  app.addHook("onRequest", async (req: any) => {
    req.account = { id: "00000000-0000-0000-0000-000000000000" };
    req.apiKey = { companyId: null };
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "MailNowAPI",
        description:
          "Self-hosted email service platform. Send transactional and marketing email, " +
          "receive inbound mail, manage domains and webhooks, run sequences and broadcasts.",
        version: process.env.npm_package_version ?? "1.6.1",
        contact: { name: "MailNowAPI support", url: "https://mailnowapi.com" },
        license: { name: "ISC" },
      },
      servers: [
        { url: "https://mailnowapi.com", description: "Production" },
        { url: "http://localhost:3000", description: "Local development" },
      ],
      tags: [
        ...OPENAPI_TAGS,
        { name: "Webhook events", description: "Outbound events MailNowAPI POSTs to subscribed webhooks." },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "API key in the form `es_xxxxxxxx`. Pass as `Authorization: Bearer es_xxx`.",
          },
        },
      },
      security: [{ bearerAuth: [] }],
      webhooks: buildOpenapiWebhooks() as any,
    } as any,
    transform: openapiTransform,
    hideUntagged: false,
  });

  // Public /v1/* routes. Mirror src/routes/index.ts mount paths.
  const routeManifest: Array<[string, string]> = [
    ["../src/routes/api-keys.js", "/v1/api-keys"],
    ["../src/routes/domains.js", "/v1/domains"],
    ["../src/routes/emails.js", "/v1/emails"],
    ["../src/routes/batch.js", "/v1/emails/batch"],
    ["../src/routes/webhooks.js", "/v1/webhooks"],
    ["../src/routes/audiences.js", "/v1/audiences"],
    ["../src/routes/broadcasts.js", "/v1/broadcasts"],
    ["../src/routes/warmup.js", "/v1/warmup"],
    ["../src/routes/templates.js", "/v1/templates"],
    ["../src/routes/folders.js", "/v1/folders"],
    ["../src/routes/inbox.js", "/v1/inbox"],
    ["../src/routes/drafts.js", "/v1/drafts"],
    ["../src/routes/threads.js", "/v1/threads"],
    ["../src/routes/signatures.js", "/v1/signatures"],
    ["../src/routes/address-book.js", "/v1/address-book"],
    ["../src/routes/team.js", "/v1/team"],
    ["../src/routes/mailboxes.js", "/v1/mailboxes"],
    ["../src/routes/sequences.js", "/v1/sequences"],
    ["../src/routes/companies.js", "/v1/companies"],
    ["../src/routes/compat.js", "/v1/compat"],
    ["../src/routes/deliverability.js", "/v1/deliverability"],
  ];

  for (const [modulePath, prefix] of routeManifest) {
    const m: any = await import(modulePath);
    await app.register(m.default, { prefix });
  }

  await app.ready();
  const spec = app.swagger() as any;
  injectStandardResponses(spec);
  return spec;
}

async function main() {
  const check = process.argv.includes("--check");
  const spec = await build();
  const json = JSON.stringify(spec, null, 2) + "\n";

  // Stats
  const paths = Object.keys(spec.paths || {});
  let ops = 0;
  let withSummary = 0;
  let withOperationId = 0;
  for (const p of paths) {
    const item = (spec.paths as any)[p];
    for (const method of Object.keys(item)) {
      if (method === "parameters") continue;
      ops++;
      if (item[method].summary) withSummary++;
      if (item[method].operationId) withOperationId++;
    }
  }

  if (check) {
    let onDisk: string;
    try {
      onDisk = await readFile(outputPath, "utf8");
    } catch {
      console.error(`✗ ${outputPath} does not exist. Run \`pnpm openapi:export\` and commit it.`);
      process.exit(1);
    }
    if (onDisk !== json) {
      console.error(`✗ ${outputPath} is out of date. Run \`pnpm openapi:export\` and commit the result.`);
      process.exit(1);
    }
    console.log(`✓ openapi.json is up to date (${paths.length} paths, ${ops} operations)`);
    return;
  }

  await writeFile(outputPath, json);
  console.log(`✓ Wrote ${outputPath}`);
  console.log(`  ${paths.length} paths, ${ops} operations`);
  console.log(`  ${withSummary}/${ops} have a summary, ${withOperationId}/${ops} have an operationId`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
