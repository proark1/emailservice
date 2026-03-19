import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains } from "../db/schema/index.js";
import { generateDkimForDomain } from "./dkim.service.js";
import { generateDnsRecords } from "./dns.service.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import type { CreateDomainInput } from "../schemas/domain.schema.js";

export async function createDomain(accountId: string, input: CreateDomainInput) {
  const db = getDb();

  // Check for duplicate
  const existing = await db
    .select()
    .from(domains)
    .where(and(eq(domains.accountId, accountId), eq(domains.name, input.name)));

  if (existing.length > 0) {
    throw new ConflictError(`Domain ${input.name} already exists`);
  }

  // Generate DKIM keys
  const dkim = generateDkimForDomain();

  // Generate DNS records
  const dnsRecords = generateDnsRecords(input.name);

  const [domain] = await db
    .insert(domains)
    .values({
      accountId,
      name: input.name,
      status: "pending",
      spfRecord: dnsRecords.spfRecord,
      dkimSelector: dkim.selector,
      dkimPublicKey: dkim.publicKey,
      dkimPrivateKey: dkim.privateKey,
      dkimDnsValue: dkim.dnsValue,
      dmarcRecord: dnsRecords.dmarcRecord,
    })
    .returning();

  return domain;
}

export async function getDomain(accountId: string, domainId: string) {
  const db = getDb();
  const [domain] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.accountId, accountId)));

  if (!domain) throw new NotFoundError("Domain");
  return domain;
}

export async function listDomains(accountId: string) {
  const db = getDb();
  return db.select().from(domains).where(eq(domains.accountId, accountId));
}

export async function deleteDomain(accountId: string, domainId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(domains)
    .where(and(eq(domains.id, domainId), eq(domains.accountId, accountId)))
    .returning();

  if (!deleted) throw new NotFoundError("Domain");
  return deleted;
}

export async function updateDomainVerification(
  domainId: string,
  update: {
    spfVerified?: boolean;
    dkimVerified?: boolean;
    dmarcVerified?: boolean;
    mxVerified?: boolean;
    status?: "pending" | "verified" | "failed";
  },
) {
  const db = getDb();
  const [updated] = await db
    .update(domains)
    .set({ ...update, lastVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(domains.id, domainId))
    .returning();
  return updated;
}

export function formatDomainResponse(domain: typeof domains.$inferSelect) {
  return {
    id: domain.id,
    name: domain.name,
    status: domain.status,
    records: [
      {
        type: "TXT",
        name: domain.name,
        value: domain.spfRecord || "",
        purpose: "SPF",
        verified: domain.spfVerified,
      },
      {
        type: "TXT",
        name: `${domain.dkimSelector}._domainkey.${domain.name}`,
        value: domain.dkimDnsValue || "",
        purpose: "DKIM",
        verified: domain.dkimVerified,
      },
      {
        type: "TXT",
        name: `_dmarc.${domain.name}`,
        value: domain.dmarcRecord || "",
        purpose: "DMARC",
        verified: domain.dmarcVerified,
      },
      {
        type: "MX",
        name: domain.name,
        value: "10 inbound.emailservice.dev",
        purpose: "Inbound Email",
        verified: domain.mxVerified,
      },
    ],
    created_at: domain.createdAt.toISOString(),
  };
}
