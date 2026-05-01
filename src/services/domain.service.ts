import { eq, and, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains, emails, inboundEmails, domainMembers } from "../db/schema/index.js";
import { generateDkimForDomain } from "./dkim.service.js";
import {
  generateDnsRecords,
  generateBimiRecord,
  generateMtaStsTxt,
  generateTlsRptRecord,
} from "./dns.service.js";
import { evictDkimCache } from "./email-sender.js";
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
  const dnsRecords = generateDnsRecords(input.name, { ruaEmail: input.dmarc_rua_email });

  const mode = input.mode || "both";
  const needsSend = mode === "send" || mode === "both";

  const [domain] = await db
    .insert(domains)
    .values({
      accountId,
      name: input.name,
      mode,
      status: "pending",
      spfRecord: needsSend ? dnsRecords.spfRecord : null,
      dkimSelector: needsSend ? dkim.selector : null,
      dkimPublicKey: needsSend ? dkim.publicKey : null,
      dkimPrivateKey: needsSend ? dkim.privateKey : null,
      dkimDnsValue: needsSend ? dkim.dnsValue : null,
      dmarcRecord: needsSend ? dnsRecords.dmarcRecord : null,
      dmarcRuaEmail: input.dmarc_rua_email ?? null,
      returnPathDomain: input.return_path_domain ?? null,
      sendRatePerMinute: input.send_rate_per_minute ?? null,
    })
    .returning();

  // Auto-create owner membership
  await db.insert(domainMembers).values({
    domainId: domain.id,
    accountId,
    role: "owner",
  }).onConflictDoNothing();

  return domain;
}

export async function getDomain(accountId: string, domainId: string) {
  const db = getDb();
  // Verify team access
  const { hasDomainAccess } = await import("./team.service.js");
  const hasAccess = await hasDomainAccess(accountId, domainId);

  const [domain] = await db
    .select()
    .from(domains)
    .where(eq(domains.id, domainId));

  if (!domain || !hasAccess) throw new NotFoundError("Domain");
  return domain;
}

export async function listDomains(accountId: string, filter: { unlinked?: boolean; companyId?: string } = {}) {
  const db = getDb();
  const { getAccessibleDomainIds } = await import("./team.service.js");
  const accessibleIds = await getAccessibleDomainIds(accountId);
  if (accessibleIds.length === 0) return [];

  const conditions = [inArray(domains.id, accessibleIds)];
  if (filter.unlinked) conditions.push(isNull(domains.companyId));
  if (filter.companyId) conditions.push(eq(domains.companyId, filter.companyId));

  return db.select().from(domains).where(and(...conditions));
}

export async function deleteDomain(accountId: string, domainId: string) {
  const db = getDb();

  // Only domain owner can delete
  const { requireDomainRole } = await import("./team.service.js");
  await requireDomainRole(accountId, domainId, "owner");

  const [domain] = await db
    .select()
    .from(domains)
    .where(eq(domains.id, domainId));

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
    .where(eq(domains.id, domainId))
    .returning();

  if (!deleted) throw new NotFoundError("Domain");
  // Drop any cached DKIM key — sends should not pick up the deleted domain.
  evictDkimCache(domainId);
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

/**
 * Patch the deliverability-relevant fields a customer can tune after creation:
 * DMARC aggregate reporting address, Return-Path subdomain, per-domain send cap.
 * Updating `dmarc_rua_email` regenerates the stored DMARC record so the formatter
 * surfaces the new value in the DNS records response.
 */
export async function updateDomain(
  accountId: string,
  domainId: string,
  patch: {
    dmarc_rua_email?: string | null;
    return_path_domain?: string | null;
    send_rate_per_minute?: number | null;
    bimi_logo_url?: string | null;
    bimi_vmc_url?: string | null;
    mta_sts_mode?: "none" | "testing" | "enforce";
    tls_rpt_rua_email?: string | null;
  },
) {
  const db = getDb();
  const { requireDomainRole } = await import("./team.service.js");
  await requireDomainRole(accountId, domainId, "admin");

  const [existing] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!existing) throw new NotFoundError("Domain");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.dmarc_rua_email !== undefined) {
    updates.dmarcRuaEmail = patch.dmarc_rua_email;
    // Regenerate the DMARC string so the stored record matches the new rua target.
    const regenerated = generateDnsRecords(existing.name, { ruaEmail: patch.dmarc_rua_email });
    updates.dmarcRecord = regenerated.dmarcRecord;
    updates.dmarcVerified = false; // force re-verification after DNS change
  }
  if (patch.return_path_domain !== undefined) {
    updates.returnPathDomain = patch.return_path_domain;
    updates.returnPathVerified = false;
  }
  if (patch.send_rate_per_minute !== undefined) {
    updates.sendRatePerMinute = patch.send_rate_per_minute;
  }
  if (patch.bimi_logo_url !== undefined) {
    updates.bimiLogoUrl = patch.bimi_logo_url;
    updates.bimiVerified = false;
  }
  if (patch.bimi_vmc_url !== undefined) {
    updates.bimiVmcUrl = patch.bimi_vmc_url;
    updates.bimiVerified = false;
  }
  if (patch.mta_sts_mode !== undefined) {
    updates.mtaStsMode = patch.mta_sts_mode;
    // Roll the policy id whenever the mode changes — senders need a fresh
    // hint to re-fetch the policy file.
    updates.mtaStsPolicyId = `${Date.now().toString(36)}`;
  }
  if (patch.tls_rpt_rua_email !== undefined) {
    updates.tlsRptRuaEmail = patch.tls_rpt_rua_email;
  }

  const [updated] = await db
    .update(domains)
    .set(updates)
    .where(eq(domains.id, domainId))
    .returning();
  // The DKIM cache snapshots the return-path domain alongside the private
  // key, so we must invalidate when that field changes — otherwise sends
  // will continue to use the old envelope from-address for up to 10 minutes.
  if (patch.return_path_domain !== undefined) {
    evictDkimCache(domainId);
  }
  return updated;
}

