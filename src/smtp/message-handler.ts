import { simpleParser } from "mailparser";
import { childLogger } from "../lib/logger.js";
import { sendEmail } from "../services/email.service.js";
import { AppError } from "../lib/errors.js";
import type { Readable } from "node:stream";

const log = childLogger("smtp-relay");

export interface SmtpRelayContext {
  accountId: string;
  companyId: string | null;
}

export async function handleIncomingMessage(
  stream: Readable,
  ctx: SmtpRelayContext,
): Promise<{ accepted: boolean; emailId?: string; error?: string }> {
  const parsed = await simpleParser(stream);

  // Extract from address
  const fromAddress = parsed.from?.value?.[0]?.address;
  if (!fromAddress) {
    return { accepted: false, error: "Missing from address" };
  }
  const fromName = parsed.from?.value?.[0]?.name;
  const fromHeader = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  // Extract recipients
  const toAddresses = (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [])
    .flatMap((addr) => addr.value.map((v) => v.address))
    .filter(Boolean) as string[];

  const ccAddresses = (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [])
    .flatMap((addr) => addr.value.map((v) => v.address))
    .filter(Boolean) as string[];

  const bccAddresses = (parsed.bcc ? (Array.isArray(parsed.bcc) ? parsed.bcc : [parsed.bcc]) : [])
    .flatMap((addr) => addr.value.map((v) => v.address))
    .filter(Boolean) as string[];

  if (toAddresses.length === 0) {
    return { accepted: false, error: "No recipients" };
  }

  // Convert mailparser attachments (Buffer) to the base64 shape sendEmail expects.
  const attachments = (parsed.attachments || []).map((att) => ({
    filename: att.filename || "attachment",
    content: (att.content as Buffer).toString("base64"),
    content_type: att.contentType || "application/octet-stream",
  }));

  // Route through the same code path as POST /v1/emails so SMTP-relay sends
  // pick up: suppression list, per-domain rate limit, domain.mode === "receive"
  // rejection, team mailbox restriction, AND company-scope isolation. Without
  // this, an attacker holding any API key (or a company-scoped key for tenant
  // A) could relay through tenant B's domain and ignore every send-time guard.
  try {
    const result = await sendEmail(
      ctx.accountId,
      {
        from: fromHeader,
        to: toAddresses,
        cc: ccAddresses.length > 0 ? ccAddresses : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
        subject: parsed.subject || "(no subject)",
        html: typeof parsed.html === "string" ? parsed.html : undefined,
        text: parsed.text || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      } as any,
      { companyScopeId: ctx.companyId },
    );
    const id = (result.response as { id?: string } | undefined)?.id;
    return { accepted: true, emailId: id };
  } catch (err) {
    if (err instanceof AppError) {
      log.warn({ err, accountId: ctx.accountId, companyId: ctx.companyId }, "smtp-relay rejected message");
      return { accepted: false, error: err.message };
    }
    log.error({ err, accountId: ctx.accountId }, "smtp-relay send failed");
    return { accepted: false, error: err instanceof Error ? err.message : "send failed" };
  }
}
