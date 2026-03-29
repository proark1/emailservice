import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emails, emailEvents, domains } from "../db/schema/index.js";
import { getDkimPrivateKey } from "./dkim.service.js";
import { transformHtml } from "../lib/html-transform.js";
import { getConfig } from "../config/index.js";
import { encryptPrivateKey } from "../lib/crypto.js";
import { processDeliveryFailure } from "./suppression.service.js";

let _transport: nodemailer.Transporter | null = null;

// Cache decrypted DKIM keys to avoid AES-GCM decryption on every send
const DKIM_CACHE_TTL_MS = 10 * 60 * 1000;
interface DkimCacheEntry { privateKey: string; domainName: string; keySelector: string; expiresAt: number }
const dkimCache = new Map<string, DkimCacheEntry>();

function getOrCreateTransport(): nodemailer.Transporter {
  if (!_transport) _transport = createTransport();
  return _transport;
}

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
    const isLocalRelay = !config.SMTP_USER;
    return nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT || 587,
      secure: config.SMTP_SECURE === "true",
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      tls: isLocalRelay ? false as any : { rejectUnauthorized: false },
      ignoreTLS: isLocalRelay,
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
 * Send a system notification email (e.g. invitation, team notification).
 * Uses the same transport as outbound emails but does not create DB records.
 */
export async function sendSystemEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const config = getConfig();
  const transport = getOrCreateTransport();
  const from = `noreply@${new URL(config.BASE_URL).hostname}`;

  await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

/**
 * Send an email directly (no queue/Redis needed).
 * Used as fallback when Redis is unavailable, or called by the worker.
 */
export async function sendEmailDirect(emailId: string, accountId: string): Promise<void> {
  const db = getDb();

  // Atomically claim the email for sending — prevents duplicate sends from concurrent workers
  const [email] = await db
    .update(emails)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(emails.id, emailId), inArray(emails.status, ["queued", "sending"])))
    .returning();

  if (!email) return;

  try {
    // Load domain for DKIM (cache decrypted key to avoid per-send AES-GCM decryption)
    let dkimConfig = undefined;
    if (email.domainId) {
      const now = Date.now();
      const cached = dkimCache.get(email.domainId);
      if (cached && cached.expiresAt > now) {
        dkimConfig = { domainName: cached.domainName, keySelector: cached.keySelector, privateKey: cached.privateKey };
      } else {
        const [domain] = await db.select().from(domains).where(eq(domains.id, email.domainId));
        if (domain?.dkimPrivateKey && domain.dkimSelector) {
          try {
            const privateKey = getDkimPrivateKey(domain.dkimPrivateKey);
            dkimConfig = { domainName: domain.name, keySelector: domain.dkimSelector, privateKey };
            dkimCache.set(email.domainId, { privateKey, domainName: domain.name, keySelector: domain.dkimSelector, expiresAt: now + DKIM_CACHE_TTL_MS });
          } catch (err) {
            console.error(`[email-sender] Failed to load DKIM key for domain ${domain.name}:`, err);
          }
        }
      }
    }

    // Transform HTML for tracking
    let html = email.htmlBody;
    if (html) {
      html = transformHtml(html, email.id);
    }

    // Build List-Unsubscribe headers
    const fromDomain = email.fromAddress.split("@")[1];
    const config = getConfig();
    const unsubscribeHeaders: Record<string, string> = {
      "List-Unsubscribe": `<mailto:unsubscribe@${fromDomain}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    // Add web-based unsubscribe link if we have recipient info
    if (email.toAddresses?.length) {
      const recipientEmail = Array.isArray(email.toAddresses) ? email.toAddresses[0] : email.toAddresses;
      // Encrypt unsubscribe data to prevent accountId/email leakage
      const encodedData = encodeURIComponent(encryptPrivateKey(JSON.stringify({ a: accountId, e: recipientEmail }), config.ENCRYPTION_KEY));
      unsubscribeHeaders["List-Unsubscribe"] = `<${config.BASE_URL}/unsubscribe/${encodedData}>, <mailto:unsubscribe@${fromDomain}>`;
    }

    // Auto-generate text/plain from HTML if not provided (critical for deliverability)
    let textBody = email.textBody;
    if (!textBody && html) {
      textBody = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li[^>]*>/gi, "  - ")
        .replace(/<\/h[1-6]>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    // Generate RFC 5322 compliant Message-ID using the sender's domain
    const messageId = `<${crypto.randomUUID()}@${fromDomain}>`;

    // Build Feedback-ID for Gmail Postmaster Tools
    const feedbackId = `${email.id}:${accountId}:transactional:${fromDomain}`;

    // Sanitize user-provided headers — block dangerous ones that could hijack mail routing
    const BLOCKED_HEADERS = new Set(["from", "to", "cc", "bcc", "sender", "return-path", "envelope-from", "dkim-signature", "received", "authentication-results", "arc-seal", "arc-message-signature", "arc-authentication-results"]);
    const existingHeaders = email.headers || {};
    const sanitizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(existingHeaders)) {
      if (!BLOCKED_HEADERS.has(key.toLowerCase()) && !key.toLowerCase().startsWith("x-google-") && !value.includes("\n") && !value.includes("\r")) {
        sanitizedHeaders[key] = value;
      }
    }
    const mergedHeaders: Record<string, string> = {
      ...sanitizedHeaders,
      ...unsubscribeHeaders,
      "Feedback-ID": feedbackId,
      "X-Mailer": "MailNowAPI/1.0",
    };

    // Add reply/forward threading headers
    if (email.inReplyTo) {
      mergedHeaders["In-Reply-To"] = email.inReplyTo;
    }
    if (email.references && email.references.length > 0) {
      mergedHeaders["References"] = (email.references as string[]).join(" ");
    }

    const transport = getOrCreateTransport();
    const info = await transport.sendMail({
      from: email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress,
      to: email.toAddresses,
      cc: email.ccAddresses || undefined,
      bcc: email.bccAddresses || undefined,
      replyTo: email.replyTo || undefined,
      subject: email.subject,
      html: html || undefined,
      text: textBody || undefined,
      messageId,
      // Set envelope sender for SPF alignment (Return-Path matches From domain)
      envelope: {
        from: `bounces@${fromDomain}`,
        to: [
          ...(email.toAddresses || []),
          ...(email.ccAddresses || []),
          ...(email.bccAddresses || []),
        ].filter(Boolean),
      },
      headers: mergedHeaders,
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

    if (errorMessage.includes("550") || errorMessage.includes("bounce") || errorMessage.includes("rejected") || errorMessage.includes("undeliverable")) {
      try {
        for (const addr of (email.toAddresses || [])) {
          await processDeliveryFailure(accountId, addr, "bounce");
        }
      } catch {}
    }

    throw error;
  }
}
