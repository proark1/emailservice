import { eq, and, desc, or, ilike, isNull, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { inboundEmails, domains } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getFolderBySlug } from "./folder.service.js";
import type { ListInboxInput, UpdateInboxEmailInput, BulkActionInput } from "../schemas/inbox.schema.js";

/**
 * Build the inbox read access predicate.
 *
 * A user always sees inbound emails delivered to their own account
 * (inbound-server.ts:resolveMailbox() routes mail at company-delegated
 * domains to the correct member's accountId at ingress, and unrouted /
 * catch-all mail falls back to the domain owner).
 *
 * On top of that they may also see every inbound email on domains they
 * have access to — BUT only for domains that are NOT delegated to a
 * company. Company-delegated domains carry per-member mailboxes and the
 * whole point of that delegation is privacy between members, so the
 * owner / admins of the company must not be able to read other members'
 * inboxes through the team-inbox path. (GDPR: separate data controllers
 * per member account.)
 */
async function buildInboxAccessCondition(accountId: string) {
  const { getAccessibleDomainIds } = await import("./team.service.js");
  const db = getDb();
  const accessibleIds = await getAccessibleDomainIds(accountId);
  if (accessibleIds.length === 0) {
    return eq(inboundEmails.accountId, accountId);
  }
  // Drop any accessible domain that is company-delegated — for those,
  // visibility is strictly per-recipient-account.
  const nonCompanyRows = await db
    .select({ id: domains.id })
    .from(domains)
    .where(and(inArray(domains.id, accessibleIds), isNull(domains.companyId)));
  const shareableIds = nonCompanyRows.map((r) => r.id);
  if (shareableIds.length === 0) {
    return eq(inboundEmails.accountId, accountId);
  }
  return or(eq(inboundEmails.accountId, accountId), inArray(inboundEmails.domainId, shareableIds))!;
}

export async function listInboxEmails(accountId: string, input: ListInboxInput) {
  const db = getDb();

  const accessCondition = await buildInboxAccessCondition(accountId);
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
    conditions.push(
      or(
        ilike(inboundEmails.subject, `%${input.search}%`),
        ilike(inboundEmails.fromAddress, `%${input.search}%`),
        ilike(inboundEmails.fromName, `%${input.search}%`),
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
  const accessCondition = await buildInboxAccessCondition(accountId);

  const [email] = await db
    .select()
    .from(inboundEmails)
    .where(and(eq(inboundEmails.id, emailId), accessCondition));
  if (!email) throw new NotFoundError("Email");
  return email;
}

async function emailAccessCondition(accountId: string, emailId: string) {
  const accessCheck = await buildInboxAccessCondition(accountId);
  return and(eq(inboundEmails.id, emailId), accessCheck);
}

export async function updateInboxEmail(accountId: string, emailId: string, input: UpdateInboxEmailInput) {
  const db = getDb();
  const updateData: Record<string, any> = {};
  if (input.is_read !== undefined) updateData.isRead = input.is_read;
  if (input.is_starred !== undefined) updateData.isStarred = input.is_starred;

  const condition = await emailAccessCondition(accountId, emailId);
  const [updated] = await db.update(inboundEmails).set(updateData).where(condition).returning();
  if (!updated) throw new NotFoundError("Email");
  return updated;
}

export async function moveToFolder(accountId: string, emailId: string, folderId: string) {
  const db = getDb();
  const condition = await emailAccessCondition(accountId, emailId);
  const [updated] = await db.update(inboundEmails).set({ folderId, deletedAt: null }).where(condition).returning();
  if (!updated) throw new NotFoundError("Email");
  return updated;
}

export async function moveToTrash(accountId: string, emailId: string) {
  const trashFolder = await getFolderBySlug(accountId, "trash");
  const db = getDb();
  const condition = await emailAccessCondition(accountId, emailId);
  const [updated] = await db.update(inboundEmails).set({ folderId: trashFolder.id, deletedAt: new Date() }).where(condition).returning();
  if (!updated) throw new NotFoundError("Email");
  return updated;
}

export async function restoreFromTrash(accountId: string, emailId: string) {
  const inboxFolder = await getFolderBySlug(accountId, "inbox");
  const db = getDb();
  const condition = await emailAccessCondition(accountId, emailId);
  const [updated] = await db.update(inboundEmails).set({ folderId: inboxFolder.id, deletedAt: null }).where(condition).returning();
  if (!updated) throw new NotFoundError("Email");
  return updated;
}

export async function permanentDelete(accountId: string, emailId: string) {
  const db = getDb();
  const condition = await emailAccessCondition(accountId, emailId);
  const [deleted] = await db.delete(inboundEmails).where(condition).returning();
  if (!deleted) throw new NotFoundError("Email");
  return deleted;
}

export async function bulkAction(accountId: string, input: BulkActionInput) {
  const db = getDb();
  const { ids, action, folder_id } = input;

  const accessCondition = await buildInboxAccessCondition(accountId);

  const conditions = and(
    inArray(inboundEmails.id, ids),
    accessCondition,
  );

  switch (action) {
    case "mark_read":
      await db.update(inboundEmails).set({ isRead: true }).where(conditions!);
      break;
    case "mark_unread":
      await db.update(inboundEmails).set({ isRead: false }).where(conditions!);
      break;
    case "star":
      await db.update(inboundEmails).set({ isStarred: true }).where(conditions!);
      break;
    case "unstar":
      await db.update(inboundEmails).set({ isStarred: false }).where(conditions!);
      break;
    case "move_to_folder": {
      if (!folder_id) throw new ValidationError("folder_id is required for move_to_folder action");
      await db.update(inboundEmails).set({ folderId: folder_id, deletedAt: null }).where(conditions!);
      break;
    }
    case "move_to_trash": {
      const trashFolder = await getFolderBySlug(accountId, "trash");
      await db.update(inboundEmails).set({ folderId: trashFolder.id, deletedAt: new Date() }).where(conditions!);
      break;
    }
    case "permanent_delete":
      await db.delete(inboundEmails).where(conditions!);
      break;
  }

  return { success: true, count: ids.length };
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
