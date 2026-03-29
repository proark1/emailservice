import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domainMembers, domainInvitations, domains, accounts } from "../db/schema/index.js";
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from "../lib/errors.js";
import type { DomainRole } from "../db/schema/domain-members.js";
import type { AddMemberInput, UpdateMemberInput, CreateInvitationInput } from "../schemas/team.schema.js";
import { randomBytes } from "crypto";

const ROLE_HIERARCHY: Record<DomainRole, number> = { owner: 3, admin: 2, member: 1 };

/**
 * Get all domain IDs that an account has access to (as member, admin, or owner).
 * Also includes domains where domains.accountId matches (backward compat).
 */
export async function getAccessibleDomainIds(accountId: string): Promise<string[]> {
  const db = getDb();

  // Get domains via membership
  const memberRows = await db
    .select({ domainId: domainMembers.domainId })
    .from(domainMembers)
    .where(eq(domainMembers.accountId, accountId));

  // Get domains via direct ownership (backward compat)
  const ownedRows = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.accountId, accountId));

  const ids = new Set([
    ...memberRows.map((r) => r.domainId),
    ...ownedRows.map((r) => r.id),
  ]);
  return Array.from(ids);
}

/**
 * Verify that an account has at least the given role on a domain.
 */
export async function requireDomainRole(
  accountId: string,
  domainId: string,
  minRole: DomainRole,
): Promise<typeof domainMembers.$inferSelect> {
  const db = getDb();

  // Check domain_members first
  const [member] = await db
    .select()
    .from(domainMembers)
    .where(and(eq(domainMembers.domainId, domainId), eq(domainMembers.accountId, accountId)));

  if (member) {
    if (ROLE_HIERARCHY[member.role as DomainRole] < ROLE_HIERARCHY[minRole]) {
      throw new ForbiddenError("Insufficient role for this action");
    }
    return member;
  }

  // Fallback: check if account is the domain owner (for domains without member rows yet)
  const [domain] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.accountId, accountId)));

  if (domain) {
    // Auto-create the owner membership row
    const [created] = await db
      .insert(domainMembers)
      .values({ domainId, accountId, role: "owner" })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    // If conflict, fetch the existing row
    const [existing] = await db
      .select()
      .from(domainMembers)
      .where(and(eq(domainMembers.domainId, domainId), eq(domainMembers.accountId, accountId)));
    if (existing) return existing;
  }

  throw new ForbiddenError("You do not have access to this domain");
}

/**
 * Check if account has access to a domain (any role).
 */
export async function hasDomainAccess(accountId: string, domainId: string): Promise<boolean> {
  try {
    await requireDomainRole(accountId, domainId, "member");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the member's mailbox restrictions for a domain. Returns null if unrestricted.
 */
export async function getMemberMailboxes(accountId: string, domainId: string): Promise<string[] | null> {
  const db = getDb();
  const [member] = await db
    .select({ mailboxes: domainMembers.mailboxes, role: domainMembers.role })
    .from(domainMembers)
    .where(and(eq(domainMembers.domainId, domainId), eq(domainMembers.accountId, accountId)));

  if (!member) return null;
  // Owner and admin have unrestricted access
  if (member.role === "owner" || member.role === "admin") return null;
  return (member.mailboxes as string[] | null) ?? null;
}

// --- CRUD ---

export async function listDomainMembers(accountId: string, domainId: string) {
  await requireDomainRole(accountId, domainId, "member");
  const db = getDb();

  const rows = await db
    .select({
      id: domainMembers.id,
      accountId: domainMembers.accountId,
      role: domainMembers.role,
      mailboxes: domainMembers.mailboxes,
      createdAt: domainMembers.createdAt,
      accountName: accounts.name,
      accountEmail: accounts.email,
    })
    .from(domainMembers)
    .innerJoin(accounts, eq(accounts.id, domainMembers.accountId))
    .where(eq(domainMembers.domainId, domainId))
    .orderBy(domainMembers.createdAt);

  return rows;
}

export async function addDomainMember(accountId: string, domainId: string, input: AddMemberInput) {
  await requireDomainRole(accountId, domainId, "admin");
  const db = getDb();

  // Check if user with this email exists
  const [existingAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, input.email));

  if (existingAccount) {
    // Check if already a member
    const [existingMember] = await db
      .select()
      .from(domainMembers)
      .where(and(eq(domainMembers.domainId, domainId), eq(domainMembers.accountId, existingAccount.id)));

    if (existingMember) {
      throw new ConflictError(`${input.email} is already a member of this domain`);
    }

    // Add directly
    const [member] = await db
      .insert(domainMembers)
      .values({
        domainId,
        accountId: existingAccount.id,
        role: input.role,
        mailboxes: input.mailboxes || null,
      })
      .returning();

    return { type: "added" as const, member };
  }

  // User doesn't exist — create an invitation
  const invitation = await createInvitation(accountId, domainId, {
    email: input.email,
    role: input.role,
    mailboxes: input.mailboxes,
  });

  return { type: "invited" as const, invitation };
}

export async function updateDomainMember(
  accountId: string,
  domainId: string,
  memberId: string,
  input: UpdateMemberInput,
) {
  await requireDomainRole(accountId, domainId, "admin");
  const db = getDb();

  const [member] = await db
    .select()
    .from(domainMembers)
    .where(and(eq(domainMembers.id, memberId), eq(domainMembers.domainId, domainId)));

  if (!member) throw new NotFoundError("Member");
  if (member.role === "owner") throw new ValidationError("Cannot modify the domain owner");

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.role !== undefined) updateData.role = input.role;
  if (input.mailboxes !== undefined) updateData.mailboxes = input.mailboxes;

  const [updated] = await db
    .update(domainMembers)
    .set(updateData)
    .where(eq(domainMembers.id, memberId))
    .returning();

  return updated;
}

