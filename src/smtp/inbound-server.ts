import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains, emails, inboundEmails } from "../db/schema/index.js";
import { isRedisConfigured, getInboundEmailQueue } from "../queues/index.js";

/**
 * Look up the original outbound email this bounce/FBL is referring to.
 *
 * Forged DSNs are trivial to craft (just paste in arbitrary `Final-Recipient:`
 * lines), so before we mutate suppression state we confirm that the
 * Original-Message-Id actually names a message *we* sent from *this* account,
 * to the recipient the DSN is claiming bounced.
 *
 * Returns the matching email row or null when the bounce can't be attributed.
 */
async function findOriginalSend(
  accountId: string,
  originalMessageId: string | undefined,
  recipient: string,
) {
  if (!originalMessageId) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: emails.id, toAddresses: emails.toAddresses, accountId: emails.accountId })
    .from(emails)
    .where(and(eq(emails.accountId, accountId), eq(emails.messageId, originalMessageId)))
    .limit(1);
  if (!row) return null;
  const target = recipient.toLowerCase();
  const recipients = (row.toAddresses || []).map((r) => r.toLowerCase());
  if (!recipients.includes(target)) return null;
  return row;
}

/**
 * Check that a domain is verified and configured for receiving.
 * Returns the domain row if valid, null otherwise.
 */
async function lookupReceiveDomain(recipientDomain: string) {
  const db = getDb();
  const [domain] = await db
    .select()
    .from(domains)
    .where(
      and(
        eq(domains.name, recipientDomain),
        eq(domains.status, "verified"),
        inArray(domains.mode, ["receive", "both"]),
      ),
    );
  return domain ?? null;
}

