import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { inboundAttachments } from "../db/schema/index.js";
import { NotFoundError } from "../lib/errors.js";
import { getConfig } from "../config/index.js";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

function getStorageDir(): string {
  const config = getConfig();
  return (config as any).ATTACHMENT_STORAGE_PATH || path.join(process.cwd(), "data", "attachments");
}

export async function storeInboundAttachment(
  accountId: string,
  inboundEmailId: string,
  attachment: { filename: string; contentType: string; size: number; content: Buffer },
) {
  const storageDir = getStorageDir();
  const dir = path.join(storageDir, accountId);
  fs.mkdirSync(dir, { recursive: true });

  const fileId = randomUUID();
  const ext = path.extname(attachment.filename) || "";
  const storagePath = path.join(accountId, `${fileId}${ext}`);
  const fullPath = path.join(storageDir, storagePath);

  fs.writeFileSync(fullPath, attachment.content);

  const db = getDb();
  const [stored] = await db
    .insert(inboundAttachments)
    .values({
      inboundEmailId,
      accountId,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      storagePath,
    })
    .returning();
  return stored;
}

export async function getAttachment(accountId: string, attachmentId: string) {
  const db = getDb();
  const [attachment] = await db
    .select()
    .from(inboundAttachments)
    .where(and(eq(inboundAttachments.id, attachmentId), eq(inboundAttachments.accountId, accountId)));
  if (!attachment) throw new NotFoundError("Attachment");

  const storageDir = getStorageDir();
  const fullPath = path.join(storageDir, attachment.storagePath);

  return {
    metadata: attachment,
    stream: fs.createReadStream(fullPath),
  };
}

export async function listAttachments(accountId: string, inboundEmailId: string) {
  const db = getDb();
  return db
    .select()
    .from(inboundAttachments)
    .where(
      and(
        eq(inboundAttachments.inboundEmailId, inboundEmailId),
        eq(inboundAttachments.accountId, accountId),
      ),
    );
}

export function formatAttachmentResponse(attachment: typeof inboundAttachments.$inferSelect) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    content_type: attachment.contentType,
    size: attachment.size,
    created_at: attachment.createdAt.toISOString(),
  };
}
