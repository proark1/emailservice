import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emails, domains } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getFolderBySlug } from "./folder.service.js";
import { computeThreadId } from "./thread.service.js";
import type { SaveDraftInput, UpdateDraftInput } from "../schemas/draft.schema.js";

function parseFromAddress(from: string): { address: string; name?: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { address: from.trim() };
}

export async function saveDraft(accountId: string, input: SaveDraftInput) {
  const db = getDb();

  let draftsFolderId: string | null = null;
  try {
    const draftsFolder = await getFolderBySlug(accountId, "drafts");
    draftsFolderId = draftsFolder.id;
  } catch {
    // Folders not yet seeded
  }

  const from = input.from ? parseFromAddress(input.from) : { address: "" };
  const threadId = computeThreadId(null, input.in_reply_to, input.references, input.subject);

  const [draft] = await db
    .insert(emails)
    .values({
      accountId,
      folderId: draftsFolderId,
      fromAddress: from.address || "draft@placeholder",
      fromName: from.name,
      toAddresses: input.to || [],
      ccAddresses: input.cc,
      bccAddresses: input.bcc,
      replyTo: input.reply_to,
      subject: input.subject || "",
      htmlBody: input.html,
      textBody: input.text,
      headers: input.headers,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.content_type || "application/octet-stream",
        size: Buffer.from(a.content, "base64").length,
        content: a.content,
      })),
      status: "queued",
      isDraft: true,
      inReplyTo: input.in_reply_to,
      references: input.references,
      threadId,
    })
    .returning();

  return draft;
}

export async function updateDraft(accountId: string, draftId: string, input: UpdateDraftInput) {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, draftId), eq(emails.accountId, accountId), eq(emails.isDraft, true)));
  if (!existing) throw new NotFoundError("Draft");

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.from !== undefined) {
    const from = parseFromAddress(input.from);
    updateData.fromAddress = from.address;
    updateData.fromName = from.name;
  }
  if (input.to !== undefined) updateData.toAddresses = input.to;
  if (input.cc !== undefined) updateData.ccAddresses = input.cc;
  if (input.bcc !== undefined) updateData.bccAddresses = input.bcc;
  if (input.reply_to !== undefined) updateData.replyTo = input.reply_to;
  if (input.subject !== undefined) updateData.subject = input.subject;
  if (input.html !== undefined) updateData.htmlBody = input.html;
  if (input.text !== undefined) updateData.textBody = input.text;
  if (input.headers !== undefined) updateData.headers = input.headers;
  if (input.in_reply_to !== undefined) updateData.inReplyTo = input.in_reply_to;
  if (input.references !== undefined) updateData.references = input.references;
  if (input.attachments !== undefined) {
    updateData.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.content_type || "application/octet-stream",
      size: Buffer.from(a.content, "base64").length,
      content: a.content,
    }));
  }

  const [updated] = await db
    .update(emails)
    .set(updateData)
    .where(and(eq(emails.id, draftId), eq(emails.accountId, accountId), eq(emails.isDraft, true)))
    .returning();
  if (!updated) throw new NotFoundError("Draft");
  return updated;
}

export async function getDraft(accountId: string, draftId: string) {
  const db = getDb();
  const [draft] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, draftId), eq(emails.accountId, accountId), eq(emails.isDraft, true)));
  if (!draft) throw new NotFoundError("Draft");
  return draft;
}

export async function listDrafts(accountId: string, options: { limit?: number; cursor?: string } = {}) {
  const db = getDb();
  const limit = options.limit || 50;
  const conditions: any[] = [eq(emails.accountId, accountId), eq(emails.isDraft, true)];

  if (options.cursor) {
    const { lt } = await import("drizzle-orm");
    const [cursorEmail] = await db.select({ createdAt: emails.createdAt }).from(emails).where(eq(emails.id, options.cursor));
    if (cursorEmail) {
      conditions.push(lt(emails.createdAt, cursorEmail.createdAt));
    }
  }

  const rows = await db
    .select()
    .from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.updatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);

  return {
    data: data.map(formatDraftResponse),
    pagination: {
      has_more: hasMore,
      cursor: hasMore ? data[data.length - 1]?.id : null,
    },
  };
}

export async function sendDraft(accountId: string, draftId: string) {
  const db = getDb();
  const [draft] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, draftId), eq(emails.accountId, accountId), eq(emails.isDraft, true)));
  if (!draft) throw new NotFoundError("Draft");

  if (!draft.fromAddress || draft.fromAddress === "draft@placeholder") {
    throw new ValidationError("Draft must have a valid 'from' address before sending");
  }
  if (!draft.toAddresses || (draft.toAddresses as string[]).length === 0) {
    throw new ValidationError("Draft must have at least one recipient");
  }
  if (!draft.subject) {
    throw new ValidationError("Draft must have a subject");
  }
  if (!draft.htmlBody && !draft.textBody) {
    throw new ValidationError("Draft must have a body (html or text)");
  }

  // Validate domain
  const fromDomain = draft.fromAddress.split("@")[1];
  const [domain] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.accountId, accountId), eq(domains.name, fromDomain)));
  if (!domain || domain.status !== "verified") {
    throw new ValidationError(`Domain ${fromDomain} is not verified`);
  }

  // Move from drafts to sent folder
  let sentFolderId: string | null = null;
  try {
    const sentFolder = await getFolderBySlug(accountId, "sent");
    sentFolderId = sentFolder.id;
  } catch {}

  const [updated] = await db
    .update(emails)
    .set({
      isDraft: false,
      domainId: domain.id,
      folderId: sentFolderId,
      status: "queued",
      updatedAt: new Date(),
    })
    .where(and(eq(emails.id, draftId), eq(emails.accountId, accountId)))
    .returning();

  // Enqueue for sending
  const { isRedisConfigured, getEmailSendQueue } = await import("../queues/index.js");
  if (isRedisConfigured()) {
    try {
      await getEmailSendQueue().add("send", { emailId: updated.id, accountId });
    } catch {
      const { sendEmailDirect } = await import("./email-sender.js");
      sendEmailDirect(updated.id, accountId).catch(() => {});
    }
  } else {
    const { sendEmailDirect } = await import("./email-sender.js");
    sendEmailDirect(updated.id, accountId).catch(() => {});
  }

  return updated;
}

export async function deleteDraft(accountId: string, draftId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(emails)
    .where(and(eq(emails.id, draftId), eq(emails.accountId, accountId), eq(emails.isDraft, true)))
    .returning();
  if (!deleted) throw new NotFoundError("Draft");
  return deleted;
}

export function formatDraftResponse(draft: typeof emails.$inferSelect) {
  return {
    id: draft.id,
    from: draft.fromName ? `${draft.fromName} <${draft.fromAddress}>` : draft.fromAddress,
    to: draft.toAddresses,
    cc: draft.ccAddresses,
    bcc: draft.bccAddresses,
    subject: draft.subject,
    html: draft.htmlBody,
    text: draft.textBody,
    in_reply_to: draft.inReplyTo,
    references: draft.references,
    attachments: draft.attachments,
    created_at: draft.createdAt.toISOString(),
    updated_at: draft.updatedAt.toISOString(),
  };
}
