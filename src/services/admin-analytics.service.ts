import { eq, sql, count, gte, desc, isNull, isNotNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  accounts, emails, emailEvents, domains, apiKeys,
  webhooks, webhookDeliveries, audiences, contacts,
  suppressions, emailBatches,
} from "../db/schema/index.js";

export async function getSystemOverview() {
  const db = getDb();

  const [
    [accountCount], [emailCount], [domainCount], [apiKeyCount],
    [webhookCount], [audienceCount], [contactCount], [suppressionCount],
    [batchCount], [inboundCount],
  ] = await Promise.all([
    db.select({ count: count() }).from(accounts),
    db.select({ count: count() }).from(emails),
    db.select({ count: count() }).from(domains),
    db.select({ count: count() }).from(apiKeys),
    db.select({ count: count() }).from(webhooks),
    db.select({ count: count() }).from(audiences),
    db.select({ count: count() }).from(contacts),
    db.select({ count: count() }).from(suppressions),
    db.select({ count: count() }).from(emailBatches),
    db.select({ count: count() }).from(
      (await import("../db/schema/index.js")).inboundEmails
    ),
  ]);

  const emailsByStatus = await db
    .select({ status: emails.status, count: count() })
    .from(emails)
    .groupBy(emails.status);

  const domainsByStatus = await db
    .select({ status: domains.status, count: count() })
    .from(domains)
    .groupBy(domains.status);

  return {
    totals: {
      accounts: Number(accountCount.count),
      emails: Number(emailCount.count),
      domains: Number(domainCount.count),
      api_keys: Number(apiKeyCount.count),
      webhooks: Number(webhookCount.count),
      audiences: Number(audienceCount.count),
      contacts: Number(contactCount.count),
      suppressions: Number(suppressionCount.count),
      batches: Number(batchCount.count),
      inbound_emails: Number(inboundCount.count),
    },
    emails_by_status: Object.fromEntries(emailsByStatus.map((r) => [r.status, Number(r.count)])),
    domains_by_status: Object.fromEntries(domainsByStatus.map((r) => [r.status, Number(r.count)])),
  };
}

export async function getEmailTimeSeries(days: number = 30) {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await db
    .select({
      date: sql<string>`DATE(${emails.createdAt})`.as("date"),
      status: emails.status,
      count: count(),
    })
    .from(emails)
    .where(gte(emails.createdAt, since))
    .groupBy(sql`DATE(${emails.createdAt})`, emails.status)
    .orderBy(sql`DATE(${emails.createdAt})`);

  return rows.map((r) => ({ date: r.date, status: r.status, count: Number(r.count) }));
}

export async function getEventTimeSeries(days: number = 30) {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await db
    .select({
      date: sql<string>`DATE(${emailEvents.createdAt})`.as("date"),
      type: emailEvents.type,
      count: count(),
    })
    .from(emailEvents)
    .where(gte(emailEvents.createdAt, since))
    .groupBy(sql`DATE(${emailEvents.createdAt})`, emailEvents.type)
    .orderBy(sql`DATE(${emailEvents.createdAt})`);

  return rows.map((r) => ({ date: r.date, type: r.type, count: Number(r.count) }));
}

export async function getDeliveryRates() {
  const db = getDb();

  const eventCounts = await db
    .select({ type: emailEvents.type, count: count() })
    .from(emailEvents)
    .groupBy(emailEvents.type);

  const m = new Map(eventCounts.map((e) => [e.type, Number(e.count)]));
  const sent = m.get("sent") || 0;

  return {
    total_sent: sent,
    total_delivered: m.get("delivered") || 0,
    total_bounced: m.get("bounced") || 0,
    total_opened: m.get("opened") || 0,
    total_clicked: m.get("clicked") || 0,
    total_complained: m.get("complained") || 0,
    total_failed: m.get("failed") || 0,
    total_deferred: m.get("deferred") || 0,
    delivery_rate: sent > 0 ? (m.get("delivered") || 0) / sent : 0,
    bounce_rate: sent > 0 ? (m.get("bounced") || 0) / sent : 0,
    open_rate: sent > 0 ? (m.get("opened") || 0) / sent : 0,
    click_rate: sent > 0 ? (m.get("clicked") || 0) / sent : 0,
    complaint_rate: sent > 0 ? (m.get("complained") || 0) / sent : 0,
  };
}

