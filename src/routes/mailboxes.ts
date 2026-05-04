import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as mailboxService from "../services/mailbox.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const mailboxResponse = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  email: z.string().email(),
  provider: z.enum(["gmail", "outlook", "yahoo", "icloud", "custom"]),
  smtp_host: z.string(),
  smtp_port: z.number(),
  imap_host: z.string(),
  imap_port: z.number(),
  last_sync_at: z.string().nullable(),
  created_at: z.string(),
}).passthrough();

const testResultResponse = z.object({
  smtp: z.object({ ok: z.boolean(), error: z.string().nullable().optional() }),
  imap: z.object({ ok: z.boolean(), error: z.string().nullable().optional() }),
}).passthrough();

const providerEnum = ["gmail", "outlook", "yahoo", "icloud", "custom"] as const;

const createMailboxSchema = z.object({
  display_name: z.string().min(1).max(255),
  email: z.string().email(),
  provider: z.enum(providerEnum).default("custom"),
  smtp_host: z.string().min(1),
  smtp_port: z.number().int().min(1).max(65535).default(587),
  smtp_secure: z.boolean().default(false),
  imap_host: z.string().min(1),
  imap_port: z.number().int().min(1).max(65535).default(993),
  imap_secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
});

const updateMailboxSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  smtp_host: z.string().min(1).optional(),
  smtp_port: z.number().int().min(1).max(65535).optional(),
  smtp_secure: z.boolean().optional(),
  imap_host: z.string().min(1).optional(),
  imap_port: z.number().int().min(1).max(65535).optional(),
  imap_secure: z.boolean().optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
});

export default async function mailboxRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    // Connected SMTP/IMAP credentials are scoped to accountId only; a
    // company-scoped key would otherwise read sibling tenants' SMTP
    // passwords (encrypted, but still data leakage).
    assertNotCompanyScoped(request);
  });

  // GET /v1/mailboxes/providers — available provider presets
  app.get("/providers", {
    schema: {
      summary: "List provider presets",
      description: "Returns SMTP/IMAP host + port presets for popular providers (Gmail, Outlook, Yahoo, iCloud) so the UI can pre-fill the connection form.",
      response: { 200: dataEnvelope(z.any()) },
    },
  }, async () => {
    return { data: mailboxService.PROVIDER_PRESETS };
  });

  // POST /v1/mailboxes
  app.post("/", {
    schema: {
      summary: "Connect an external mailbox",
      description: "Connect an external IMAP/SMTP mailbox (Gmail, Outlook, Yahoo, iCloud, or custom). Credentials are AES-256-GCM encrypted at rest. After creation, run `POST /:id/test` to verify connectivity.",
      body: createMailboxSchema,
      response: { 201: dataEnvelope(mailboxResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createMailboxSchema.parse(request.body);
    const mailbox = await mailboxService.createMailbox(request.account.id, {
      displayName: input.display_name,
      email: input.email,
      provider: input.provider,
      smtpHost: input.smtp_host,
      smtpPort: input.smtp_port,
      smtpSecure: input.smtp_secure,
      imapHost: input.imap_host,
      imapPort: input.imap_port,
      imapSecure: input.imap_secure,
      username: input.username,
      password: input.password,
    });
    return reply.status(201).send({ data: mailboxService.formatMailboxResponse(mailbox) });
  });

  // GET /v1/mailboxes
  app.get("/", {
    schema: {
      summary: "List connected mailboxes",
      response: { 200: dataEnvelope(z.array(mailboxResponse)) },
    },
  }, async (request) => {
    const list = await mailboxService.listMailboxes(request.account.id);
    return { data: list.map(mailboxService.formatMailboxResponse) };
  });

  // GET /v1/mailboxes/:id
  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get a connected mailbox",
      params: idParam,
      response: { 200: dataEnvelope(mailboxResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const mailbox = await mailboxService.getMailbox(request.account.id, request.params.id);
    return { data: mailboxService.formatMailboxResponse(mailbox) };
  });

  // PATCH /v1/mailboxes/:id
  app.patch<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update a connected mailbox",
      params: idParam,
      body: updateMailboxSchema,
      response: { 200: dataEnvelope(mailboxResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateMailboxSchema.parse(request.body);
    const mailbox = await mailboxService.updateMailbox(request.account.id, request.params.id, {
      displayName: input.display_name,
      smtpHost: input.smtp_host,
      smtpPort: input.smtp_port,
      smtpSecure: input.smtp_secure,
      imapHost: input.imap_host,
      imapPort: input.imap_port,
      imapSecure: input.imap_secure,
      username: input.username,
      password: input.password,
    });
    return { data: mailboxService.formatMailboxResponse(mailbox) };
  });

  // DELETE /v1/mailboxes/:id
  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Disconnect a mailbox",
      params: idParam,
      response: { 204: z.null(), 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    await mailboxService.deleteMailbox(request.account.id, request.params.id);
    return reply.status(204).send();
  });

  // POST /v1/mailboxes/:id/test — test SMTP + IMAP connectivity
  app.post<{ Params: { id: string } }>("/:id/test", {
    schema: {
      summary: "Test SMTP + IMAP connectivity",
      params: idParam,
      response: { 200: dataEnvelope(testResultResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const result = await mailboxService.testMailboxConnection(request.account.id, request.params.id);
    return { data: result };
  });

  // POST /v1/mailboxes/:id/sync — trigger an immediate IMAP sync
  app.post<{ Params: { id: string } }>("/:id/sync", {
    schema: {
      summary: "Trigger an IMAP sync",
      description: "Enqueues an immediate IMAP sync for this mailbox. Returns once the job is queued (the sync runs asynchronously).",
      params: idParam,
      response: { 200: dataEnvelope(z.object({ queued: z.boolean() })), 404: errorResponseSchema },
    },
  }, async (request) => {
    const mailbox = await mailboxService.getMailbox(request.account.id, request.params.id);
    const { getMailboxSyncQueue, isRedisConfigured } = await import("../queues/index.js");
    if (isRedisConfigured()) {
      await getMailboxSyncQueue().add("manual-sync", { mailboxId: mailbox.id });
    }
    return { data: { queued: true } };
  });
}
