import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as authService from "../services/auth.service.js";
import * as billingService from "../services/billing.service.js";
import * as usageService from "../services/usage.service.js";
import { ForbiddenError } from "../lib/errors.js";

export default async function billingRoutes(app: FastifyInstance) {
  // Cookie auth for all billing routes
  app.addHook("onRequest", async (request) => {
    try {
      const token = request.cookies.token;
      if (!token) throw new ForbiddenError();
      const decoded = app.jwt.verify<{ id: string; role: string }>(token);
      const account = await authService.getAccountById(decoded.id);
      if (!account) throw new ForbiddenError();
      request.account = account;
    } catch {
      throw new ForbiddenError("Authentication required");
    }
  });

  // GET /billing — current subscription + usage summary
  app.get("/", async (request) => {
    const [subscription, usage] = await Promise.all([
      billingService.getSubscription(request.account.id),
      usageService.getUsageSummary(request.account.id),
    ]);

    return {
      data: {
        subscription: subscription ? billingService.formatSubscriptionResponse(subscription) : null,
        usage,
      },
    };
  });

  // GET /billing/plans — list active plans
  app.get("/plans", async () => {
    const planList = await billingService.listPlans(true);
    return { data: planList.map(billingService.formatPlanResponse) };
  });

  // POST /billing/checkout — create Stripe checkout session
  app.post("/checkout", async (request, reply) => {
    const { plan_id } = z.object({ plan_id: z.string().uuid() }).parse(request.body);
    const result = await billingService.createCheckoutSession(request.account.id, plan_id);
    return reply.status(201).send({ data: result });
  });

  // POST /billing/change-plan — change subscription plan
  app.post("/change-plan", async (request) => {
    const { plan_id } = z.object({ plan_id: z.string().uuid() }).parse(request.body);
    const result = await billingService.changeSubscription(request.account.id, plan_id);
    return { data: result };
  });

  // POST /billing/cancel — cancel subscription at period end
  app.post("/cancel", async (request) => {
    const result = await billingService.cancelSubscription(request.account.id);
    return { data: result };
  });

  // GET /billing/portal — get Stripe customer portal URL
  app.get("/portal", async (request) => {
    const result = await billingService.getPortalUrl(request.account.id);
    return { data: result };
  });
}
