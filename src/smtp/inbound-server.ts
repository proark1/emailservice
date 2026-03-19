import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains } from "../db/schema/index.js";
import { getInboundEmailQueue } from "../queues/index.js";

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
          if (results.length > 0 && results[0].mxVerified) {
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

          if (!recipientDomain) {
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

          // Enqueue for processing
          await getInboundEmailQueue().add("inbound", {
            accountId: domain.accountId,
            from: parsed.from?.text || "",
            to: toAddress,
            subject: parsed.subject || "",
            text: parsed.text || "",
            html: parsed.html || "",
            headers: Object.fromEntries(parsed.headers),
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
