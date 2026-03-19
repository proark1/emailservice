import { simpleParser } from "mailparser";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains, emails, emailEvents } from "../db/schema/index.js";
import { getEmailSendQueue } from "../queues/index.js";
import type { Readable } from "node:stream";

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

  await getEmailSendQueue().add("send", { emailId: email.id, accountId });

  return { accepted: true, emailId: email.id };
}
