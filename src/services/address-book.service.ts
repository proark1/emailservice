import { eq, and, or, ilike, sql, desc } from "drizzle-orm";

function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}
import { getDb } from "../db/index.js";
import { addressBookContacts, inboundEmails } from "../db/schema/index.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import type { CreateAddressBookContactInput, UpdateAddressBookContactInput } from "../schemas/address-book.schema.js";

export async function addContact(accountId: string, input: CreateAddressBookContactInput) {
  const db = getDb();
  try {
    const [contact] = await db
      .insert(addressBookContacts)
      .values({
        accountId,
        email: input.email,
        name: input.name,
        company: input.company,
        notes: input.notes,
      })
      .returning();
    return contact;
  } catch (error: any) {
    if (error.code === "23505") {
      throw new ConflictError(`Contact ${input.email} already exists`);
    }
    throw error;
  }
}

export async function listContacts(accountId: string, search?: string) {
  const db = getDb();
  const conditions = [eq(addressBookContacts.accountId, accountId)];
  if (search) {
    const escaped = escapeIlike(search);
    conditions.push(
      or(
        ilike(addressBookContacts.email, `%${escaped}%`),
        ilike(addressBookContacts.name, `%${escaped}%`),
        ilike(addressBookContacts.company, `%${escaped}%`),
      )!,
    );
  }
  return db
    .select()
    .from(addressBookContacts)
    .where(and(...conditions))
    .orderBy(addressBookContacts.name, addressBookContacts.email);
}

export async function getContact(accountId: string, contactId: string) {
  const db = getDb();
  const [contact] = await db
    .select()
    .from(addressBookContacts)
    .where(and(eq(addressBookContacts.id, contactId), eq(addressBookContacts.accountId, accountId)));
  if (!contact) throw new NotFoundError("Contact");
  return contact;
}

export async function updateContact(accountId: string, contactId: string, input: UpdateAddressBookContactInput) {
  const db = getDb();
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.email !== undefined) updateData.email = input.email;
  if (input.name !== undefined) updateData.name = input.name;
  if (input.company !== undefined) updateData.company = input.company;
  if (input.notes !== undefined) updateData.notes = input.notes;

  const [updated] = await db
    .update(addressBookContacts)
    .set(updateData)
    .where(and(eq(addressBookContacts.id, contactId), eq(addressBookContacts.accountId, accountId)))
    .returning();
  if (!updated) throw new NotFoundError("Contact");
  return updated;
}

export async function deleteContact(accountId: string, contactId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(addressBookContacts)
    .where(and(eq(addressBookContacts.id, contactId), eq(addressBookContacts.accountId, accountId)))
    .returning();
  if (!deleted) throw new NotFoundError("Contact");
  return deleted;
}

export async function autocomplete(accountId: string, query: string) {
  const db = getDb();
  const q = `%${escapeIlike(query)}%`;

  // Search address book contacts
  const bookContacts = await db
    .select({
      email: addressBookContacts.email,
      name: addressBookContacts.name,
      source: sql<string>`'address_book'`,
    })
    .from(addressBookContacts)
    .where(
      and(
        eq(addressBookContacts.accountId, accountId),
        or(ilike(addressBookContacts.email, q), ilike(addressBookContacts.name, q)),
      ),
    )
    .limit(10);

  // Also search recent inbound senders
  const recentSenders = await db
    .selectDistinctOn([inboundEmails.fromAddress], {
      email: inboundEmails.fromAddress,
      name: inboundEmails.fromName,
      source: sql<string>`'recent'`,
    })
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.accountId, accountId),
        or(ilike(inboundEmails.fromAddress, q), ilike(inboundEmails.fromName, q)),
      ),
    )
    .orderBy(inboundEmails.fromAddress, desc(inboundEmails.createdAt))
    .limit(5);

  // Merge and deduplicate by email
  const seen = new Set<string>();
  const results: Array<{ email: string; name: string | null; source: string }> = [];
  for (const c of [...bookContacts, ...recentSenders]) {
    if (!seen.has(c.email)) {
      seen.add(c.email);
      results.push(c);
    }
  }
  return results.slice(0, 10);
}

export async function autoLearnContact(accountId: string, email: string, name?: string) {
  const db = getDb();
  try {
    await db
      .insert(addressBookContacts)
      .values({ accountId, email, name: name || null })
      .onConflictDoNothing();
  } catch {
    // Silently ignore - auto-learn is best-effort
  }
}

export function formatAddressBookContactResponse(contact: typeof addressBookContacts.$inferSelect) {
  return {
    id: contact.id,
    email: contact.email,
    name: contact.name,
    company: contact.company,
    notes: contact.notes,
    created_at: contact.createdAt.toISOString(),
    updated_at: contact.updatedAt.toISOString(),
  };
}
