import { eq, and, desc, or, ilike, isNull, sql, inArray } from "drizzle-orm";

function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}
import { getDb } from "../db/index.js";
import { inboundEmails } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getFolderBySlug } from "./folder.service.js";
import type { ListInboxInput, UpdateInboxEmailInput, BulkActionInput } from "../schemas/inbox.schema.js";

export async function listInboxEmails(accountId: string, input: ListInboxInput) {
  const db = getDb();

  // Build access condition: own emails OR emails on domains user is a member of
  const { getAccessibleDomainIds } = await import("./team.service.js");
  const accessibleIds = await getAccessibleDomainIds(accountId);
  const accessCondition = accessibleIds.length > 0
    ? or(eq(inboundEmails.accountId, accountId), inArray(inboundEmails.domainId, accessibleIds))!
    : eq(inboundEmails.accountId, accountId);
  const conditions: any[] = [accessCondition];

  // Folder filtering
  if (input.folder_slug === "trash") {
    // Trash shows deleted emails
    conditions.push(sql`${inboundEmails.deletedAt} IS NOT NULL`);
  } else {
    conditions.push(isNull(inboundEmails.deletedAt));

    if (input.folder_id) {
      conditions.push(eq(inboundEmails.folderId, input.folder_id));
    } else if (input.folder_slug) {
      const folder = await getFolderBySlug(accountId, input.folder_slug);
      conditions.push(eq(inboundEmails.folderId, folder.id));
    }
    // If no folder specified, show all non-deleted emails
  }

  if (input.thread_id) {
    conditions.push(eq(inboundEmails.threadId, input.thread_id));
  }
  if (input.search) {
    const escaped = escapeIlike(input.search);
    conditions.push(
      or(
        ilike(inboundEmails.subject, `%${escaped}%`),
        ilike(inboundEmails.fromAddress, `%${escaped}%`),
        ilike(inboundEmails.fromName, `%${escaped}%`),
      ),
    );
  }
  if (input.is_read !== undefined) {
    conditions.push(eq(inboundEmails.isRead, input.is_read === "true"));
  }
  if (input.is_starred !== undefined) {
    conditions.push(eq(inboundEmails.isStarred, input.is_starred === "true"));
  }
  if (input.cursor) {
    conditions.push(sql`${inboundEmails.createdAt} < ${input.cursor}`);
  }

  const rows = await db
    .select()
    .from(inboundEmails)
    .where(and(...conditions))
    .orderBy(desc(inboundEmails.createdAt))
    .limit(input.limit + 1);

  const hasMore = rows.length > input.limit;
  const data = rows.slice(0, input.limit);

  return {
    data: data.map(formatInboxEmailResponse),
    pagination: {
      has_more: hasMore,
      cursor: hasMore ? data[data.length - 1]?.createdAt.toISOString() : null,
    },
  };
}

export async function getInboxEmail(accountId: string, emailId: string) {
  const db = getDb();
  const [email] = await db
    .select()
    .from(inboundEmails)
    .where(and(eq(inboundEmails.id, emailId), eq(inboundEmails.accountId, accountId)));
  if (!email) throw new NotFoundError("Email");
  return email;
}

export async function updateInboxEmail(accountId: string, emailId: string, input: UpdateInboxEmailInput) {
  const db = getDb();
  const updateData: Record<string, any> = {};
  if (input.is_read !== undefined) updateData.isRead = input.is_read;
  if (input.is_starred !== undefined) updateData.isStarred = input.is_starred;

  const [updated] = await db
    .update(inboundEmails)
    .set(updateData)
    .where(and(eq(inboundEmails.id, emailId), eq(inboundEmails.accountId, accountId)))
    .returning();
  if (!updated) throw new NotFoundError("Email");
  return updated;
}

