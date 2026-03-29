import { useState, useEffect } from "react";
import { api, post } from "../../lib/api";
import { PageHeader, useToast } from "../../components/ui";

interface Plan {
  id: string;
  name: string;
  slug: string;
  monthly_email_limit: number | null;
  domains_limit: number | null;
  api_keys_limit: number | null;
  templates_limit: number | null;
  price: number;
  features: Record<string, boolean>;
}

interface UsageSummary {
  plan_name: string;
  plan_slug: string;
  emails: { used: number; limit: number | null };
  api_calls: { used: number };
  domains: { used: number; limit: number | null };
  api_keys: { used: number; limit: number | null };
  templates: { used: number; limit: number | null };
}

interface Subscription {
  id: string;
  plan_name: string;
  plan_slug: string;
  plan_price: number;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_configured: boolean;
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  const isNearLimit = limit ? pct >= 80 : false;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-gray-500 uppercase tracking-wider">{label}</span>
        <span className="text-[13px] font-medium text-gray-700">
          {used.toLocaleString()}{limit ? ` / ${limit.toLocaleString()}` : ""}
        </span>
      </div>
      {limit && (
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isNearLimit ? "bg-amber-500" : "bg-violet-500"}`}
            style={{ width: `${Math.max(pct, 1)}%` }}
          />
        </div>
      )}
      {!limit && <p className="text-[11px] text-gray-400">Unlimited</p>}
    </div>
  );
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const { showError, toast } = useToast();

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api("/dashboard/billing").then((r) => {
        setSubscription(r.data.subscription);
        setUsage(r.data.usage);
      }).catch(() => {}),
      api("/dashboard/billing/plans").then((r) => setPlans(r.data)).catch(() => setPlans([])),
    ]).finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const handleCheckout = async (planId: string) => {
    try {
      const res = await post("/dashboard/billing/checkout", { plan_id: planId });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (e: any) {
      showError(e.message || "Failed to create checkout session");
    }
  };

  const handleCancel = async () => {
    try {
      await post("/dashboard/billing/cancel", {});
      loadData();
    } catch (e: any) {
      showError(e.message || "Failed to cancel subscription");
    }
  };

  const handlePortal = async () => {
    try {
      const res = await api("/dashboard/billing/portal");
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (e: any) {
      showError(e.message || "Failed to open billing portal");
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Billing" desc="Manage your subscription and usage" />
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Billing" desc="Manage your subscription and usage" />
      {toast}

      {/* Current Plan & Usage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Plan Card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <h2 className="text-[14px] font-semibold text-gray-900 mb-4">Current Plan</h2>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold text-gray-900">{usage?.plan_name || "Free"}</span>
            {subscription && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${subscription.status === "active" ? "bg-emerald-50 text-emerald-700" : subscription.status === "past_due" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                {subscription.status}
              </span>
            )}
          </div>
          {subscription?.plan_price != null && subscription.plan_price > 0 && (
            <p className="text-[13px] text-gray-500 mb-2">
              ${(subscription.plan_price / 100).toFixed(2)}/month
            </p>
          )}
          {subscription?.current_period_end && (
            <p className="text-[12px] text-gray-400">
              {subscription.cancel_at_period_end ? "Cancels" : "Renews"} on {new Date(subscription.current_period_end).toLocaleDateString()}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            {subscription?.stripeCustomerId && (
              <button onClick={handlePortal} className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Manage Billing
              </button>
            )}
            {subscription && subscription.status === "active" && !subscription.cancel_at_period_end && (
              <button onClick={handleCancel} className="px-4 py-2 rounded-lg text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors">
                Cancel Plan
              </button>
            )}
          </div>
        </div>

        {/* Usage Card */}
        {usage && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
            <h2 className="text-[14px] font-semibold text-gray-900 mb-4">Current Usage</h2>
            <div className="space-y-4">
              <UsageMeter label="Emails This Month" used={usage.emails.used} limit={usage.emails.limit} />
              <UsageMeter label="Domains" used={usage.domains.used} limit={usage.domains.limit} />
              <UsageMeter label="API Keys" used={usage.api_keys.used} limit={usage.api_keys.limit} />
              <UsageMeter label="Templates" used={usage.templates.used} limit={usage.templates.limit} />
            </div>
          </div>
        )}
      </div>

      {/* Available Plans */}
      {plans.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <h2 className="text-[14px] font-semibold text-gray-900 mb-6">Available Plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = usage?.plan_slug === plan.slug;
              return (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-5 ${isCurrent ? "border-violet-300 bg-violet-50/50" : "border-gray-200"}`}
                >
                  <h3 className="text-[15px] font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {plan.price > 0 ? `$${(plan.price / 100).toFixed(0)}` : "Free"}
                    {plan.price > 0 && <span className="text-[13px] text-gray-400 font-normal">/mo</span>}
                  </p>
                  <ul className="mt-4 space-y-2 text-[13px] text-gray-600">
                    <li>{plan.monthly_email_limit ? `${plan.monthly_email_limit.toLocaleString()} emails/mo` : "Unlimited emails"}</li>
                    <li>{plan.domains_limit ?? "Unlimited"} domains</li>
                    <li>{plan.api_keys_limit ?? "Unlimited"} API keys</li>
                    <li>{plan.templates_limit ?? "Unlimited"} templates</li>
                  </ul>
                  <div className="mt-4">
                    {isCurrent ? (
                      <span className="text-[13px] text-violet-600 font-medium">Current Plan</span>
                    ) : subscription?.stripe_configured !== false ? (
                      <button
                        onClick={() => subscription?.stripeSubscriptionId ? post("/dashboard/billing/change-plan", { plan_id: plan.id }).then(loadData).catch((e: any) => showError(e.message)) : handleCheckout(plan.id)}
                        className="w-full px-4 py-2 rounded-lg bg-violet-600 text-white text-[13px] font-medium hover:bg-violet-700 transition-colors"
                      >
                        {subscription?.stripeSubscriptionId ? "Switch Plan" : "Subscribe"}
                      </button>
                    ) : (
                      <span className="text-[12px] text-gray-400">Stripe not configured</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
