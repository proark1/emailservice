import { Worker, Job } from "bullmq";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { getRedisConnection } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { emails, emailEvents, domains } from "../db/schema/index.js";
import { getDkimPrivateKey } from "../services/dkim.service.js";
import { transformHtml } from "../lib/html-transform.js";
import { getConfig } from "../config/index.js";

export interface EmailSendJobData {
  emailId: string;
  accountId: string;
}

function createTransport() {
  const config = getConfig();
  if (config.NODE_ENV === "development") {
    // Use Mailpit in development
    return nodemailer.createTransport({
      host: config.SMTP_DEV_HOST,
      port: config.SMTP_DEV_PORT,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }
  // Production: direct SMTP delivery
  return nodemailer.createTransport({
    direct: true,
    name: "emailservice.dev",
  } as any);
}

async function processEmailSend(job: Job<EmailSendJobData>) {
  const { emailId, accountId } = job.data;
  const db = getDb();

  // Load email
  const [email] = await db.select().from(emails).where(eq(emails.id, emailId));
  if (!email) return;
  if (email.status !== "queued") return;

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
          dkimConfig = {
            domainName: domain.name,
            keySelector: domain.dkimSelector,
            privateKey,
          };
        } catch {
          // DKIM decryption failed — send without signing
        }
      }
    }

    // Transform HTML for tracking
    let html = email.htmlBody;
    if (html) {
      html = transformHtml(html, email.id);
    }

    // Build message
    const transport = createTransport();
    const messageOpts: nodemailer.SendMailOptions = {
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
    };

    const info = await transport.sendMail(messageOpts);

    // Update email as sent
    await db
      .update(emails)
      .set({
        status: "sent",
        sentAt: new Date(),
        messageId: info.messageId,
        lastEventAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emails.id, emailId));

    await db.insert(emailEvents).values({
      emailId,
      accountId,
      type: "sent",
      data: { messageId: info.messageId },
    });
  } catch (error) {
    // Mark as failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(emails)
      .set({
        status: "failed",
        lastEventAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emails.id, emailId));

    await db.insert(emailEvents).values({
      emailId,
      accountId,
      type: "failed",
      data: { error: errorMessage },
    });

    throw error; // Let BullMQ retry
  }
}

export function createEmailSendWorker() {
  return new Worker("email:send", processEmailSend, {
    connection: getRedisConnection(),
    concurrency: 10,
  });
}
