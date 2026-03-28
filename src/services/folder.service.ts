import { eq, and, sql, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { folders, inboundEmails } from "../db/schema/index.js";
import { NotFoundError, ValidationError, ConflictError } from "../lib/errors.js";
import { SYSTEM_FOLDER_SLUGS } from "../db/schema/folders.js";
import type { CreateFolderInput, UpdateFolderInput } from "../schemas/folder.schema.js";

const SYSTEM_FOLDER_NAMES: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  trash: "Trash",
  spam: "Spam",
  archive: "Archive",
};

export async function ensureSystemFolders(accountId: string) {
  const db = getDb();
  const existing = await db.select().from(folders).where(eq(folders.accountId, accountId));
  if (existing.length > 0) return existing;

  const values = SYSTEM_FOLDER_SLUGS.map((slug, i) => ({
    accountId,
    name: SYSTEM_FOLDER_NAMES[slug],
    slug,
    type: "system" as const,
    position: i,
  }));

  return db.insert(folders).values(values).returning();
}

export async function listFolders(accountId: string) {
  const db = getDb();
  let rows = await db
    .select()
    .from(folders)
    .where(eq(folders.accountId, accountId))
    .orderBy(folders.type, folders.position);

  if (rows.length === 0) {
    rows = await ensureSystemFolders(accountId);
  }
  return rows;
}

export async function createFolder(accountId: string, input: CreateFolderInput) {
  await ensureSystemFolders(accountId);
  const db = getDb();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new ValidationError("Invalid folder name");

  try {
    const [folder] = await db
      .insert(folders)
      .values({
        accountId,
        name: input.name,
        slug,
        type: "custom",
        position: 100,
      })
      .returning();
    return folder;
  } catch (error: any) {
    if (error.code === "23505") {
      throw new ConflictError(`Folder "${input.name}" already exists`);
    }
    throw error;
  }
}

export async function updateFolder(accountId: string, folderId: string, input: UpdateFolderInput) {
  const db = getDb();
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.accountId, accountId)));
  if (!folder) throw new NotFoundError("Folder");
  if (folder.type === "system") throw new ValidationError("Cannot modify system folders");

  const updateData: Record<string, any> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.position !== undefined) updateData.position = input.position;

  const [updated] = await db
    .update(folders)
    .set(updateData)
    .where(and(eq(folders.id, folderId), eq(folders.accountId, accountId)))
    .returning();
  return updated;
}

export async function deleteFolder(accountId: string, folderId: string) {
  const db = getDb();
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.accountId, accountId)));
  if (!folder) throw new NotFoundError("Folder");
  if (folder.type === "system") throw new ValidationError("Cannot delete system folders");

  // Move emails in this folder to inbox
  const inboxFolder = await getFolderBySlug(accountId, "inbox");
  await db
    .update(inboundEmails)
    .set({ folderId: inboxFolder.id })
    .where(and(eq(inboundEmails.folderId, folderId), eq(inboundEmails.accountId, accountId)));

  const [deleted] = await db
    .delete(folders)
    .where(and(eq(folders.id, folderId), eq(folders.accountId, accountId)))
    .returning();
  return deleted;
}

export async function getFolderBySlug(accountId: string, slug: string) {
  const allFolders = await listFolders(accountId);
  const folder = allFolders.find((f) => f.slug === slug);
  if (!folder) throw new NotFoundError("Folder");
  return folder;
}

export async function getUnreadCounts(accountId: string) {
  const db = getDb();
  const allFolders = await listFolders(accountId);
  const inboxFolder = allFolders.find((f) => f.slug === "inbox");

  const rows = await db
    .select({
      folderId: inboundEmails.folderId,
      count: sql<number>`count(*)::int`,
    })
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.accountId, accountId),
        eq(inboundEmails.isRead, false),
        isNull(inboundEmails.deletedAt),
      ),
    )
    .groupBy(inboundEmails.folderId);

  const counts: Record<string, number> = {};
  for (const f of allFolders) {
    counts[f.id] = 0;
  }
  for (const row of rows) {
    if (row.folderId) {
      counts[row.folderId] = row.count;
    } else if (inboxFolder) {
      // NULL folderId emails count as inbox
      counts[inboxFolder.id] = (counts[inboxFolder.id] || 0) + row.count;
    }
  }
  return counts;
}

export function formatFolderResponse(folder: typeof folders.$inferSelect) {
  return {
    id: folder.id,
    name: folder.name,
    slug: folder.slug,
    type: folder.type,
    position: folder.position,
    created_at: folder.createdAt.toISOString(),
  };
}
