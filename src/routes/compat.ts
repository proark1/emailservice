import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as emailService from "../services/email.service.js";
import type { SendEmailInput } from "../schemas/email.schema.js";

/**
 * Drop-in compatibility shim for clients written against Resend
 * (api.resend.com) and Postmark (api.postmarkapp.com). The intent is to
 * reduce migration friction for teams switching to MailNowAPI: change the
 * base URL, keep the request bodies as-is, and the email goes through.
 *
 * Resend's send-email request body is already a near-superset of ours, so
 * the Resend route is a thin pass-through with field-name normalization.
 * Postmark uses PascalCase keys (`From`, `To`, `Subject`, `HtmlBody`,
 * `TextBody`, `Tag`, `Headers`, `Attachments` …) so we translate before
 * handing off to `sendEmail`.
 */

// ---------- Resend ----------

const resendAttachment = z.object({
  filename: z.string().max(255).optional(),
  content: z.union([z.string(), z.array(z.number())]).optional(),
  path: z.string().url().optional(),
  content_type: z.string().optional(),
});

const resendSchema = z.object({
  from: z.string().min(1),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  reply_to: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  subject: z.string().min(1).max(998),
  html: z.string().optional(),
  text: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  attachments: z.array(resendAttachment).optional(),
  // Resend supports `tags: [{ name, value }]` as an array; we accept that
  // and the simpler record form.
  tags: z
    .union([
      z.array(z.object({ name: z.string(), value: z.string() })),
      z.record(z.string(), z.string()),
    ])
    .optional(),
  scheduled_at: z.string().optional(),
});

function arrayify<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

function tagsToRecord(
  tags: Array<{ name: string; value: string }> | Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) {
    return Object.fromEntries(tags.map((t) => [t.name, t.value]));
  }
  return tags;
}

function resendToInternal(body: z.infer<typeof resendSchema>): SendEmailInput {
  // Attachments with `path:` (URL-fetched) are not supported — we don't want
  // the API process to do outbound HTTP fetches per-send (SSRF surface,
  // unbounded latency). Reject explicitly so callers get a 400 instead of
  // their `path:` quietly being dropped.
  if (body.attachments?.some((a) => a.path && !a.content)) {
    throw new Error(
      "attachments[].path is not supported — provide attachments[].content as base64",
    );
  }
  return {
    from: body.from,
    to: arrayify(body.to)!,
    cc: arrayify(body.cc),
    bcc: arrayify(body.bcc),
    reply_to: arrayify(body.reply_to),
    subject: body.subject,
    html: body.html,
    text: body.text,
    headers: body.headers,
    attachments: body.attachments?.map((a) => {
      // Resend allows base64 string OR Uint8Array-like number[]. Normalize
      // to base64 before persisting.
      const content =
        typeof a.content === "string"
          ? a.content
          : Buffer.from(a.content!).toString("base64");
      return {
        filename: a.filename ?? "attachment",
        content,
        content_type: a.content_type,
      };
    }),
    tags: tagsToRecord(body.tags),
    scheduled_at: body.scheduled_at,
  };
}

// ---------- Postmark ----------

const postmarkAttachment = z.object({
  Name: z.string(),
  Content: z.string(),
  ContentType: z.string().optional(),
  ContentID: z.string().optional(),
});

const postmarkSchema = z.object({
  From: z.string().min(1),
  To: z.string().min(1), // Postmark uses comma-separated strings
  Cc: z.string().optional(),
  Bcc: z.string().optional(),
  ReplyTo: z.string().optional(),
  Subject: z.string().min(1).max(998),
  HtmlBody: z.string().optional(),
  TextBody: z.string().optional(),
  Tag: z.string().optional(),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).optional(),
  Attachments: z.array(postmarkAttachment).optional(),
  Metadata: z.record(z.string(), z.string()).optional(),
  MessageStream: z.string().optional(),
});

const splitCsv = (s: string | undefined): string[] | undefined =>
  s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined;

function postmarkToInternal(body: z.infer<typeof postmarkSchema>): SendEmailInput {
  const headers = body.Headers
    ? Object.fromEntries(body.Headers.map((h) => [h.Name, h.Value]))
    : undefined;
  // Postmark allows tagging with a single `Tag` (string) plus arbitrary
  // key/value `Metadata`. Both fold into our `tags` record.
  const tags: Record<string, string> = {};
  if (body.Tag) tags.tag = body.Tag;
  if (body.Metadata) Object.assign(tags, body.Metadata);

  return {
    from: body.From,
    to: splitCsv(body.To)!,
    cc: splitCsv(body.Cc),
    bcc: splitCsv(body.Bcc),
    reply_to: splitCsv(body.ReplyTo),
    subject: body.Subject,
    html: body.HtmlBody,
    text: body.TextBody,
    headers,
    attachments: body.Attachments?.map((a) => ({
      filename: a.Name,
      content: a.Content,
      content_type: a.ContentType,
    })),
    tags: Object.keys(tags).length > 0 ? tags : undefined,
  };
}

export default async function compatRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // Resend-style: POST /v1/compat/resend/emails
  app.post("/resend/emails", async (request, reply) => {
    const body = resendSchema.parse(request.body);
    const input = resendToInternal(body);
    const result = await emailService.sendEmail(request.account.id, input, {
      companyScopeId: request.apiKey.companyId,
    });
    if (result.cached) {
      const cached = result.response as { status: number; body: unknown };
      return reply.status(cached.status).send(cached.body);
    }
    const internal = result.response as { id: string; from: string; to: string[]; subject: string; created_at: string };
    // Resend returns: { id }
    return reply.status(200).send({ id: internal.id });
  });

  // Postmark-style: POST /v1/compat/postmark/email
  app.post("/postmark/email", async (request, reply) => {
    const body = postmarkSchema.parse(request.body);
    const input = postmarkToInternal(body);
    const result = await emailService.sendEmail(request.account.id, input, {
      companyScopeId: request.apiKey.companyId,
    });
    if (result.cached) {
      const cached = result.response as { status: number; body: unknown };
      return reply.status(cached.status).send(cached.body);
    }
    const internal = result.response as { id: string; from: string; to: string[]; subject: string; created_at: string };
    // Postmark returns:
    //   { To, SubmittedAt, MessageID, ErrorCode, Message }
    return reply.status(200).send({
      To: input.to.join(", "),
      SubmittedAt: internal.created_at,
      MessageID: internal.id,
      ErrorCode: 0,
      Message: "OK",
    });
  });
}
