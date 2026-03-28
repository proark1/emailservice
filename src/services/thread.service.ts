import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { inboundEmails, emails } from "../db/schema/index.js";

/**
 * Compute a deterministic thread ID from email headers.
 * Priority: first message-id in References chain, then In-Reply-To, then subject-based fallback.
 */
export function computeThreadId(
  messageId?: string | null,
  inReplyTo?: string | null,
  references?: string[] | null,
  subject?: string | null,
): string | null {
  // Use the root message-id from the References chain if available
  if (references && references.length > 0) {
    return `ref:${references[0]}`;
  }
  if (inReplyTo) {
    return `ref:${inReplyTo}`;
  }
  // Fallback: normalize subject (strip Re:/Fwd: prefixes)
  if (subject) {
    const normalized = subject
      .replace(/^(re|fwd?|fw):\s*/gi, "")
      .trim()
      .toLowerCase();
    if (normalized.length > 0) {
      return `subj:${normalized}`;
    }
  }
  // If we have a messageId, the email starts its own thread
  if (messageId) {
    return `ref:${messageId}`;
  }
  return null;
}

export async function getThread(accountId: string, threadId: string) {
  const db = getDb();

  // Get inbound emails in this thread
  const inbound = await db
    .select()
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.accountId, accountId),
        eq(inboundEmails.threadId, threadId),
        isNull(inboundEmails.deletedAt),
      ),
    )
    .orderBy(inboundEmails.createdAt);

  // Get outbound emails in this thread
  const outbound = await db
    .select()
    .from(emails)
    .where(
      and(
        eq(emails.accountId, accountId),
        eq(emails.threadId, threadId),
        eq(emails.isDraft, false),
        isNull(emails.deletedAt),
      ),
    )
    .orderBy(emails.createdAt);

  // Merge and sort by date
  const messages = [
    ...inbound.map((e) => ({
      id: e.id,
      type: "inbound" as const,
      from: e.fromAddress,
      from_name: e.fromName,
      to: e.toAddress,
      cc: e.ccAddresses,
      subject: e.subject,
      text_body: e.textBody,
      html_body: e.htmlBody,
      message_id: e.messageId,
      is_read: e.isRead,
      is_starred: e.isStarred,
      has_attachments: e.hasAttachments,
      created_at: e.createdAt,
    })),
    ...outbound.map((e) => ({
      id: e.id,
      type: "outbound" as const,
      from: e.fromAddress,
      from_name: e.fromName,
      to: Array.isArray(e.toAddresses) ? (e.toAddresses as string[]).join(", ") : "",
      cc: e.ccAddresses,
      subject: e.subject,
      text_body: e.textBody,
      html_body: e.htmlBody,
      message_id: e.messageId,
      is_read: true,
      is_starred: false,
      has_attachments: !!e.attachments && e.attachments.length > 0,
      created_at: e.createdAt,
    })),
  ].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  return {
    thread_id: threadId,
    message_count: messages.length,
    messages: messages.map((m) => ({
      ...m,
      created_at: m.created_at.toISOString(),
    })),
  };
}

export async function listThreads(
  accountId: string,
  options: { folderId?: string; limit?: number; cursor?: string } = {},
) {
  const db = getDb();
  const limit = options.limit || 50;

  const conditions = [
    eq(inboundEmails.accountId, accountId),
    isNull(inboundEmails.deletedAt),
    sql`${inboundEmails.threadId} IS NOT NULL`,
  ];

  if (options.folderId) {
    conditions.push(eq(inboundEmails.folderId, options.folderId));
  }

  if (options.cursor) {
    conditions.push(sql`${inboundEmails.createdAt} < ${options.cursor}`);
  }

  // Get latest email per thread
  const threads = await db
    .selectDistinctOn([inboundEmails.threadId], {
      threadId: inboundEmails.threadId,
      subject: inboundEmails.subject,
      fromAddress: inboundEmails.fromAddress,
      fromName: inboundEmails.fromName,
      isRead: inboundEmails.isRead,
      createdAt: inboundEmails.createdAt,
    })
    .from(inboundEmails)
    .where(and(...conditions))
    .orderBy(inboundEmails.threadId, desc(inboundEmails.createdAt))
    .limit(limit + 1);

  const hasMore = threads.length > limit;
  const data = threads.slice(0, limit);

  // Sort by latest message date descending
  data.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    data: data.map((t) => ({
      thread_id: t.threadId,
      subject: t.subject,
      from: t.fromAddress,
      from_name: t.fromName,
      is_read: t.isRead,
      latest_at: t.createdAt.toISOString(),
    })),
    pagination: {
      has_more: hasMore,
      cursor: hasMore ? data[data.length - 1]?.createdAt.toISOString() : null,
    },
  };
}
