import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains, inboundEmails } from "../db/schema/index.js";
import { isRedisConfigured, getInboundEmailQueue } from "../queues/index.js";

export function createInboundServer(): SMTPServer {
  const server = new SMTPServer({
    secure: false,
    authOptional: true,
    disabledCommands: ["AUTH", "STARTTLS"],

    onRcptTo(address, session, callback) {
      const recipientDomain = address.address.split("@")[1];
      const db = getDb();

      db.select()
        .from(domains)
        .where(eq(domains.name, recipientDomain))
        .then((results) => {
          if (results.length > 0) {
            callback();
          } else {
            callback(new Error("Recipient domain not found"));
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

          const toAddress = session.envelope.rcptTo[0]?.address;
          const recipientDomain = toAddress?.split("@")[1];

          if (!recipientDomain || !toAddress) {
            callback(new Error("No recipient"));
            return;
          }

          const db = getDb();
          const [domain] = await db
            .select()
            .from(domains)
            .where(eq(domains.name, recipientDomain));

          if (!domain) {
            callback(new Error("Domain not found"));
            return;
          }

          const mailFrom = session.envelope.mailFrom;
          const fromAddress = parsed.from?.value?.[0]?.address || (mailFrom && typeof mailFrom === "object" ? mailFrom.address : "") || "unknown";
          const fromName = parsed.from?.value?.[0]?.name || undefined;
          const cc = parsed.cc
            ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap((a) => a.value.map((v) => v.address)).filter(Boolean) as string[]
            : undefined;

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
            headers: {} as Record<string, unknown>,
          };

          // Try queue first, fall back to direct DB insert
          if (isRedisConfigured()) {
            try {
              await getInboundEmailQueue().add("inbound", emailData);
              callback();
              return;
            } catch {}
          }

          // Direct insert (no Redis)
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
          });

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
