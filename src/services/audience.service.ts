import { eq, and, gt, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { audiences, contacts } from "../db/schema/index.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import { buildPaginatedResponse, type PaginationParams } from "../lib/pagination.js";
import type { CreateAudienceInput } from "../schemas/audience.schema.js";
import type { CreateContactInput, UpdateContactInput } from "../schemas/contact.schema.js";

// --- Audiences ---

export async function createAudience(accountId: string, input: CreateAudienceInput) {
  const db = getDb();
  const [audience] = await db
    .insert(audiences)
    .values({ accountId, name: input.name })
    .returning();
  return audience;
}

export async function listAudiences(accountId: string) {
  const db = getDb();
  return db.select().from(audiences).where(eq(audiences.accountId, accountId));
}

export async function getAudience(accountId: string, audienceId: string) {
  const db = getDb();
  const [audience] = await db
    .select()
    .from(audiences)
    .where(and(eq(audiences.id, audienceId), eq(audiences.accountId, accountId)));
  if (!audience) throw new NotFoundError("Audience");
  return audience;
}

export async function deleteAudience(accountId: string, audienceId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(audiences)
    .where(and(eq(audiences.id, audienceId), eq(audiences.accountId, accountId)))
    .returning();
  if (!deleted) throw new NotFoundError("Audience");
  return deleted;
}

// --- Contacts ---

export async function createContact(accountId: string, audienceId: string, input: CreateContactInput) {
  await getAudience(accountId, audienceId); // Verify ownership
  const db = getDb();

  try {
    const [contact] = await db
      .insert(contacts)
      .values({
        audienceId,
        email: input.email,
        firstName: input.first_name,
        lastName: input.last_name,
        metadata: (input.metadata || {}) as Record<string, unknown>,
        subscribed: input.subscribed ?? true,
      })
      .returning();
    return contact;
  } catch (error: any) {
    if (error.code === "23505") {
      throw new ConflictError(`Contact ${input.email} already exists in this audience`);
    }
    throw error;
  }
}

export async function listContacts(accountId: string, audienceId: string, pagination: PaginationParams) {
  await getAudience(accountId, audienceId);
  const db = getDb();
  const conditions = pagination.cursor
    ? and(eq(contacts.audienceId, audienceId), gt(contacts.id, pagination.cursor))
    : eq(contacts.audienceId, audienceId);
  const rows = await db
    .select()
    .from(contacts)
    .where(conditions)
    .orderBy(contacts.id)
    .limit(pagination.limit + 1);
  return buildPaginatedResponse(rows, pagination.limit);
}

export async function getContact(accountId: string, audienceId: string, contactId: string) {
  await getAudience(accountId, audienceId);
  const db = getDb();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.audienceId, audienceId)));
  if (!contact) throw new NotFoundError("Contact");
  return contact;
}

export async function updateContact(
  accountId: string,
  audienceId: string,
  contactId: string,
  input: UpdateContactInput,
) {
  await getAudience(accountId, audienceId);
  const db = getDb();

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.first_name !== undefined) updateData.firstName = input.first_name;
  if (input.last_name !== undefined) updateData.lastName = input.last_name;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;
  if (input.subscribed !== undefined) {
    updateData.subscribed = input.subscribed;
    if (!input.subscribed) {
      updateData.unsubscribedAt = new Date();
    } else {
      updateData.unsubscribedAt = null;
    }
  }

  const [updated] = await db
    .update(contacts)
    .set(updateData)
    .where(and(eq(contacts.id, contactId), eq(contacts.audienceId, audienceId)))
    .returning();
  if (!updated) throw new NotFoundError("Contact");
  return updated;
}

export async function deleteContact(accountId: string, audienceId: string, contactId: string) {
  await getAudience(accountId, audienceId);
  const db = getDb();
  const [deleted] = await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.audienceId, audienceId)))
    .returning();
  if (!deleted) throw new NotFoundError("Contact");
  return deleted;
}

// --- Formatters ---

export function formatAudienceResponse(audience: typeof audiences.$inferSelect) {
  return {
    id: audience.id,
    name: audience.name,
    created_at: audience.createdAt.toISOString(),
  };
}

export function formatContactResponse(contact: typeof contacts.$inferSelect) {
  return {
    id: contact.id,
    email: contact.email,
    first_name: contact.firstName,
    last_name: contact.lastName,
    metadata: contact.metadata,
    subscribed: contact.subscribed,
    unsubscribed_at: contact.unsubscribedAt?.toISOString() ?? null,
    created_at: contact.createdAt.toISOString(),
  };
}