export function createInboundServer(): SMTPServer {
  const server = new SMTPServer({
    secure: false,
    authOptional: true,
    disabledCommands: ["AUTH", "STARTTLS"],
    size: 25 * 1024 * 1024, // 25 MB max message size

    onRcptTo(address, session, callback) {
      const recipientDomain = address.address.split("@")[1];
      if (!recipientDomain) {
        callback(new Error("Invalid recipient"));
        return;
      }

      lookupReceiveDomain(recipientDomain)
        .then((domain) => {
          if (domain) {
            callback();
          } else {
            callback(new Error("Recipient domain not found or not configured for receiving"));
          }
        })
        .catch((err) => callback(err));
    },

    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", async () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          const parsed = await simpleParser(raw);

          const mailFrom = session.envelope.mailFrom;
          const fromAddress = parsed.from?.value?.[0]?.address || (mailFrom && typeof mailFrom === "object" ? mailFrom.address : "") || "unknown";
          const fromName = parsed.from?.value?.[0]?.name || undefined;
          const cc = parsed.cc
            ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap((a) => a.value.map((v) => v.address)).filter(Boolean) as string[]
            : undefined;

          // Extract useful headers
          const headerMap: Record<string, string> = {};
          if (parsed.headers) {
            for (const [key, value] of parsed.headers) {
              if (typeof value === "string") {
                headerMap[key] = value;
              }
            }
          }

          // Process ALL recipients, not just the first one
          for (const rcpt of session.envelope.rcptTo) {
            const toAddress = rcpt.address;
            const recipientDomain = toAddress?.split("@")[1];
            if (!recipientDomain || !toAddress) continue;

            const domain = await lookupReceiveDomain(recipientDomain);
            if (!domain) continue;

            // If the domain is delegated to a company, try to route the message
            // to the member account that owns this specific handle. When no
            // mapping exists we fall back to the domain owner so mail is not lost.
            let deliveryAccountId = domain.accountId;
            if (domain.companyId) {
              try {
                const { resolveMailbox } = await import("../services/company-mailbox.service.js");
                const localPart = toAddress.split("@")[0];
                const resolved = await resolveMailbox(domain.id, localPart);
                if (resolved) deliveryAccountId = resolved.accountId;
              } catch {}
            }

            // DSN (RFC 3464) and FBL (RFC 5965) short-circuit:
            // these aren't user-facing mail — they're machine reports that
            // should auto-suppress failed / complaining recipients and fire a
            // webhook, then disappear. Storing them in the inbox would pollute
            // the user's folder.
            try {
              const { isDsn, isFbl, parseDsn, parseFbl } = await import("../services/bounce-parser.service.js");
              const { addSuppression } = await import("../services/suppression.service.js");
              const { dispatchEvent } = await import("../services/webhook.service.js");
              const crypto = await import("node:crypto");

              if (isDsn(parsed)) {
                const bounces = parseDsn(parsed);
                for (const b of bounces) {
                  const original = await findOriginalSend(deliveryAccountId, b.originalMessageId, b.recipient);
                  if (!original) {
                    // Unattributable DSN — likely forged or out-of-date. Drop silently
                    // rather than letting it mutate suppression state.
                    continue;
                  }
                  if (b.permanent) {
                    await addSuppression(deliveryAccountId, b.recipient, "bounce", original.id).catch(() => {});
                  }
                  await dispatchEvent(
                    deliveryAccountId,
                    b.permanent ? "email.bounced" : "email.soft_bounced",
                    crypto.randomUUID(),
                    { recipient: b.recipient, status: b.status, diagnostic: b.diagnostic, original_message_id: b.originalMessageId, email_id: original.id },
                  ).catch(() => {});
                }
                continue; // skip inbox storage
              }

              if (isFbl(parsed)) {
                const complaints = parseFbl(parsed);
                for (const c of complaints) {
                  const original = await findOriginalSend(deliveryAccountId, c.originalMessageId, c.complainant);
                  if (!original) continue;
                  await addSuppression(deliveryAccountId, c.complainant, "complaint", original.id).catch(() => {});
                  await dispatchEvent(
                    deliveryAccountId,
                    "email.complained",
                    crypto.randomUUID(),
                    { complainant: c.complainant, feedback_type: c.feedbackType, original_message_id: c.originalMessageId, email_id: original.id },
                  ).catch(() => {});
                }
                continue; // skip inbox storage
              }
            } catch (err) {
              // Parser errors should not break inbound delivery of real mail.
              console.error("[inbound] bounce/FBL detection failed:", err);
            }

            // Extract References header
          const referencesRaw = parsed.references;
          const references: string[] = Array.isArray(referencesRaw) ? referencesRaw : referencesRaw ? [referencesRaw] : [];

          // Extract attachments
          const attachmentData = (parsed.attachments || []).map((att) => ({
            filename: att.filename || "attachment",
            contentType: att.contentType || "application/octet-stream",
            size: att.size || 0,
            content: att.content.toString("base64"),
          }));

          const emailData = {
              accountId: deliveryAccountId,
              domainId: domain.id,
              from: fromAddress,
              fromName,
              to: toAddress,
              cc,
              subject: parsed.subject || "(no subject)",
              text: parsed.text || "",
              html: typeof parsed.html === "string" ? parsed.html : "",
              messageId: parsed.messageId,
              inReplyTo: parsed.inReplyTo,
              references,
              headers: headerMap as Record<string, unknown>,
              attachments: attachmentData,
            };

            // Try queue first, fall back to direct DB insert
            if (isRedisConfigured()) {
              try {
                await getInboundEmailQueue().add("inbound", emailData);
                continue;
              } catch {}
            }

            // Direct insert (no Redis) — include all fields the worker would set
            const db = getDb();
            let inboxFolderId: string | null = null;
            try {
              const { getFolderBySlug } = await import("../services/folder.service.js");
              const folder = await getFolderBySlug(emailData.accountId, "inbox");
              inboxFolderId = folder.id;
            } catch {}
            const { computeThreadId } = await import("../services/thread.service.js");
            const threadId = computeThreadId(emailData.messageId, emailData.inReplyTo, emailData.references, emailData.subject);
            const hasAttachments = attachmentData.length > 0;

            const [stored] = await db.insert(inboundEmails).values({
              accountId: emailData.accountId,
              domainId: emailData.domainId,
              folderId: inboxFolderId,
              fromAddress: emailData.from,
              fromName: emailData.fromName,
              toAddress: emailData.to,
              ccAddresses: emailData.cc || null,
              subject: emailData.subject,
              textBody: emailData.text || null,
              htmlBody: emailData.html || null,
              messageId: emailData.messageId,
              inReplyTo: emailData.inReplyTo,
              threadId,
              references: emailData.references.length > 0 ? emailData.references : null,
              hasAttachments,
              headers: (emailData.headers as Record<string, string>) || null,
            }).returning();

            // Store attachments for direct insert too
            if (hasAttachments && stored) {
              try {
                const { storeInboundAttachment } = await import("../services/attachment.service.js");
                for (const att of attachmentData) {
                  await storeInboundAttachment(emailData.accountId, stored.id, {
                    filename: att.filename,
                    contentType: att.contentType,
                    size: att.size,
                    content: Buffer.from(att.content, "base64"),
                  });
                }
              } catch {}
            }

            // Auto-learn sender contact
            try {
              const { autoLearnContact } = await import("../services/address-book.service.js");
              await autoLearnContact(emailData.accountId, emailData.from, emailData.fromName);
            } catch {}
          }

          callback();
        } catch (err) {
          callback(err instanceof Error ? err : new Error("Processing failed"));
        }
      });
    },

    onConnect(session, callback) {
      callback();
    },

    onMailFrom(address, session, callback) {
      callback();
    },
  });

  return server;
}
