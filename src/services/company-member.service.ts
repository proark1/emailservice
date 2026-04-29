import { eq, and } from "drizzle-orm";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { getDb } from "../db/index.js";
import { accounts, companies, companyMembers, companyMailboxes, apiKeys, domains } from "../db/schema/index.js";
import { NotFoundError, ConflictError, ValidationError } from "../lib/errors.js";
import type { CompanyRole } from "../db/schema/companies.js";
import type { ProvisionMemberInput, UpdateCompanyMemberInput } from "../schemas/company.schema.js";
import { requireCompanyRole } from "./company.service.js";
import { assignMailbox } from "./company-mailbox.service.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../lib/crypto.js";
import { sendSystemEmail } from "./email-sender.js";
import { getConfig } from "../config/index.js";

export async function provisionMember(
  callerAccountId: string,
  companyId: string,
  input: ProvisionMemberInput,
) {
  await requireCompanyRole(callerAccountId, companyId, "admin");
  const db = getDb();

  const emailLower = input.email.toLowerCase();

  // Slow operations (argon2 hash, key derivation) happen outside the
  // transaction so we don't hold row locks during them.
  const password = input.password ?? randomBytes(18).toString("base64url");
  const generatedPassword: string | null = input.password ? null : password;
  const passwordHashPromise = argon2.hash(password);
  const apiKeyMaterialPromise = input.issue_api_key
    ? (async () => {
        const fullKey = generateApiKey();
        const keyHash = await hashApiKey(fullKey);
        const keyPrefix = getKeyPrefix(fullKey);
        return { fullKey, keyHash, keyPrefix };
      })()
    : Promise.resolve(null);
  const [passwordHash, apiKeyMaterial] = await Promise.all([passwordHashPromise, apiKeyMaterialPromise]);

  // Wrap the account/member/api-key writes in a transaction so a partial
  // failure can't leave an orphaned account or a member without a key.
  // Mailbox assignment stays outside because it goes through a service
  // function with its own auth checks; if it fails, the member exists but
  // has no handle yet — recoverable by re-invoking the mailbox endpoint.
  const txResult = await db.transaction(async (tx) => {
    const [existingAccount] = await tx.select().from(accounts).where(eq(accounts.email, emailLower));

    let account = existingAccount;
    let createdAccount = false;
    if (!account) {
      const [created] = await tx
        .insert(accounts)
        .values({ name: input.name, email: emailLower, passwordHash, role: "user" })
        .returning();
      account = created;
      createdAccount = true;
    }

    const [existingMember] = await tx
      .select()
      .from(companyMembers)
      .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.accountId, account.id)));
    if (existingMember) {
      throw new ConflictError(`${input.email} is already a member of this company`);
    }

    const [member] = await tx
      .insert(companyMembers)
      .values({
        companyId,
        accountId: account.id,
        role: input.role as CompanyRole,
        provisioned: createdAccount ? "true" : "false",
      })
      .returning();

    let issuedKey: { id: string; fullKey: string; prefix: string } | null = null;
    if (apiKeyMaterial) {
      const [apiKey] = await tx
        .insert(apiKeys)
        .values({
          accountId: account.id,
          companyId: null,
          name: input.api_key_name ?? `Provisioned — ${input.name}`,
          keyPrefix: apiKeyMaterial.keyPrefix,
          keyHash: apiKeyMaterial.keyHash,
          permissions: {},
          rateLimit: 60,
        })
        .returning();
      issuedKey = { id: apiKey.id, fullKey: apiKeyMaterial.fullKey, prefix: apiKeyMaterial.keyPrefix };
    }

    return { account, createdAccount, member, issuedKey };
  });

  const { account, createdAccount, member, issuedKey } = txResult;

  // Optional handle assignment — runs outside the tx by design (see comment above)
  let mailbox: typeof companyMailboxes.$inferSelect | null = null;
  if (input.domain_id && input.local_part) {
    mailbox = await assignMailbox(callerAccountId, companyId, {
      accountId: account.id,
      domainId: input.domain_id,
      localPart: input.local_part,
    });
  }

  // Welcome email (fire-and-forget). Skip when caller supplied their own password
  // for an existing account — the account holder already knows their credentials.
  if (createdAccount) {
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    const config = getConfig();
    const loginUrl = `${config.BASE_URL}/login`;
    const credentialLine = generatedPassword
      ? `<p style="color:#4b5563">Your temporary password is <strong>${generatedPassword}</strong>. You'll be asked to change it on first sign-in.</p>`
      : "";
    sendSystemEmail({
      to: emailLower,
      subject: `You've been added to ${company?.name ?? "a company"}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 0">
          <h2 style="color:#1f2937;margin-bottom:16px">Welcome to ${company?.name ?? "your new account"}</h2>
          <p style="color:#4b5563;line-height:1.6">An account has been created for you on MailNowAPI as part of ${company?.name ?? "a company"}.</p>
          ${mailbox ? `<p style="color:#4b5563">Your email handle is <strong>${mailbox.localPart}@${await domainName(db, mailbox.domainId)}</strong>.</p>` : ""}
          ${credentialLine}
          <div style="margin-top:24px">
            <a href="${loginUrl}" style="display:inline-block;padding:10px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:500">Sign in</a>
          </div>
        </div>
      `,
    }).catch(() => {});
  }

  return { account, member, mailbox, issuedKey, generatedPassword };
}

