import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { companies, companyMembers, domains, apiKeys } from "../db/schema/index.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../lib/errors.js";
import type { CompanyRole } from "../db/schema/companies.js";
import type { CreateCompanyInput, UpdateCompanyInput, CreateCompanyApiKeyInput } from "../schemas/company.schema.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../lib/crypto.js";

const ROLE_HIERARCHY: Record<CompanyRole, number> = { owner: 3, admin: 2, member: 1 };

export async function requireCompanyRole(
  accountId: string,
  companyId: string,
  minRole: CompanyRole,
): Promise<typeof companyMembers.$inferSelect> {
  const db = getDb();
  const [member] = await db
    .select()
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.accountId, accountId)));

  if (!member) throw new ForbiddenError("You do not have access to this company");
  if (ROLE_HIERARCHY[member.role as CompanyRole] < ROLE_HIERARCHY[minRole]) {
    throw new ForbiddenError("Insufficient role for this action");
  }
  return member;
}

export async function createCompany(ownerAccountId: string, input: CreateCompanyInput) {
  const db = getDb();

  const [existing] = await db.select().from(companies).where(eq(companies.slug, input.slug));
  if (existing) throw new ConflictError(`A company with slug "${input.slug}" already exists`);

  const [company] = await db
    .insert(companies)
    .values({ ownerAccountId, name: input.name, slug: input.slug })
    .returning();

  await db.insert(companyMembers).values({
    companyId: company.id,
    accountId: ownerAccountId,
    role: "owner",
    provisioned: "false",
  });

  return company;
}

export async function listCompaniesForAccount(accountId: string) {
  const db = getDb();
  return db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      ownerAccountId: companies.ownerAccountId,
      role: companyMembers.role,
      createdAt: companies.createdAt,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.accountId, accountId))
    .orderBy(companies.createdAt);
}

export async function getCompany(accountId: string, companyId: string) {
  await requireCompanyRole(accountId, companyId, "member");
  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new NotFoundError("Company");
  return company;
}

export async function updateCompany(accountId: string, companyId: string, input: UpdateCompanyInput) {
  await requireCompanyRole(accountId, companyId, "owner");
  const db = getDb();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;

  const [updated] = await db.update(companies).set(updateData).where(eq(companies.id, companyId)).returning();
  if (!updated) throw new NotFoundError("Company");
  return updated;
}

export async function deleteCompany(accountId: string, companyId: string) {
  await requireCompanyRole(accountId, companyId, "owner");
  const db = getDb();
  // Detach domains before delete so cascade on set-null is a no-op rather than FK error.
  await db.update(domains).set({ companyId: null, updatedAt: new Date() }).where(eq(domains.companyId, companyId));
  const [deleted] = await db.delete(companies).where(eq(companies.id, companyId)).returning();
  if (!deleted) throw new NotFoundError("Company");
  return deleted;
}

// --- Domain linkage ---

export async function linkDomainToCompany(accountId: string, companyId: string, domainId: string) {
  await requireCompanyRole(accountId, companyId, "owner");
  const db = getDb();

  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!domain) throw new NotFoundError("Domain");
  if (domain.accountId !== accountId) {
    throw new ForbiddenError("You can only link domains you own to a company");
  }
  if (domain.companyId && domain.companyId !== companyId) {
    throw new ConflictError("Domain is already linked to another company");
  }

  const [updated] = await db
    .update(domains)
    .set({ companyId, updatedAt: new Date() })
    .where(eq(domains.id, domainId))
    .returning();

  return updated;
}

export async function unlinkDomainFromCompany(accountId: string, companyId: string, domainId: string) {
  await requireCompanyRole(accountId, companyId, "owner");
  const db = getDb();
  const [domain] = await db.select().from(domains).where(and(eq(domains.id, domainId), eq(domains.companyId, companyId)));
  if (!domain) throw new NotFoundError("Domain");

  const [updated] = await db
    .update(domains)
    .set({ companyId: null, updatedAt: new Date() })
    .where(eq(domains.id, domainId))
    .returning();
  return updated;
}

export async function listCompanyDomains(accountId: string, companyId: string) {
  await requireCompanyRole(accountId, companyId, "member");
  const db = getDb();
  return db.select().from(domains).where(eq(domains.companyId, companyId)).orderBy(domains.name);
}

// --- Company API keys ---

export async function createCompanyApiKey(accountId: string, companyId: string, input: CreateCompanyApiKeyInput) {
  await requireCompanyRole(accountId, companyId, "owner");
  const db = getDb();

  const fullKey = generateApiKey();
  const keyHash = await hashApiKey(fullKey);
  const keyPrefix = getKeyPrefix(fullKey);

  // Company-scoped keys can provision members/mailboxes and read company data.
  // They cannot send email directly — that requires a member's own key.
  const permissions: Record<string, boolean> = {
    "company:provision": true,
    "company:read": true,
  };

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      accountId,
      companyId,
      name: input.name,
      keyPrefix,
      keyHash,
      permissions,
      rateLimit: input.rate_limit ?? 60,
      expiresAt: input.expires_at ? new Date(input.expires_at) : null,
    })
    .returning();

  return { apiKey, fullKey };
}

export async function listCompanyApiKeys(accountId: string, companyId: string) {
  await requireCompanyRole(accountId, companyId, "admin");
  const db = getDb();
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.companyId, companyId), isNull(apiKeys.revokedAt)))
    .orderBy(apiKeys.createdAt);
}

export async function revokeCompanyApiKey(accountId: string, companyId: string, keyId: string) {
  await requireCompanyRole(accountId, companyId, "owner");
  const db = getDb();
  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.companyId, companyId), isNull(apiKeys.revokedAt)))
    .returning();
  if (!updated) throw new NotFoundError("API key");
  return updated;
}

// --- Formatters ---

export function formatCompanyResponse(c: typeof companies.$inferSelect & { role?: string }) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    owner_account_id: c.ownerAccountId,
    role: (c as any).role,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

export function formatCompanyApiKeyResponse(key: typeof apiKeys.$inferSelect) {
  return {
    id: key.id,
    name: key.name,
    key_prefix: key.keyPrefix,
    permissions: key.permissions,
    rate_limit: key.rateLimit,
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
    expires_at: key.expiresAt?.toISOString() ?? null,
    created_at: key.createdAt.toISOString(),
  };
}
