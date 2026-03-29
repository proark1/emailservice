import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains, inboundEmails } from "../db/schema/index.js";
import { isRedisConfigured, getInboundEmailQueue } from "../queues/index.js";

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
      stream.on("error", (err: Error) => {
        callback(err);
      });
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

          // Extract References header (once, outside the loop)
          const referencesRaw = parsed.references;
          const references: string[] = Array.isArray(referencesRaw) ? referencesRaw : referencesRaw ? [referencesRaw] : [];

          // Extract attachments (once, outside the loop)
          const attachmentData = (parsed.attachments || []).map((att) => ({
            filename: att.filename || "attachment",
            contentType: att.contentType || "application/octet-stream",
            size: att.size || 0,
            content: att.content.toString("base64"),
          }));

          // Process ALL recipients, not just the first one
          for (const rcpt of session.envelope.rcptTo) {
            const toAddress = rcpt.address;
            const recipientDomain = toAddress?.split("@")[1];
            if (!recipientDomain || !toAddress) continue;

            const domain = await lookupReceiveDomain(recipientDomain);
            if (!domain) continue;

          const emailData = {
              accountId: domain.accountId,
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

            // Direct insert (no Redis)
            const db = getDb();
            await db.insert(inboundEmails).values({
              accountId: emailData.accountId,
              domainId: emailData.domainId,
              fromAddress: emailData.from,
              fromName: emailData.fromName,
              toAddress: emailData.to,
              ccAddresses: emailData.cc || null,
              subject: emailData.subject,
              textBody: emailData.text || null,
              htmlBody: emailData.html || null,
              messageId: emailData.messageId,
              inReplyTo: emailData.inReplyTo,
              references: emailData.references.length > 0 ? emailData.references : null,
              hasAttachments: emailData.attachments.length > 0,
              headers: (emailData.headers as Record<string, string>) || null,
            });
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