async function domainName(db: ReturnType<typeof getDb>, domainId: string): Promise<string> {
  const [d] = await db.select({ name: domains.name }).from(domains).where(eq(domains.id, domainId));
  return d?.name ?? "";
}

export async function listMembers(callerAccountId: string, companyId: string) {
  await requireCompanyRole(callerAccountId, companyId, "member");
  const db = getDb();
  return db
    .select({
      id: companyMembers.id,
      accountId: companyMembers.accountId,
      role: companyMembers.role,
      provisioned: companyMembers.provisioned,
      accountName: accounts.name,
      accountEmail: accounts.email,
      createdAt: companyMembers.createdAt,
    })
    .from(companyMembers)
    .innerJoin(accounts, eq(accounts.id, companyMembers.accountId))
    .where(eq(companyMembers.companyId, companyId))
    .orderBy(companyMembers.createdAt);
}

export async function getMember(callerAccountId: string, companyId: string, memberId: string) {
  await requireCompanyRole(callerAccountId, companyId, "member");
  const db = getDb();
  const [row] = await db
    .select({
      id: companyMembers.id,
      accountId: companyMembers.accountId,
      role: companyMembers.role,
      provisioned: companyMembers.provisioned,
      accountName: accounts.name,
      accountEmail: accounts.email,
      createdAt: companyMembers.createdAt,
    })
    .from(companyMembers)
    .innerJoin(accounts, eq(accounts.id, companyMembers.accountId))
    .where(and(eq(companyMembers.id, memberId), eq(companyMembers.companyId, companyId)));
  if (!row) throw new NotFoundError("Member");
  return row;
}

export async function updateMember(
  callerAccountId: string,
  companyId: string,
  memberId: string,
  input: UpdateCompanyMemberInput,
) {
  await requireCompanyRole(callerAccountId, companyId, "admin");
  const db = getDb();

  const [member] = await db
    .select()
    .from(companyMembers)
    .where(and(eq(companyMembers.id, memberId), eq(companyMembers.companyId, companyId)));
  if (!member) throw new NotFoundError("Member");
  if (member.role === "owner" && input.role) {
    throw new ValidationError("Cannot demote the company owner");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.role !== undefined) updates.role = input.role;

  const [updated] = await db
    .update(companyMembers)
    .set(updates)
    .where(eq(companyMembers.id, memberId))
    .returning();

  if (input.name !== undefined) {
    await db.update(accounts).set({ name: input.name, updatedAt: new Date() }).where(eq(accounts.id, member.accountId));
  }

  return updated;
}

export async function removeMember(
  callerAccountId: string,
  companyId: string,
  memberId: string,
  { hardDelete = false }: { hardDelete?: boolean } = {},
) {
  await requireCompanyRole(callerAccountId, companyId, "admin");
  const db = getDb();

  const [member] = await db
    .select()
    .from(companyMembers)
    .where(and(eq(companyMembers.id, memberId), eq(companyMembers.companyId, companyId)));
  if (!member) throw new NotFoundError("Member");
  if (member.role === "owner") throw new ValidationError("Cannot remove the company owner");

  // Remove mailbox mappings for this member on this company.
  await db
    .delete(companyMailboxes)
    .where(and(eq(companyMailboxes.companyId, companyId), eq(companyMailboxes.accountId, member.accountId)));

  const [removed] = await db.delete(companyMembers).where(eq(companyMembers.id, memberId)).returning();

  // Only hard-delete the underlying account if it was provisioned by this flow
  // AND the caller explicitly opted in.
  if (hardDelete && member.provisioned === "true") {
    const [otherMemberships] = await db
      .select({ id: companyMembers.id })
      .from(companyMembers)
      .where(eq(companyMembers.accountId, member.accountId))
      .limit(1);
    if (!otherMemberships) {
      await db.delete(accounts).where(eq(accounts.id, member.accountId));
    }
  }

  return removed;
}

export function formatMemberResponse(row: {
  id: string;
  accountId: string;
  role: string;
  provisioned: string;
  accountName: string | null;
  accountEmail: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    account_id: row.accountId,
    account_name: row.accountName,
    account_email: row.accountEmail,
    role: row.role,
    provisioned: row.provisioned === "true",
    created_at: row.createdAt.toISOString(),
  };
}
