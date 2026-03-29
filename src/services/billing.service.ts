import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { plans, subscriptions, accounts } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getConfig } from "../config/index.js";
import type { CreatePlanInput, UpdatePlanInput } from "../schemas/billing.schema.js";
import type Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const config = getConfig();
  const key = (config as any).STRIPE_SECRET_KEY;
  if (!key) {
    throw new ValidationError("Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.");
  }
  // Dynamic import not needed — stripe is a regular dependency
  const StripeModule = require("stripe");
  _stripe = new StripeModule(key, { apiVersion: "2024-12-18.acacia" });
  return _stripe!;
}

function isStripeConfigured(): boolean {
  const config = getConfig();
  return !!(config as any).STRIPE_SECRET_KEY;
}

// --- Plan CRUD ---

export async function listPlans(activeOnly = true) {
  const db = getDb();
  if (activeOnly) {
    return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.price);
  }
  return db.select().from(plans).orderBy(plans.price);
}

export async function getPlan(planId: string) {
  const db = getDb();
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new NotFoundError("Plan");
  return plan;
}

export async function getDefaultPlan() {
  const db = getDb();
  const [plan] = await db.select().from(plans).where(and(eq(plans.isDefault, true), eq(plans.isActive, true)));
  return plan ?? null;
}

export async function createPlan(input: CreatePlanInput) {
  const db = getDb();
  const [plan] = await db.insert(plans).values({
    name: input.name,
    slug: input.slug,
    stripePriceId: input.stripe_price_id || null,
    monthlyEmailLimit: input.monthly_email_limit ?? null,
    domainsLimit: input.domains_limit,
    apiKeysLimit: input.api_keys_limit,
    templatesLimit: input.templates_limit,
    features: input.features ? JSON.stringify(input.features) : "{}",
    rateLimit: input.rate_limit,
    price: input.price,
    isDefault: input.is_default,
  }).returning();
  return plan;
}

export async function updatePlan(planId: string, input: UpdatePlanInput) {
  const db = getDb();
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.stripe_price_id !== undefined) updateData.stripePriceId = input.stripe_price_id;
  if (input.monthly_email_limit !== undefined) updateData.monthlyEmailLimit = input.monthly_email_limit;
  if (input.domains_limit !== undefined) updateData.domainsLimit = input.domains_limit;
  if (input.api_keys_limit !== undefined) updateData.apiKeysLimit = input.api_keys_limit;
  if (input.templates_limit !== undefined) updateData.templatesLimit = input.templates_limit;
  if (input.features !== undefined) updateData.features = JSON.stringify(input.features);
  if (input.rate_limit !== undefined) updateData.rateLimit = input.rate_limit;
  if (input.price !== undefined) updateData.price = input.price;
  if (input.is_default !== undefined) updateData.isDefault = input.is_default;
  if (input.is_active !== undefined) updateData.isActive = input.is_active;

  const [updated] = await db.update(plans).set(updateData).where(eq(plans.id, planId)).returning();
  if (!updated) throw new NotFoundError("Plan");
  return updated;
}

// --- Subscription Management ---

export async function getSubscription(accountId: string) {
  const db = getDb();
  const [sub] = await db
    .select({
      id: subscriptions.id,
      accountId: subscriptions.accountId,
      planId: subscriptions.planId,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      status: subscriptions.status,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
      planName: plans.name,
      planSlug: plans.slug,
      planPrice: plans.price,
      monthlyEmailLimit: plans.monthlyEmailLimit,
      domainsLimit: plans.domainsLimit,
      apiKeysLimit: plans.apiKeysLimit,
      templatesLimit: plans.templatesLimit,
      features: plans.features,
      rateLimit: plans.rateLimit,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.accountId, accountId));

  return sub ?? null;
}

