import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains, emails, inboundEmails } from "../db/schema/index.js";
import { generateDkimForDomain } from "./dkim.service.js";
import { generateDnsRecords } from "./dns.service.js";
import { getConfig, getMailHost } from "../config/index.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import type { CreateDomainInput } from "../schemas/domain.schema.js";

export async function createDomain(accountId: string, input: CreateDomainInput) {
  const db = getDb();

  const existing = await db
    .select()
    .from(domains)
    .where(and(eq(domains.accountId, accountId), eq(domains.name, input.name)));

  if (existing.length > 0) {
    throw new ConflictError(`Domain ${input.name} already exists`);
  }

  const dkim = generateDkimForDomain();
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

  // Verify domain exists and belongs to account
  const [domain] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.accountId, accountId)));

  if (!domain) throw new NotFoundError("Domain");

  // Nullify FK references first (handles case where migration hasn't run)
  try {
    await db.update(emails).set({ domainId: null }).where(eq(emails.domainId, domainId));
  } catch {}
  try {
    await db.update(inboundEmails).set({ domainId: null }).where(eq(inboundEmails.domainId, domainId));
  } catch {}

  // Now delete
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
  const mxHost = getMailHost();
  const isHostConfigured = mxHost !== "your-server-hostname.com";

  // Build SPF value — regenerate with current config if the stored one is stale
  const currentSpf = domain.spfRecord && !domain.spfRecord.includes("localhost")
    ? domain.spfRecord
    : (isHostConfigured ? `v=spf1 a mx include:${mxHost} ~all` : `v=spf1 a mx ~all`);

  return {
    id: domain.id,
    name: domain.name,
    status: domain.status,
    mailHost: mxHost,
    mailHostConfigured: isHostConfigured,
    records: [
      {
        type: "TXT",
        name: domain.name,
        value: currentSpf,
        purpose: "SPF (Sending)",
        verified: domain.spfVerified,
      },
      {
        type: "TXT",
        name: `${domain.dkimSelector}._domainkey.${domain.name}`,
        value: domain.dkimDnsValue || "",
        purpose: "DKIM (Sending)",
        verified: domain.dkimVerified,
      },
      {
        type: "TXT",
        name: `_dmarc.${domain.name}`,
        value: domain.dmarcRecord || "",
        purpose: "DMARC (Sending)",
        verified: domain.dmarcVerified,
      },
      {
        type: "MX",
        name: domain.name,
        value: `10 ${mxHost}`,
        purpose: "MX (Receiving)",
        verified: domain.mxVerified,
      },
    ],
    provider: (domain as any).dnsProvider || null,
    providerConfigured: !!(domain as any).dnsProviderKey,
    created_at: domain.createdAt.toISOString(),
  };
}