export async function moveToFolder(accountId: string, emailId: string, folderId: string) {
  const db = getDb();
  const [updated] = await db
    .update(inboundEmails)
    .set({ folderId, deletedAt: null })
    .where(and(eq(inboundEmails.id, emailId), eq(inboundEmails.accountId, accountId)))
    .returning();
  if (!updated) throw new NotFoundError("Email");
  return updated;
}

export async function moveToTrash(accountId: string, emailId: string) {
  const trashFolder = await getFolderBySlug(accountId, "trash");
  const db = getDb();
  const [updated] = await db
    .update(inboundEmails)
    .set({ folderId: trashFolder.id, deletedAt: new Date() })
    .where(and(eq(inboundEmails.id, emailId), eq(inboundEmails.accountId, accountId)))
    .returning();
  if (!updated) throw new NotFoundError("Email");
  return updated;
}

export async function restoreFromTrash(accountId: string, emailId: string) {
  const inboxFolder = await getFolderBySlug(accountId, "inbox");
  const db = getDb();
  const [updated] = await db
    .update(inboundEmails)
    .set({ folderId: inboxFolder.id, deletedAt: null })
    .where(and(eq(inboundEmails.id, emailId), eq(inboundEmails.accountId, accountId)))
    .returning();
  if (!updated) throw new NotFoundError("Email");
  return updated;
}

export async function permanentDelete(accountId: string, emailId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(inboundEmails)
    .where(and(eq(inboundEmails.id, emailId), eq(inboundEmails.accountId, accountId)))
    .returning();
  if (!deleted) throw new NotFoundError("Email");
  return deleted;
}

export async function bulkAction(accountId: string, input: BulkActionInput) {
  const db = getDb();
  const { ids, action, folder_id } = input;

  const conditions = and(
    inArray(inboundEmails.id, ids),
    eq(inboundEmails.accountId, accountId),
  );

  let affected: { id: string }[] = [];
  switch (action) {
    case "mark_read":
      affected = await db.update(inboundEmails).set({ isRead: true }).where(conditions!).returning({ id: inboundEmails.id });
      break;
    case "mark_unread":
      affected = await db.update(inboundEmails).set({ isRead: false }).where(conditions!).returning({ id: inboundEmails.id });
      break;
    case "star":
      affected = await db.update(inboundEmails).set({ isStarred: true }).where(conditions!).returning({ id: inboundEmails.id });
      break;
    case "unstar":
      affected = await db.update(inboundEmails).set({ isStarred: false }).where(conditions!).returning({ id: inboundEmails.id });
      break;
    case "move_to_folder": {
      if (!folder_id) throw new ValidationError("folder_id is required for move_to_folder action");
      affected = await db.update(inboundEmails).set({ folderId: folder_id, deletedAt: null }).where(conditions!).returning({ id: inboundEmails.id });
      break;
    }
    case "move_to_trash": {
      const trashFolder = await getFolderBySlug(accountId, "trash");
      affected = await db.update(inboundEmails).set({ folderId: trashFolder.id, deletedAt: new Date() }).where(conditions!).returning({ id: inboundEmails.id });
      break;
    }
    case "permanent_delete":
      affected = await db.delete(inboundEmails).where(conditions!).returning({ id: inboundEmails.id });
      break;
  }

  return { success: true, count: affected.length };
}

export function formatInboxEmailResponse(email: typeof inboundEmails.$inferSelect) {
  return {
    id: email.id,
    from: email.fromAddress,
    from_name: email.fromName,
    to: email.toAddress,
    cc: email.ccAddresses,
    subject: email.subject,
    text_body: email.textBody,
    html_body: email.htmlBody,
    message_id: email.messageId,
    in_reply_to: email.inReplyTo,
    thread_id: email.threadId,
    references: email.references,
    folder_id: email.folderId,
    is_read: email.isRead,
    is_starred: email.isStarred,
    is_archived: email.isArchived,
    has_attachments: email.hasAttachments,
    deleted_at: email.deletedAt?.toISOString() ?? null,
    created_at: email.createdAt.toISOString(),
  };
}
