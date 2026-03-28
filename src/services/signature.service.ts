import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emailSignatures } from "../db/schema/index.js";
import { NotFoundError } from "../lib/errors.js";
import type { CreateSignatureInput, UpdateSignatureInput } from "../schemas/signature.schema.js";

export async function createSignature(accountId: string, input: CreateSignatureInput) {
  const db = getDb();

  // If setting as default, unset other defaults first
  if (input.is_default) {
    await db
      .update(emailSignatures)
      .set({ isDefault: false })
      .where(and(eq(emailSignatures.accountId, accountId), eq(emailSignatures.isDefault, true)));
  }

  const [signature] = await db
    .insert(emailSignatures)
    .values({
      accountId,
      name: input.name,
      htmlBody: input.html_body,
      textBody: input.text_body,
      isDefault: input.is_default ?? false,
    })
    .returning();
  return signature;
}

export async function listSignatures(accountId: string) {
  const db = getDb();
  return db.select().from(emailSignatures).where(eq(emailSignatures.accountId, accountId));
}

export async function getSignature(accountId: string, signatureId: string) {
  const db = getDb();
  const [signature] = await db
    .select()
    .from(emailSignatures)
    .where(and(eq(emailSignatures.id, signatureId), eq(emailSignatures.accountId, accountId)));
  if (!signature) throw new NotFoundError("Signature");
  return signature;
}

export async function updateSignature(accountId: string, signatureId: string, input: UpdateSignatureInput) {
  const db = getDb();

  if (input.is_default) {
    await db
      .update(emailSignatures)
      .set({ isDefault: false })
      .where(and(eq(emailSignatures.accountId, accountId), eq(emailSignatures.isDefault, true)));
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.html_body !== undefined) updateData.htmlBody = input.html_body;
  if (input.text_body !== undefined) updateData.textBody = input.text_body;
  if (input.is_default !== undefined) updateData.isDefault = input.is_default;

  const [updated] = await db
    .update(emailSignatures)
    .set(updateData)
    .where(and(eq(emailSignatures.id, signatureId), eq(emailSignatures.accountId, accountId)))
    .returning();
  if (!updated) throw new NotFoundError("Signature");
  return updated;
}

export async function deleteSignature(accountId: string, signatureId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(emailSignatures)
    .where(and(eq(emailSignatures.id, signatureId), eq(emailSignatures.accountId, accountId)))
    .returning();
  if (!deleted) throw new NotFoundError("Signature");
  return deleted;
}

export async function getDefaultSignature(accountId: string) {
  const db = getDb();
  const [signature] = await db
    .select()
    .from(emailSignatures)
    .where(and(eq(emailSignatures.accountId, accountId), eq(emailSignatures.isDefault, true)));
  return signature ?? null;
}

export function formatSignatureResponse(signature: typeof emailSignatures.$inferSelect) {
  return {
    id: signature.id,
    name: signature.name,
    html_body: signature.htmlBody,
    text_body: signature.textBody,
    is_default: signature.isDefault,
    created_at: signature.createdAt.toISOString(),
    updated_at: signature.updatedAt.toISOString(),
  };
}
