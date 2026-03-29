import { eq, and, sql, gte, count } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { usageRecords, plans, subscriptions, domains, apiKeys, templates } from "../db/schema/index.js";
import { ValidationError } from "../lib/errors.js";

export class QuotaExceededError extends ValidationError {
  constructor(resource: string, limit: number) {
    super(`Quota exceeded: you have reached the ${resource} limit of ${limit} for your plan. Please upgrade to continue.`);
    this.name = "QuotaExceededError";
  }
}

export async function getCurrentPlan(accountId: string) {
  const db = getDb();

  // Check if account has a subscription
  const [sub] = await db
    .select({
      planId: subscriptions.planId,
      status: subscriptions.status,
      monthlyEmailLimit: plans.monthlyEmailLimit,
      domainsLimit: plans.domainsLimit,
      apiKeysLimit: plans.apiKeysLimit,
      templatesLimit: plans.templatesLimit,
      rateLimit: plans.rateLimit,
      planName: plans.name,
      planSlug: plans.slug,
      features: plans.features,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.accountId, accountId), eq(subscriptions.status, "active")));

  if (sub) return sub;

  // Fall back to default plan
  const [defaultPlan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.isDefault, true), eq(plans.isActive, true)));

  if (defaultPlan) {
    return {
      planId: defaultPlan.id,
      status: "active" as const,
      monthlyEmailLimit: defaultPlan.monthlyEmailLimit,
      domainsLimit: defaultPlan.domainsLimit,
      apiKeysLimit: defaultPlan.apiKeysLimit,
      templatesLimit: defaultPlan.templatesLimit,
      rateLimit: defaultPlan.rateLimit,
      planName: defaultPlan.name,
      planSlug: defaultPlan.slug,
      features: defaultPlan.features,
    };
  }

  // No plans configured — unlimited (self-hosted default)
  return null;
}

export async function checkQuota(accountId: string, resource: "emails" | "domains" | "templates" | "api_keys") {
  const plan = await getCurrentPlan(accountId);
  if (!plan) return; // No plan system configured — unlimited

  const db = getDb();

  switch (resource) {
    case "emails": {
      if (!plan.monthlyEmailLimit) return; // null = unlimited
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const dateStr = monthStart.toISOString().split("T")[0];

      const result = await db
        .select({ total: sql<number>`COALESCE(SUM(${usageRecords.emailsSent}), 0)` })
        .from(usageRecords)
        .where(and(eq(usageRecords.accountId, accountId), gte(usageRecords.date, dateStr)));

      const used = Number(result[0]?.total ?? 0);
      if (used >= plan.monthlyEmailLimit) {
        throw new QuotaExceededError("monthly emails", plan.monthlyEmailLimit);
      }
      break;
    }

    case "domains": {
      if (!plan.domainsLimit) return;
      const [result] = await db.select({ count: count() }).from(domains).where(eq(domains.accountId, accountId));
      if (Number(result.count) >= plan.domainsLimit) {
        throw new QuotaExceededError("domains", plan.domainsLimit);
      }
      break;
    }

    case "api_keys": {
      if (!plan.apiKeysLimit) return;
      const [result] = await db.select({ count: count() }).from(apiKeys).where(eq(apiKeys.accountId, accountId));
      if (Number(result.count) >= plan.apiKeysLimit) {
        throw new QuotaExceededError("API keys", plan.apiKeysLimit);
      }
      break;
    }

    case "templates": {
      if (!plan.templatesLimit) return;
      const [result] = await db.select({ count: count() }).from(templates).where(eq(templates.accountId, accountId));
      if (Number(result.count) >= plan.templatesLimit) {
        throw new QuotaExceededError("templates", plan.templatesLimit);
      }
      break;
    }
  }
}

export async function incrementUsage(accountId: string, metric: "emailsSent" | "apiCalls", amount = 1) {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  const column = metric === "emailsSent" ? usageRecords.emailsSent : usageRecords.apiCalls;

  await db.insert(usageRecords).values({
    accountId,
    date: today,
    emailsSent: metric === "emailsSent" ? amount : 0,
    apiCalls: metric === "apiCalls" ? amount : 0,
  }).onConflictDoUpdate({
    target: [usageRecords.accountId, usageRecords.date],
    set: {
      [metric === "emailsSent" ? "emailsSent" : "apiCalls"]: sql`${column} + ${amount}`,
    },
  });
}

export async function getUsageSummary(accountId: string) {
  const db = getDb();
  const plan = await getCurrentPlan(accountId);

  // Get current month usage
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const dateStr = monthStart.toISOString().split("T")[0];

  const [usage] = await db
    .select({
      emailsSent: sql<number>`COALESCE(SUM(${usageRecords.emailsSent}), 0)`,
      apiCalls: sql<number>`COALESCE(SUM(${usageRecords.apiCalls}), 0)`,
    })
    .from(usageRecords)
    .where(and(eq(usageRecords.accountId, accountId), gte(usageRecords.date, dateStr)));

  // Count current resources
  const [domainCount] = await db.select({ count: count() }).from(domains).where(eq(domains.accountId, accountId));
  const [apiKeyCount] = await db.select({ count: count() }).from(apiKeys).where(eq(apiKeys.accountId, accountId));
  const [templateCount] = await db.select({ count: count() }).from(templates).where(eq(templates.accountId, accountId));

  return {
    plan_name: plan?.planName ?? "Free",
    plan_slug: plan?.planSlug ?? "free",
    emails: {
      used: Number(usage?.emailsSent ?? 0),
      limit: plan?.monthlyEmailLimit ?? null,
    },
    api_calls: {
      used: Number(usage?.apiCalls ?? 0),
    },
    domains: {
      used: Number(domainCount.count),
      limit: plan?.domainsLimit ?? null,
    },
    api_keys: {
      used: Number(apiKeyCount.count),
      limit: plan?.apiKeysLimit ?? null,
    },
    templates: {
      used: Number(templateCount.count),
      limit: plan?.templatesLimit ?? null,
    },
  };
}