export async function removeDomainMember(accountId: string, domainId: string, memberId: string) {
  await requireDomainRole(accountId, domainId, "admin");
  const db = getDb();

  const [member] = await db
    .select()
    .from(domainMembers)
    .where(and(eq(domainMembers.id, memberId), eq(domainMembers.domainId, domainId)));

  if (!member) throw new NotFoundError("Member");
  if (member.role === "owner") throw new ValidationError("Cannot remove the domain owner");

  const [deleted] = await db
    .delete(domainMembers)
    .where(eq(domainMembers.id, memberId))
    .returning();

  return deleted;
}

// --- Invitations ---

export async function createInvitation(accountId: string, domainId: string, input: CreateInvitationInput) {
  await requireDomainRole(accountId, domainId, "admin");
  const db = getDb();

  // Check for existing pending invitation
  const [existing] = await db
    .select()
    .from(domainInvitations)
    .where(
      and(
        eq(domainInvitations.domainId, domainId),
        eq(domainInvitations.email, input.email),
        isNull(domainInvitations.acceptedAt),
      ),
    );

  if (existing) {
    throw new ConflictError(`An invitation for ${input.email} is already pending`);
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invitation] = await db
    .insert(domainInvitations)
    .values({
      domainId,
      email: input.email,
      role: input.role,
      mailboxes: input.mailboxes || null,
      invitedBy: accountId,
      token,
      expiresAt,
    })
    .returning();

  return invitation;
}

export async function acceptInvitation(accountId: string, token: string) {
  const db = getDb();

  const [invitation] = await db
    .select()
    .from(domainInvitations)
    .where(eq(domainInvitations.token, token));

  if (!invitation) throw new NotFoundError("Invitation");
  if (invitation.acceptedAt) throw new ValidationError("This invitation has already been accepted");
  if (invitation.expiresAt < new Date()) throw new ValidationError("This invitation has expired");

  // Verify the accepting user's email matches
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new NotFoundError("Account");
  if (account.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new ValidationError("This invitation was sent to a different email address");
  }

  // Create the membership
  try {
    await db.insert(domainMembers).values({
      domainId: invitation.domainId,
      accountId,
      role: invitation.role as DomainRole,
      mailboxes: invitation.mailboxes,
    });
  } catch (error: any) {
    if (error.code === "23505") {
      throw new ConflictError("You are already a member of this domain");
    }
    throw error;
  }

  // Mark invitation as accepted
  await db
    .update(domainInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(domainInvitations.id, invitation.id));

  return invitation;
}

export async function listInvitations(accountId: string, domainId: string) {
  await requireDomainRole(accountId, domainId, "admin");
  const db = getDb();

  return db
    .select()
    .from(domainInvitations)
    .where(
      and(
        eq(domainInvitations.domainId, domainId),
        isNull(domainInvitations.acceptedAt),
      ),
    )
    .orderBy(domainInvitations.createdAt);
}

export async function revokeInvitation(accountId: string, domainId: string, invitationId: string) {
  await requireDomainRole(accountId, domainId, "admin");
  const db = getDb();

  const [deleted] = await db
    .delete(domainInvitations)
    .where(
      and(
        eq(domainInvitations.id, invitationId),
        eq(domainInvitations.domainId, domainId),
      ),
    )
    .returning();

  if (!deleted) throw new NotFoundError("Invitation");
  return deleted;
}

export async function getMyMemberships(accountId: string) {
  const db = getDb();

  const rows = await db
    .select({
      domainId: domainMembers.domainId,
      role: domainMembers.role,
      mailboxes: domainMembers.mailboxes,
      domainName: domains.name,
      domainStatus: domains.status,
    })
    .from(domainMembers)
    .innerJoin(domains, eq(domains.id, domainMembers.domainId))
    .where(eq(domainMembers.accountId, accountId))
    .orderBy(domains.name);

  return rows;
}

// --- Formatters ---

export function formatMemberResponse(row: any) {
  return {
    id: row.id,
    account_id: row.accountId,
    account_name: row.accountName ?? null,
    account_email: row.accountEmail ?? null,
    role: row.role,
    mailboxes: row.mailboxes,
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}

export function formatInvitationResponse(inv: typeof domainInvitations.$inferSelect) {
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    mailboxes: inv.mailboxes,
    token: inv.token,
    expires_at: inv.expiresAt.toISOString(),
    created_at: inv.createdAt.toISOString(),
  };
}
