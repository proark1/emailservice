import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, patch, del } from "../lib/api";

export default function AdminPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview" | "accounts" | "analytics">("overview");

  // Analytics state
  const [analyticsOverview, setAnalyticsOverview] = useState<any>(null);
  const [deliveryRates, setDeliveryRates] = useState<any>(null);
  const [emailTimeSeries, setEmailTimeSeries] = useState<any[]>([]);
  const [eventTimeSeries, setEventTimeSeries] = useState<any[]>([]);
  const [topAccounts, setTopAccounts] = useState<any[]>([]);
  const [topDomains, setTopDomains] = useState<any[]>([]);
  const [webhookHealth, setWebhookHealth] = useState<any>(null);
  const [suppressionData, setSuppressionData] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [apiKeyUsage, setApiKeyUsage] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    api("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
    api("/admin/accounts").then((r) => setAccounts(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "analytics" || analyticsOverview) return;
    setAnalyticsLoading(true);
    Promise.all([
      api("/admin/analytics/overview").then((r) => setAnalyticsOverview(r.data)),
      api("/admin/analytics/delivery-rates").then((r) => setDeliveryRates(r.data)),
      api("/admin/analytics/emails?days=30").then((r) => setEmailTimeSeries(r.data)),
      api("/admin/analytics/events?days=30").then((r) => setEventTimeSeries(r.data)),
      api("/admin/analytics/top-accounts").then((r) => setTopAccounts(r.data)),
      api("/admin/analytics/top-domains").then((r) => setTopDomains(r.data)),
      api("/admin/analytics/webhooks").then((r) => setWebhookHealth(r.data)),
      api("/admin/analytics/suppressions").then((r) => setSuppressionData(r.data)),
      api("/admin/analytics/activity").then((r) => setRecentActivity(r.data)),
      api("/admin/analytics/api-keys").then((r) => setApiKeyUsage(r.data)),
    ]).catch(() => {}).finally(() => setAnalyticsLoading(false));
  }, [tab]);

  const toggleRole = async (id: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    await patch(`/admin/${id}/role`, { role: newRole });
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, role: newRole } : a));
  };

  const removeAccount = async (id: string) => {
    if (!confirm("Delete this account and all its data? This cannot be undone.")) return;
    await del(`/admin/${id}`);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const statCards = stats ? [
    { label: "Accounts", value: stats.accounts, color: "from-violet-500 to-indigo-500" },
    { label: "Domains", value: stats.domains, color: "from-cyan-500 to-blue-500" },
    { label: "Emails", value: stats.emails, color: "from-emerald-500 to-green-500" },
    { label: "API Keys", value: stats.api_keys, color: "from-amber-500 to-orange-500" },
    { label: "Webhooks", value: stats.webhooks, color: "from-pink-500 to-rose-500" },
  ] : [];

  return (
    <div className="min-h-screen bg-[#09090b] antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              </div>
              <span className="font-semibold text-[14px] text-white tracking-tight">MailStride</span>
            </Link>
            <span className="px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-400 text-[11px] font-semibold border border-amber-400/10">ADMIN</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-[13px] text-zinc-500 hover:text-white transition-colors">Dashboard</Link>
            <button onClick={async () => { await logout(); navigate("/"); }} className="text-[13px] text-zinc-500 hover:text-white transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] inline-flex mb-8">
          {[
            { key: "overview" as const, label: "System Overview" },
            { key: "analytics" as const, label: "Analytics" },
            { key: "accounts" as const, label: `Accounts (${accounts.length})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
                tab === t.key ? "bg-white/[0.08] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && stats && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">System Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {statCards.map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <p className="text-[12px] text-zinc-500 uppercase tracking-wider mb-2">{s.label}</p>
                  <p className={`text-3xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics */}
        {tab === "analytics" && (
          <div className="space-y-6">
            {analyticsLoading && <p className="text-zinc-500 text-[13px]">Loading analytics...</p>}

            {/* Key Metrics */}
            {deliveryRates && analyticsOverview && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Key Metrics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Total Emails", value: analyticsOverview.totals.emails.toLocaleString(), color: "from-violet-500 to-indigo-500" },
                    { label: "Delivery Rate", value: `${(deliveryRates.delivery_rate * 100).toFixed(1)}%`, color: "from-emerald-500 to-green-500" },
                    { label: "Open Rate", value: `${(deliveryRates.open_rate * 100).toFixed(1)}%`, color: "from-cyan-500 to-blue-500" },
                    { label: "Click Rate", value: `${(deliveryRates.click_rate * 100).toFixed(1)}%`, color: "from-blue-500 to-indigo-500" },
                    { label: "Bounce Rate", value: `${(deliveryRates.bounce_rate * 100).toFixed(1)}%`, color: "from-amber-500 to-orange-500" },
                    { label: "Complaint Rate", value: `${(deliveryRates.complaint_rate * 100).toFixed(1)}%`, color: "from-red-500 to-rose-500" },
                    { label: "Accounts", value: analyticsOverview.totals.accounts.toLocaleString(), color: "from-pink-500 to-rose-500" },
                    { label: "Active Domains", value: (analyticsOverview.domains_by_status?.verified || 0).toLocaleString(), color: "from-teal-500 to-cyan-500" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                      <p className="text-[12px] text-zinc-500 uppercase tracking-wider mb-2">{s.label}</p>
                      <p className={`text-2xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email Status Breakdown */}
            {analyticsOverview && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Email Status Breakdown</h2>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <div className="grid grid-cols-3 md:grid-cols-7 divide-x divide-white/[0.04]">
                    {Object.entries(analyticsOverview.emails_by_status || {}).map(([status, cnt]) => (
                      <div key={status} className="p-4 text-center">
                        <p className="text-[11px] text-zinc-500 uppercase mb-1">{status}</p>
                        <p className="text-xl font-bold text-white">{(cnt as number).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Email Volume (last 30 days) */}
            {emailTimeSeries.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Email Volume (Last 30 Days)</h2>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Date</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Queued</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Sent</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Delivered</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Bounced</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Failed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {(() => {
                        const byDate = new Map<string, Record<string, number>>();
                        emailTimeSeries.forEach((r: any) => {
                          if (!byDate.has(r.date)) byDate.set(r.date, {});
                          byDate.get(r.date)![r.status] = r.count;
                        });
                        return Array.from(byDate.entries()).reverse().slice(0, 30).map(([date, statuses]) => (
                          <tr key={date} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2 text-[13px] text-zinc-300 font-mono">{date}</td>
                            <td className="px-4 py-2 text-[13px] text-zinc-400 text-right">{statuses.queued || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-emerald-400 text-right">{statuses.sent || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-green-400 text-right">{statuses.delivered || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-amber-400 text-right">{statuses.bounced || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-red-400 text-right">{statuses.failed || 0}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Event Volume (last 30 days) */}
            {eventTimeSeries.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Event Volume (Last 30 Days)</h2>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Date</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Sent</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Delivered</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Opened</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Clicked</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Bounced</th>
                        <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Complained</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {(() => {
                        const byDate = new Map<string, Record<string, number>>();
                        eventTimeSeries.forEach((r: any) => {
                          if (!byDate.has(r.date)) byDate.set(r.date, {});
                          byDate.get(r.date)![r.type] = r.count;
                        });
                        return Array.from(byDate.entries()).reverse().slice(0, 30).map(([date, types]) => (
                          <tr key={date} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2 text-[13px] text-zinc-300 font-mono">{date}</td>
                            <td className="px-4 py-2 text-[13px] text-emerald-400 text-right">{types.sent || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-green-400 text-right">{types.delivered || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-blue-400 text-right">{types.opened || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-cyan-400 text-right">{types.clicked || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-amber-400 text-right">{types.bounced || 0}</td>
                            <td className="px-4 py-2 text-[13px] text-red-400 text-right">{types.complained || 0}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top Accounts & Top Domains side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topAccounts.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Top Accounts</h2>
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Account</th>
                          <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Emails</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {topAccounts.map((a: any) => (
                          <tr key={a.account_id} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2">
                              <p className="text-[13px] text-white">{a.name}</p>
                              <p className="text-[11px] text-zinc-600">{a.email}</p>
                            </td>
                            <td className="px-4 py-2 text-[13px] text-zinc-300 text-right font-mono">{a.email_count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {topDomains.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Top Domains</h2>
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Domain</th>
                          <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Status</th>
                          <th className="text-right px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Emails</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {topDomains.map((d: any) => (
                          <tr key={d.domain_id} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2 text-[13px] text-white font-mono">{d.name}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                                d.status === "verified" ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/10"
                                : d.status === "failed" ? "bg-red-400/10 text-red-400 border-red-400/10"
                                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/10"
                              }`}>{d.status}</span>
                            </td>
                            <td className="px-4 py-2 text-[13px] text-zinc-300 text-right font-mono">{d.email_count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Webhook Health & Suppressions side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {webhookHealth && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Webhook Health</h2>
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-zinc-500">Total Deliveries</span>
                      <span className="text-white font-mono">{webhookHealth.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-zinc-500">Success Rate</span>
                      <span className="text-emerald-400 font-mono">{(webhookHealth.success_rate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-px bg-white/[0.06]" />
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Success", value: webhookHealth.success, color: "text-emerald-400" },
                        { label: "Failed", value: webhookHealth.failed, color: "text-amber-400" },
                        { label: "Exhausted", value: webhookHealth.exhausted, color: "text-red-400" },
                        { label: "Pending", value: webhookHealth.pending, color: "text-zinc-400" },
                      ].map((s) => (
                        <div key={s.label}>
                          <p className="text-[11px] text-zinc-500 mb-1">{s.label}</p>
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {suppressionData && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Suppressions</h2>
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-zinc-500">Total Suppressions</span>
                      <span className="text-white font-mono">{suppressionData.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-zinc-500">Last 7 Days</span>
                      <span className="text-amber-400 font-mono">+{suppressionData.recent_7d}</span>
                    </div>
                    <div className="h-px bg-white/[0.06]" />
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Bounce", value: suppressionData.by_reason.bounce || 0, color: "text-amber-400" },
                        { label: "Complaint", value: suppressionData.by_reason.complaint || 0, color: "text-red-400" },
                        { label: "Unsub", value: suppressionData.by_reason.unsubscribe || 0, color: "text-blue-400" },
                        { label: "Manual", value: suppressionData.by_reason.manual || 0, color: "text-zinc-400" },
                      ].map((s) => (
                        <div key={s.label}>
                          <p className="text-[11px] text-zinc-500 mb-1">{s.label}</p>
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Time</th>
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Event</th>
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Account</th>
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Subject</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {recentActivity.map((e: any) => {
                        const eventColors: Record<string, string> = {
                          sent: "text-emerald-400 bg-emerald-400/10 border-emerald-400/10",
                          delivered: "text-green-400 bg-green-400/10 border-green-400/10",
                          opened: "text-blue-400 bg-blue-400/10 border-blue-400/10",
                          clicked: "text-cyan-400 bg-cyan-400/10 border-cyan-400/10",
                          bounced: "text-amber-400 bg-amber-400/10 border-amber-400/10",
                          failed: "text-red-400 bg-red-400/10 border-red-400/10",
                          complained: "text-rose-400 bg-rose-400/10 border-rose-400/10",
                          queued: "text-zinc-400 bg-zinc-400/10 border-zinc-400/10",
                        };
                        return (
                          <tr key={e.id} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2 text-[12px] text-zinc-500 font-mono whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${eventColors[e.type] || "text-zinc-400 bg-zinc-400/10 border-zinc-400/10"}`}>{e.type}</span>
                            </td>
                            <td className="px-4 py-2 text-[13px] text-zinc-400">{e.account_name}</td>
                            <td className="px-4 py-2 text-[13px] text-zinc-300 truncate max-w-[200px]">{e.subject}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* API Key Usage */}
            {apiKeyUsage.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">API Key Usage</h2>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Key</th>
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Account</th>
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Last Used</th>
                        <th className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {apiKeyUsage.map((k: any) => (
                        <tr key={k.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2">
                            <p className="text-[13px] text-white">{k.name}</p>
                            <p className="text-[11px] text-zinc-600 font-mono">{k.key_prefix}...</p>
                          </td>
                          <td className="px-4 py-2">
                            <p className="text-[13px] text-zinc-400">{k.account_name}</p>
                          </td>
                          <td className="px-4 py-2 text-[12px] text-zinc-500 font-mono">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              k.status === "active" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/10"
                              : k.status === "revoked" ? "text-red-400 bg-red-400/10 border-red-400/10"
                              : "text-zinc-400 bg-zinc-400/10 border-zinc-400/10"
                            }`}>{k.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!analyticsLoading && !analyticsOverview && (
              <div className="text-center py-12">
                <p className="text-zinc-500 text-[13px]">No analytics data available yet. Start sending emails to see metrics.</p>
              </div>
            )}
          </div>
        )}

        {/* Accounts */}
        {tab === "accounts" && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">All Accounts</h2>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 text-[12px] font-medium text-zinc-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-4 py-3 text-[12px] font-medium text-zinc-500 uppercase tracking-wider">Role</th>
                    <th className="text-left px-4 py-3 text-[12px] font-medium text-zinc-500 uppercase tracking-wider">Joined</th>
                    <th className="text-right px-4 py-3 text-[12px] font-medium text-zinc-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-white/[0.06] flex items-center justify-center text-[12px] font-semibold text-violet-300">
                            {a.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="text-[13px] text-white font-medium">{a.name}</p>
                            <p className="text-[11px] text-zinc-600">{a.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                          a.role === "admin"
                            ? "bg-amber-400/10 text-amber-400 border-amber-400/10"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/10"
                        }`}>{a.role}</span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-zinc-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleRole(a.id, a.role)}
                            disabled={a.id === user?.id}
                            className="px-2.5 py-1.5 text-[12px] text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {a.role === "admin" ? "Demote" : "Promote"}
                          </button>
                          {a.id !== user?.id && (
                            <button
                              onClick={() => removeAccount(a.id)}
                              className="px-2.5 py-1.5 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-500/[0.06] rounded-lg transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
