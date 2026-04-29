import { simpleParser } from "mailparser";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains, emails, emailEvents } from "../db/schema/index.js";
import { isRedisConfigured, getEmailSendQueue } from "../queues/index.js";
import { childLogger } from "../lib/logger.js";
import type { Readable } from "node:stream";

const log = childLogger("smtp-relay");

export async function handleIncomingMessage(
  stream: Readable,
  accountId: string,
): Promise<{ accepted: boolean; emailId?: string; error?: string }> {
  const parsed = await simpleParser(stream);

  // Extract from address
  const fromAddress = parsed.from?.value?.[0]?.address;
  if (!fromAddress) {
    return { accepted: false, error: "Missing from address" };
  }

  const fromDomain = fromAddress.split("@")[1];
  const fromName = parsed.from?.value?.[0]?.name;

  // Verify sender domain
  const db = getDb();
  const [domain] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.accountId, accountId), eq(domains.name, fromDomain)));

  if (!domain || domain.status !== "verified") {
    return { accepted: false, error: `Domain ${fromDomain} not verified` };
  }

  // Extract recipients
  const toAddresses = (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [])
    .flatMap((addr) => addr.value.map((v) => v.address))
    .filter(Boolean) as string[];

  const ccAddresses = (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [])
    .flatMap((addr) => addr.value.map((v) => v.address))
    .filter(Boolean) as string[];

  if (toAddresses.length === 0) {
    return { accepted: false, error: "No recipients" };
  }

  // Create email record
  const [email] = await db
    .insert(emails)
    .values({
      accountId,
      domainId: domain.id,
      fromAddress,
      fromName: fromName || null,
      toAddresses,
      ccAddresses: ccAddresses.length > 0 ? ccAddresses : null,
      subject: parsed.subject || "(no subject)",
      htmlBody: parsed.html || null,
      textBody: parsed.text || null,
      status: "queued",
    })
    .returning();

  await db.insert(emailEvents).values({
    emailId: email.id,
    accountId,
    type: "queued",
    data: { source: "smtp" },
  });

  // Queue or direct send. We log every failure path explicitly — the SMTP
  // relay has already replied 250 OK to the upstream client, so any failure
  // here would otherwise vanish silently and the user would assume the mail
  // went out.
  if (isRedisConfigured()) {
    try {
      await getEmailSendQueue().add("send", { emailId: email.id, accountId });
    } catch (queueErr) {
      log.warn(
        { err: queueErr, emailId: email.id, accountId },
        "queue.add failed; falling back to direct send",
      );
      const { sendEmailDirect } = await import("../services/email-sender.js");
      sendEmailDirect(email.id, accountId).catch((sendErr) => {
        log.error(
          { err: sendErr, emailId: email.id, accountId },
          "fallback direct send failed after queue.add error",
        );
      });
    }
  } else {
    const { sendEmailDirect } = await import("../services/email-sender.js");
    sendEmailDirect(email.id, accountId).catch((sendErr) => {
      log.error(
        { err: sendErr, emailId: email.id, accountId },
        "direct send failed (no Redis configured)",
      );
    });
  }

  return { accepted: true, emailId: email.id };
}