export async function createCheckoutSession(accountId: string, planId: string) {
  const stripe = getStripe();
  const config = getConfig();
  const db = getDb();

  const plan = await getPlan(planId);
  if (!plan.stripePriceId) {
    throw new ValidationError("This plan does not have a Stripe price configured");
  }

  // Get or create Stripe customer
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new NotFoundError("Account");

  let customerId: string;
  const existingSub = await getSubscription(accountId);

  if (existingSub?.stripeCustomerId) {
    customerId = existingSub.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: account.email,
      name: account.name,
      metadata: { accountId },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${config.BASE_URL}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.BASE_URL}/dashboard/billing`,
    metadata: { accountId, planId },
  });

  return { url: session.url, sessionId: session.id };
}

export async function changeSubscription(accountId: string, newPlanId: string) {
  const stripe = getStripe();
  const db = getDb();

  const sub = await getSubscription(accountId);
  if (!sub?.stripeSubscriptionId) {
    throw new ValidationError("No active subscription to change");
  }

  const newPlan = await getPlan(newPlanId);
  if (!newPlan.stripePriceId) {
    throw new ValidationError("Target plan does not have a Stripe price configured");
  }

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) throw new ValidationError("Could not find subscription item");

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    items: [{ id: itemId, price: newPlan.stripePriceId }],
    proration_behavior: "create_prorations",
  });

  await db.update(subscriptions).set({
    planId: newPlanId,
    updatedAt: new Date(),
  }).where(eq(subscriptions.accountId, accountId));

  return { success: true };
}

export async function cancelSubscription(accountId: string) {
  const stripe = getStripe();
  const db = getDb();

  const sub = await getSubscription(accountId);
  if (!sub?.stripeSubscriptionId) {
    throw new ValidationError("No active subscription to cancel");
  }

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  await db.update(subscriptions).set({
    cancelAtPeriodEnd: true,
    updatedAt: new Date(),
  }).where(eq(subscriptions.accountId, accountId));

  return { success: true };
}

export async function getPortalUrl(accountId: string) {
  const stripe = getStripe();
  const config = getConfig();

  const sub = await getSubscription(accountId);
  if (!sub?.stripeCustomerId) {
    throw new ValidationError("No billing account found. Subscribe to a plan first.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${config.BASE_URL}/dashboard/billing`,
  });

  return { url: session.url };
}

// --- Stripe Webhook Handler ---

export async function handleWebhook(payload: string | Buffer, signature: string) {
  const stripe = getStripe();
  const config = getConfig();
  const webhookSecret = (config as any).STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new ValidationError("Stripe webhook secret not configured");
  }

  const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  const db = getDb();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const accountId = session.metadata?.accountId;
      const planId = session.metadata?.planId;
      if (!accountId || !planId) break;

      const stripeSubscriptionId = session.subscription as string;
      const customerId = session.customer as string;

      // Upsert subscription
      await db.insert(subscriptions).values({
        accountId,
        planId,
        stripeCustomerId: customerId,
        stripeSubscriptionId,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).onConflictDoUpdate({
        target: [subscriptions.accountId],
        set: {
          planId,
          stripeCustomerId: customerId,
          stripeSubscriptionId,
          status: "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        },
      });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as any;
      const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (!subId) break;

      const stripeSub = await stripe.subscriptions.retrieve(subId) as any;
      const periodStart = stripeSub.current_period_start ?? stripeSub.items?.data?.[0]?.current_period_start;
      const periodEnd = stripeSub.current_period_end ?? stripeSub.items?.data?.[0]?.current_period_end;
      await db.update(subscriptions).set({
        status: "active",
        currentPeriodStart: periodStart ? new Date(periodStart * 1000) : new Date(),
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      }).where(eq(subscriptions.stripeSubscriptionId, subId));
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as any;
      const periodStart = sub.current_period_start ?? sub.items?.data?.[0]?.current_period_start;
      const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
      await db.update(subscriptions).set({
        status: sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : sub.status === "trialing" ? "trialing" : "canceled",
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        currentPeriodStart: periodStart ? new Date(periodStart * 1000) : undefined,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
        updatedAt: new Date(),
      }).where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db.update(subscriptions).set({
        status: "canceled",
        updatedAt: new Date(),
      }).where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }
  }

  return { received: true };
}

// --- Formatters ---

export function formatPlanResponse(plan: typeof plans.$inferSelect) {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    stripe_price_id: plan.stripePriceId,
    monthly_email_limit: plan.monthlyEmailLimit,
    domains_limit: plan.domainsLimit,
    api_keys_limit: plan.apiKeysLimit,
    templates_limit: plan.templatesLimit,
    features: typeof plan.features === "string" ? JSON.parse(plan.features) : plan.features ?? {},
    rate_limit: plan.rateLimit,
    price: plan.price,
    is_default: plan.isDefault,
    is_active: plan.isActive,
    created_at: plan.createdAt.toISOString(),
    updated_at: plan.updatedAt.toISOString(),
  };
}

export function formatSubscriptionResponse(sub: any) {
  return {
    id: sub.id,
    plan_id: sub.planId,
    plan_name: sub.planName,
    plan_slug: sub.planSlug,
    plan_price: sub.planPrice,
    status: sub.status,
    monthly_email_limit: sub.monthlyEmailLimit,
    domains_limit: sub.domainsLimit,
    api_keys_limit: sub.apiKeysLimit,
    templates_limit: sub.templatesLimit,
    features: typeof sub.features === "string" ? JSON.parse(sub.features) : sub.features ?? {},
    rate_limit: sub.rateLimit,
    current_period_start: sub.currentPeriodStart?.toISOString() ?? null,
    current_period_end: sub.currentPeriodEnd?.toISOString() ?? null,
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    stripe_configured: isStripeConfigured(),
  };
}
