import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emails, emailEvents } from "../db/schema/index.js";
import { isRedisConfigured } from "../queues/index.js";

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export function getTrackingPixel(): Buffer {
  return TRACKING_PIXEL;
}

export async function recordOpen(emailId: string) {
  const db = getDb();

  // Increment open count
  await db
    .update(emails)
    .set({
      openCount: sql`${emails.openCount} + 1`,
      lastEventAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emails.id, emailId));

  // Get account ID for event
  const [email] = await db.select().from(emails).where(eq(emails.id, emailId));
  if (!email) return;

  const [event] = await db.insert(emailEvents).values({
    emailId,
    accountId: email.accountId,
    type: "opened",
    data: { timestamp: new Date().toISOString() },
  }).returning();

  // Dispatch webhook for open event
  if (isRedisConfigured()) {
    try {
      const { dispatchEvent } = await import("./webhook.service.js");
      await dispatchEvent(email.accountId, "email.opened", event.id, {
        email_id: emailId,
        timestamp: new Date().toISOString(),
      });
    } catch {}
  }
}

export async function recordClick(emailId: string, url: string) {
  const db = getDb();

  await db
    .update(emails)
    .set({
      clickCount: sql`${emails.clickCount} + 1`,
      lastEventAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emails.id, emailId));

  const [email] = await db.select().from(emails).where(eq(emails.id, emailId));
  if (!email) return;

  const [event] = await db.insert(emailEvents).values({
    emailId,
    accountId: email.accountId,
    type: "clicked",
    data: { url, timestamp: new Date().toISOString() },
  }).returning();

  // Dispatch webhook for click event
  if (isRedisConfigured()) {
    try {
      const { dispatchEvent } = await import("./webhook.service.js");
      await dispatchEvent(email.accountId, "email.clicked", event.id, {
        email_id: emailId,
        url,
        timestamp: new Date().toISOString(),
      });
    } catch {}
  }
}

export function decodeClickTrackingData(encoded: string): { emailId: string; url: string } | null {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const data = JSON.parse(decoded);
    if (data.emailId && data.url) {
      return { emailId: data.emailId, url: data.url };
    }
    return null;
  } catch {
    return null;
  }
}