export function formatDomainResponse(domain: typeof domains.$inferSelect) {
  const mxHost = getMailHost();
  const isHostConfigured = mxHost !== "your-server-hostname.com";
  const mode = domain.mode || "both";
  const needsSend = mode === "send" || mode === "both";
  const needsReceive = mode === "receive" || mode === "both";

  // Build SPF value — regenerate with current config if the stored one is stale
  const currentSpf = domain.spfRecord && !domain.spfRecord.includes("localhost")
    ? domain.spfRecord
    : (isHostConfigured ? `v=spf1 a mx include:${mxHost} ~all` : `v=spf1 a mx ~all`);

  const records: Array<{ type: string; name: string; value: string; purpose: string; verified: boolean }> = [];

  if (needsSend) {
    records.push(
      {
        type: "TXT",
        name: domain.name,
        value: currentSpf,
        purpose: "SPF (Sending)",
        verified: domain.spfVerified,
      },
      {
        type: "TXT",
        name: `${domain.dkimSelector || "es1"}._domainkey.${domain.name}`,
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
    );
  }

  if (needsReceive) {
    records.push({
      type: "MX",
      name: domain.name,
      value: `10 ${mxHost}`,
      purpose: "MX (Receiving)",
      verified: domain.mxVerified,
    });
  }

  // BIMI: only emit when a logo URL is configured. Eligibility additionally
  // requires DMARC enforcement; the dashboard should warn when bimiLogoUrl
  // is set but DMARC isn't verified yet.
  if ((domain as any).bimiLogoUrl) {
    records.push({
      type: "TXT",
      name: `default._bimi.${domain.name}`,
      value: generateBimiRecord((domain as any).bimiLogoUrl, (domain as any).bimiVmcUrl ?? null),
      purpose: "BIMI (brand logo in inbox)",
      verified: (domain as any).bimiVerified ?? false,
    });
  }

  // MTA-STS: emit the TXT record when the mode is anything other than
  // "none". The policy file is served via HTTPS at the well-known URL —
  // see `routes/well-known.ts`.
  const mtaStsMode = (domain as any).mtaStsMode || "none";
  if (mtaStsMode !== "none") {
    const policyId = (domain as any).mtaStsPolicyId || "1";
    records.push({
      type: "TXT",
      name: `_mta-sts.${domain.name}`,
      value: generateMtaStsTxt(policyId),
      purpose: `MTA-STS (${mtaStsMode})`,
      verified: false,
    });
    records.push({
      type: "CNAME",
      name: `mta-sts.${domain.name}`,
      value: mxHost,
      purpose: "MTA-STS policy host",
      verified: false,
    });
  }

  // TLS-RPT (RFC 8460) — emit when an aggregate-report email is configured.
  if ((domain as any).tlsRptRuaEmail) {
    records.push({
      type: "TXT",
      name: `_smtp._tls.${domain.name}`,
      value: generateTlsRptRecord((domain as any).tlsRptRuaEmail),
      purpose: "TLS-RPT (TLS reporting)",
      verified: false,
    });
  }

  return {
    id: domain.id,
    name: domain.name,
    mode,
    status: domain.status,
    mailHost: mxHost,
    mailHostConfigured: isHostConfigured,
    records,
    provider: (domain as any).dnsProvider || null,
    providerConfigured: !!(domain as any).dnsProviderKey,
    dmarc_rua_email: domain.dmarcRuaEmail ?? null,
    return_path_domain: domain.returnPathDomain ?? null,
    send_rate_per_minute: domain.sendRatePerMinute ?? null,
    bimi_logo_url: (domain as any).bimiLogoUrl ?? null,
    bimi_vmc_url: (domain as any).bimiVmcUrl ?? null,
    bimi_verified: (domain as any).bimiVerified ?? false,
    mta_sts_mode: (domain as any).mtaStsMode ?? "none",
    mta_sts_policy_id: (domain as any).mtaStsPolicyId ?? null,
    tls_rpt_rua_email: (domain as any).tlsRptRuaEmail ?? null,
    created_at: domain.createdAt.toISOString(),
  };
}