export async function getTopAccounts(limit: number = 10) {
  const db = getDb();

  const rows = await db
    .select({
      accountId: emails.accountId,
      name: accounts.name,
      email: accounts.email,
      emailCount: count(),
    })
    .from(emails)
    .innerJoin(accounts, eq(emails.accountId, accounts.id))
    .groupBy(emails.accountId, accounts.name, accounts.email)
    .orderBy(desc(count()))
    .limit(limit);

  return rows.map((r) => ({
    account_id: r.accountId,
    name: r.name,
    email: r.email,
    email_count: Number(r.emailCount),
  }));
}

export async function getTopDomains(limit: number = 10) {
  const db = getDb();

  const rows = await db
    .select({
      domainId: emails.domainId,
      name: domains.name,
      status: domains.status,
      emailCount: count(),
    })
    .from(emails)
    .innerJoin(domains, eq(emails.domainId, domains.id))
    .groupBy(emails.domainId, domains.name, domains.status)
    .orderBy(desc(count()))
    .limit(limit);

  return rows.map((r) => ({
    domain_id: r.domainId,
    name: r.name,
    status: r.status,
    email_count: Number(r.emailCount),
  }));
}

export async function getWebhookHealth() {
  const db = getDb();

  const rows = await db
    .select({ status: webhookDeliveries.status, count: count() })
    .from(webhookDeliveries)
    .groupBy(webhookDeliveries.status);

  const m = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  const total = Object.values(m).reduce((a, b) => a + b, 0);

  return {
    total,
    success: m.success || 0,
    failed: m.failed || 0,
    exhausted: m.exhausted || 0,
    pending: m.pending || 0,
    success_rate: total > 0 ? (m.success || 0) / total : 0,
  };
}

export async function getSuppressionBreakdown() {
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [byReason, [recentCount]] = await Promise.all([
    db
      .select({ reason: suppressions.reason, count: count() })
      .from(suppressions)
      .groupBy(suppressions.reason),
    db
      .select({ count: count() })
      .from(suppressions)
      .where(gte(suppressions.createdAt, sevenDaysAgo)),
  ]);

  return {
    by_reason: Object.fromEntries(byReason.map((r) => [r.reason, Number(r.count)])),
    total: byReason.reduce((sum, r) => sum + Number(r.count), 0),
    recent_7d: Number(recentCount.count),
  };
}

export async function getRecentActivity(limit: number = 50) {
  const db = getDb();

  const rows = await db
    .select({
      id: emailEvents.id,
      type: emailEvents.type,
      createdAt: emailEvents.createdAt,
      emailId: emailEvents.emailId,
      subject: emails.subject,
      accountName: accounts.name,
    })
    .from(emailEvents)
    .innerJoin(emails, eq(emailEvents.emailId, emails.id))
    .innerJoin(accounts, eq(emailEvents.accountId, accounts.id))
    .orderBy(desc(emailEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    created_at: r.createdAt,
    email_id: r.emailId,
    subject: r.subject,
    account_name: r.accountName,
  }));
}

export async function getApiKeyUsage() {
  const db = getDb();

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
      accountName: accounts.name,
      accountEmail: accounts.email,
    })
    .from(apiKeys)
    .innerJoin(accounts, eq(apiKeys.accountId, accounts.id))
    .orderBy(desc(apiKeys.lastUsedAt));

  const oneDayAgo = new Date(Date.now() - 86_400_000);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    key_prefix: r.keyPrefix,
    last_used_at: r.lastUsedAt,
    revoked_at: r.revokedAt,
    created_at: r.createdAt,
    account_name: r.accountName,
    account_email: r.accountEmail,
    status: r.revokedAt ? "revoked" : (r.lastUsedAt && r.lastUsedAt > oneDayAgo ? "active" : "dormant"),
  }));
}
