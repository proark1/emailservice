import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emails, emailEvents, domains } from "../db/schema/index.js";
import { getDkimPrivateKey } from "./dkim.service.js";
import { transformHtml } from "../lib/html-transform.js";
import { getConfig } from "../config/index.js";

function createTransport() {
  const config = getConfig();

  // Development: use local SMTP dev server (Mailhog etc.)
  if (config.NODE_ENV === "development") {
    return nodemailer.createTransport({
      host: config.SMTP_DEV_HOST,
      port: config.SMTP_DEV_PORT,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }

  // Production with a configured SMTP relay (recommended for cloud deployments
  // where outbound port 25 is blocked — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
  if (config.SMTP_HOST) {
    return nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT || 587,
      secure: config.SMTP_SECURE === "true",
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      tls: { rejectUnauthorized: false },
    });
  }

  // Production direct send — connects directly to recipient's MX on port 25.
  // Requires outbound port 25 to be open (not available on most cloud providers).
  // Set SMTP_HOST to a relay instead if you see connection refused errors.
  return nodemailer.createTransport({
    direct: true,
    name: new URL(config.BASE_URL).hostname,
  } as any);
}

/**
 * Send an email directly (no queue/Redis needed).
 * Used as fallback when Redis is unavailable, or called by the worker.
 */
export async function sendEmailDirect(emailId: string, accountId: string): Promise<void> {
  const db = getDb();

  const [email] = await db.select().from(emails).where(eq(emails.id, emailId));
  if (!email) return;
  if (email.status !== "queued" && email.status !== "sending") return;

  // Mark as sending
  await db.update(emails).set({ status: "sending", updatedAt: new Date() }).where(eq(emails.id, emailId));

  try {
    // Load domain for DKIM
    let dkimConfig = undefined;
    if (email.domainId) {
      const [domain] = await db.select().from(domains).where(eq(domains.id, email.domainId));
      if (domain?.dkimPrivateKey && domain.dkimSelector) {
        try {
          const privateKey = getDkimPrivateKey(domain.dkimPrivateKey);
          dkimConfig = { domainName: domain.name, keySelector: domain.dkimSelector, privateKey };
        } catch {}
      }
    }

    // Transform HTML for tracking
    let html = email.htmlBody;
    if (html) {
      html = transformHtml(html, email.id);
    }

    const transport = createTransport();
    const info = await transport.sendMail({
      from: email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress,
      to: email.toAddresses,
      cc: email.ccAddresses || undefined,
      bcc: email.bccAddresses || undefined,
      replyTo: email.replyTo || undefined,
      subject: email.subject,
      html: html || undefined,
      text: email.textBody || undefined,
      headers: email.headers || undefined,
      attachments: email.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        contentType: a.contentType,
      })),
      ...(dkimConfig ? { dkim: dkimConfig } : {}),
    });

    await db.update(emails).set({
      status: "sent",
      sentAt: new Date(),
      messageId: info.messageId,
      lastEventAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(emails.id, emailId));

    await db.insert(emailEvents).values({
      emailId,
      accountId,
      type: "sent",
      data: { messageId: info.messageId },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db.update(emails).set({
      status: "failed",
      lastEventAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(emails.id, emailId));

    await db.insert(emailEvents).values({
      emailId,
      accountId,
      type: "failed",
      data: { error: errorMessage },
    });
  }
}
