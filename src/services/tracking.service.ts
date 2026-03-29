import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emails, emailEvents, warmupEmails, warmupSchedules } from "../db/schema/index.js";
import { isRedisConfigured } from "../queues/index.js";
import { getConfig } from "../config/index.js";

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

  // Increment open count and fetch the row in one round-trip
  const [email] = await db
    .update(emails)
    .set({
      openCount: sql`${emails.openCount} + 1`,
      lastEventAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emails.id, emailId))
    .returning();

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

  // Update warmup open tracking if this is a warmup email
  if (email.tags?.["_warmup"] === "true") {
    try {
      const db = getDb();
      const now = new Date();
      const [warmupEmail] = await db
        .update(warmupEmails)
        .set({ opened: true, openedAt: now })
        .where(eq(warmupEmails.emailId, emailId))
        .returning({ scheduleId: warmupEmails.scheduleId });

      if (warmupEmail) {
        await db
          .update(warmupSchedules)
          .set({ totalOpens: sql`${warmupSchedules.totalOpens} + 1`, updatedAt: now })
          .where(eq(warmupSchedules.id, warmupEmail.scheduleId));
      }
    } catch {}
  }
}

export async function recordClick(emailId: string, url: string) {
  const db = getDb();

  // Increment click count and fetch the row in one round-trip
  const [email] = await db
    .update(emails)
    .set({
      clickCount: sql`${emails.clickCount} + 1`,
      lastEventAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emails.id, emailId))
    .returning();

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
    const config = getConfig();

    // New signed format: payload.signature
    const dotIndex = encoded.lastIndexOf(".");
    if (dotIndex !== -1) {
      const payload = encoded.substring(0, dotIndex);
      const sig = encoded.substring(dotIndex + 1);
      const expected = crypto.createHmac("sha256", config.ENCRYPTION_KEY).update(payload).digest("base64url");
      if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (data.emailId && data.url) {
          return { emailId: data.emailId, url: data.url };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
