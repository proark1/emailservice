import { useState, useEffect } from "react";
import { Link, Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, post, patch, del } from "../lib/api";
import { useConfirmDialog } from "../components/ui";
import { useToast } from "../components/Toast";

// ---- Sidebar nav items ----
const adminNav = [
  { to: "/admin", label: "Overview", end: true, icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
  { to: "/admin/analytics", label: "Analytics", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg> },
  { to: "/admin/accounts", label: "Accounts", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> },
  { to: "/admin/api-usage", label: "API Usage", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> },
  { to: "/admin/api-logs", label: "API Logs", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg> },
  { to: "/admin/warmups", label: "Warmups", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /></svg> },
];

function AdminSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onToggle} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[240px] shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-screen transform transition-transform duration-200 lg:relative lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-4 h-14 flex items-center border-b border-gray-200 gap-2">
          <Link to="/admin" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
            <span className="font-semibold text-[14px] text-gray-900 tracking-tight">Admin</span>
          </Link>
          <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[10px] font-semibold border border-amber-200">ADMIN</span>
          <button onClick={onToggle} className="ml-auto p-1 rounded-lg text-gray-500 hover:text-gray-900 lg:hidden"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {adminNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={onToggle} className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? "bg-amber-50 text-amber-700" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
              {item.icon}{item.label}
            </NavLink>
          ))}
          <div className="pt-3 pb-1 px-2.5"><div className="border-t border-gray-200" /></div>
          <NavLink to="/dashboard" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-violet-600 hover:text-violet-600 hover:bg-violet-50 transition-colors">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
            Back to Dashboard
          </NavLink>
        </nav>
        <div className="px-2.5 py-3 border-t border-gray-200">
          <div className="px-2.5 mb-2"><p className="text-[13px] text-gray-900 font-medium truncate">{user?.name}</p><p className="text-[11px] text-gray-400 truncate">{user?.email}</p></div>
          <button onClick={async () => { await logout(); navigate("/"); }} className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

// ---- Overview ----
function AdminOverview() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/admin/stats")
      .then((r) => setStats(r.data))
      .catch((e) => setError(e.message || "Failed to load stats"))
      .finally(() => setLoading(false));
  }, []);
  const cards = stats ? [
    { label: "Accounts", value: stats.accounts, color: "from-violet-500 to-indigo-500" },
    { label: "Domains", value: stats.domains, color: "from-cyan-500 to-blue-500" },
    { label: "Emails Sent", value: stats.emails, color: "from-emerald-500 to-green-500" },
    { label: "API Keys", value: stats.api_keys, color: "from-amber-500 to-orange-500" },
    { label: "Webhooks", value: stats.webhooks, color: "from-pink-500 to-rose-500" },
  ] : [];
  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>;
  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-semibold text-gray-900 tracking-tight">System Overview</h1><p className="text-sm text-gray-500 mt-1">Platform health at a glance</p></div>
      {stats && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{cards.map((s) => (
        <div key={s.label} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <p className="text-[12px] text-gray-500 uppercase tracking-wider mb-2">{s.label}</p>
          <p className={`text-3xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value?.toLocaleString()}</p>
        </div>
      ))}</div>}
    </div>
  );
}

// ---- Analytics ----
function AdminAnalytics() {
  const [overview, setOverview] = useState<any>(null);
  const [rates, setRates] = useState<any>(null);
  const [emailTS, setEmailTS] = useState<any[]>([]);
  const [eventTS, setEventTS] = useState<any[]>([]);
  const [topAccounts, setTopAccounts] = useState<any[]>([]);
  const [topDomains, setTopDomains] = useState<any[]>([]);
  const [webhookHealth, setWebhookHealth] = useState<any>(null);
  const [suppressions, setSuppressions] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Use allSettled so one failing endpoint doesn't blank the entire page
    Promise.allSettled([
      api("/admin/analytics/overview").then((r) => setOverview(r.data)),
      api("/admin/analytics/delivery-rates").then((r) => setRates(r.data)),
      api("/admin/analytics/emails?days=30").then((r) => setEmailTS(r.data)),
      api("/admin/analytics/events?days=30").then((r) => setEventTS(r.data)),
      api("/admin/analytics/top-accounts").then((r) => setTopAccounts(r.data)),
      api("/admin/analytics/top-domains").then((r) => setTopDomains(r.data)),
      api("/admin/analytics/webhooks").then((r) => setWebhookHealth(r.data)),
      api("/admin/analytics/suppressions").then((r) => setSuppressions(r.data)),
      api("/admin/analytics/activity").then((r) => setActivity(r.data)),
    ]).then((results) => {
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length === results.length) setError("Failed to load analytics. Check admin access.");
    }).finally(() => setLoading(false));
  }, []);

  const eventColors: Record<string, string> = { sent: "text-emerald-600 bg-emerald-50 border-emerald-200", delivered: "text-green-600 bg-green-50 border-green-200", opened: "text-blue-600 bg-blue-50 border-blue-200", clicked: "text-cyan-600 bg-cyan-50 border-cyan-200", bounced: "text-amber-600 bg-amber-50 border-amber-200", failed: "text-red-600 bg-rose-50 border-rose-200", complained: "text-rose-600 bg-rose-50 border-rose-200" };

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-semibold text-gray-900 tracking-tight">Analytics</h1><p className="text-sm text-gray-500 mt-1">Email delivery metrics and platform activity</p></div>

      {/* Key Metrics */}
      {rates && overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Emails", value: overview.totals?.emails?.toLocaleString() || "0" },
            { label: "Delivery Rate", value: `${(rates.delivery_rate * 100).toFixed(1)}%` },
            { label: "Open Rate", value: `${(rates.open_rate * 100).toFixed(1)}%` },
            { label: "Click Rate", value: `${(rates.click_rate * 100).toFixed(1)}%` },
            { label: "Bounce Rate", value: `${(rates.bounce_rate * 100).toFixed(1)}%` },
            { label: "Complaint Rate", value: `${(rates.complaint_rate * 100).toFixed(1)}%` },
            { label: "Accounts", value: overview.totals?.accounts?.toLocaleString() || "0" },
            { label: "Verified Domains", value: (overview.domains_by_status?.verified || 0).toLocaleString() },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Email Status Breakdown */}
      {overview && overview.emails_by_status && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-[14px] font-semibold text-gray-900">Email Status Breakdown</h3></div>
          <div className="grid grid-cols-3 md:grid-cols-7 divide-x divide-gray-100">
            {Object.entries(overview.emails_by_status).map(([status, cnt]) => (
              <div key={status} className="p-4 text-center">
                <p className="text-[11px] text-gray-500 uppercase mb-1">{status}</p>
                <p className="text-xl font-bold text-gray-900">{(cnt as number).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Volume */}
      {emailTS.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-[14px] font-semibold text-gray-900">Email Volume (30 Days)</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200"><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Date</th><th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Queued</th><th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Sent</th><th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Delivered</th><th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Bounced</th><th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Failed</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{(() => { const m = new Map<string, Record<string, number>>(); emailTS.forEach((r: any) => { if (!m.has(r.date)) m.set(r.date, {}); m.get(r.date)![r.status] = r.count; }); return Array.from(m.entries()).reverse().slice(0, 30).map(([d, s]) => (<tr key={d} className="hover:bg-gray-50"><td className="px-4 py-2 text-[13px] text-gray-600 font-mono">{d}</td><td className="px-4 py-2 text-[13px] text-gray-500 text-right">{s.queued||0}</td><td className="px-4 py-2 text-[13px] text-emerald-600 text-right">{s.sent||0}</td><td className="px-4 py-2 text-[13px] text-green-600 text-right">{s.delivered||0}</td><td className="px-4 py-2 text-[13px] text-amber-600 text-right">{s.bounced||0}</td><td className="px-4 py-2 text-[13px] text-red-600 text-right">{s.failed||0}</td></tr>)); })()}</tbody></table></div>
        </div>
      )}

      {/* Top Accounts & Domains */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topAccounts.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-[14px] font-semibold text-gray-900">Top Accounts</h3></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200"><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Account</th><th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Emails</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{topAccounts.map((a: any) => (<tr key={a.account_id} className="hover:bg-gray-50"><td className="px-4 py-2"><p className="text-[13px] text-gray-900">{a.name}</p><p className="text-[11px] text-gray-400">{a.email}</p></td><td className="px-4 py-2 text-[13px] text-gray-600 text-right font-mono">{a.email_count?.toLocaleString()}</td></tr>))}</tbody></table></div>
          </div>
        )}
        {topDomains.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-[14px] font-semibold text-gray-900">Top Domains</h3></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200"><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Domain</th><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Status</th><th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Emails</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{topDomains.map((d: any) => (<tr key={d.domain_id} className="hover:bg-gray-50"><td className="px-4 py-2 text-[13px] text-gray-900 font-mono">{d.name}</td><td className="px-4 py-2"><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${d.status === "verified" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>{d.status}</span></td><td className="px-4 py-2 text-[13px] text-gray-600 text-right font-mono">{d.email_count?.toLocaleString()}</td></tr>))}</tbody></table></div>
          </div>
        )}
      </div>

      {/* Webhook Health & Suppressions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {webhookHealth && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
            <h3 className="text-[14px] font-semibold text-gray-900">Webhook Health</h3>
            <div className="flex justify-between text-[13px]"><span className="text-gray-500">Total Deliveries</span><span className="text-gray-900 font-mono">{webhookHealth.total?.toLocaleString()}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-gray-500">Success Rate</span><span className="text-emerald-600 font-mono">{(webhookHealth.success_rate * 100).toFixed(1)}%</span></div>
            <div className="h-px bg-gray-200" />
            <div className="grid grid-cols-4 gap-2 text-center">{[{ l: "Success", v: webhookHealth.success, c: "text-emerald-600" }, { l: "Failed", v: webhookHealth.failed, c: "text-amber-600" }, { l: "Exhausted", v: webhookHealth.exhausted, c: "text-red-600" }, { l: "Pending", v: webhookHealth.pending, c: "text-gray-500" }].map((s) => (<div key={s.l}><p className="text-[11px] text-gray-500 mb-1">{s.l}</p><p className={`text-lg font-bold ${s.c}`}>{s.v}</p></div>))}</div>
          </div>
        )}
        {suppressions && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
            <h3 className="text-[14px] font-semibold text-gray-900">Suppressions</h3>
            <div className="flex justify-between text-[13px]"><span className="text-gray-500">Total</span><span className="text-gray-900 font-mono">{suppressions.total?.toLocaleString()}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-gray-500">Last 7 Days</span><span className="text-amber-600 font-mono">+{suppressions.recent_7d}</span></div>
            <div className="h-px bg-gray-200" />
            <div className="grid grid-cols-4 gap-2 text-center">{[{ l: "Bounce", v: suppressions.by_reason?.bounce||0, c: "text-amber-600" }, { l: "Complaint", v: suppressions.by_reason?.complaint||0, c: "text-red-600" }, { l: "Unsub", v: suppressions.by_reason?.unsubscribe||0, c: "text-blue-600" }, { l: "Manual", v: suppressions.by_reason?.manual||0, c: "text-gray-500" }].map((s) => (<div key={s.l}><p className="text-[11px] text-gray-500 mb-1">{s.l}</p><p className={`text-lg font-bold ${s.c}`}>{s.v}</p></div>))}</div>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {activity.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-[14px] font-semibold text-gray-900">Recent Activity</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200"><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Time</th><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Event</th><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Account</th><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Subject</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{activity.map((e: any) => (<tr key={e.id} className="hover:bg-gray-50"><td className="px-4 py-2 text-[12px] text-gray-500 font-mono whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td><td className="px-4 py-2"><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${eventColors[e.type] || "text-gray-600 bg-gray-100 border-gray-200"}`}>{e.type}</span></td><td className="px-4 py-2 text-[13px] text-gray-500">{e.account_name}</td><td className="px-4 py-2 text-[13px] text-gray-600 truncate max-w-[200px]">{e.subject}</td></tr>))}</tbody></table></div>
        </div>
      )}
    </div>
  );
}

// ---- Accounts ----
function AdminAccounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  useEffect(() => {
    api("/admin/accounts")
      .then((r) => setAccounts(r.data))
      .catch((e) => setError(e.message || "Failed to load accounts"))
      .finally(() => setLoading(false));
  }, []);

  const toggleRole = async (id: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    try {
      await patch(`/admin/${id}/role`, { role: newRole });
      setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, role: newRole } : a));
      toast("Role updated");
    } catch (e: any) { toast(e.message || "Failed to update role", "error"); }
  };
  const removeAccount = (id: string) => {
    confirm({
      title: "Delete this account?",
      message: "This will permanently delete the account and all its data. This cannot be undone.",
      confirmLabel: "Delete Account",
      onConfirm: async () => {
        try {
          await del(`/admin/${id}`);
          setAccounts((prev) => prev.filter((a) => a.id !== id));
          toast("Account deleted");
        } catch (e: any) { toast(e.message || "Failed to delete account", "error"); }
      },
    });
  };

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>;

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-semibold text-gray-900 tracking-tight">Accounts ({accounts.length})</h1><p className="text-sm text-gray-500 mt-1">Manage user accounts and roles</p></div>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200"><th className="text-left px-4 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">User</th><th className="text-left px-4 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Role</th><th className="text-left px-4 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Joined</th><th className="text-right px-4 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Actions</th></tr></thead>
      <tbody className="divide-y divide-gray-100">{accounts.map((a) => (
        <tr key={a.id} className="hover:bg-gray-50">
          <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-violet-100 border border-gray-200 flex items-center justify-center text-[12px] font-semibold text-violet-600">{a.name?.charAt(0)?.toUpperCase() || "?"}</div><div><p className="text-[13px] text-gray-900 font-medium">{a.name}</p><p className="text-[11px] text-gray-400">{a.email}</p></div></div></td>
          <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${a.role === "admin" ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>{a.role}</span></td>
          <td className="px-4 py-3 text-[13px] text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
          <td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1">
            <button onClick={() => toggleRole(a.id, a.role)} disabled={a.id === user?.id} className="px-2.5 py-1.5 text-[12px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">{a.role === "admin" ? "Demote" : "Promote"}</button>
            {a.id !== user?.id && <button onClick={() => removeAccount(a.id)} className="px-2.5 py-1.5 text-[12px] text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">Delete</button>}
          </div></td>
        </tr>
      ))}</tbody></table></div></div>
      {confirmDialog}
    </div>
  );
}

// ---- API Usage ----
function AdminApiUsage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { api("/admin/analytics/api-keys").then((r) => setKeys(r.data)).catch((e: any) => setError(e.message || "Failed to load")).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (error) return <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>;

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-semibold text-gray-900 tracking-tight">API Usage</h1><p className="text-sm text-gray-500 mt-1">Monitor API key activity across all accounts</p></div>
      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-200 rounded-2xl bg-white">
          <p className="text-sm font-medium text-gray-900">No API keys yet</p>
          <p className="text-[13px] text-gray-500 mt-1">API keys will appear here once users create them</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200"><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Key</th><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Account</th><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Rate Limit</th><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Last Used</th><th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Status</th></tr></thead>
        <tbody className="divide-y divide-gray-100">{keys.map((k: any) => (
          <tr key={k.id} className="hover:bg-gray-50">
            <td className="px-4 py-2"><p className="text-[13px] text-gray-900">{k.name}</p><p className="text-[11px] text-gray-400 font-mono">{k.key_prefix}...</p></td>
            <td className="px-4 py-2 text-[13px] text-gray-500">{k.account_name}</td>
            <td className="px-4 py-2 text-[13px] text-gray-500">{k.rate_limit || 60}/min</td>
            <td className="px-4 py-2 text-[12px] text-gray-500 font-mono">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : <span className="text-gray-300">Never</span>}</td>
            <td className="px-4 py-2"><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${k.status === "active" ? "text-emerald-600 bg-emerald-50 border-emerald-200" : k.status === "revoked" ? "text-red-600 bg-rose-50 border-rose-200" : "text-gray-600 bg-gray-100 border-gray-200"}`}>{k.status}</span></td>
          </tr>
        ))}</tbody></table></div></div>
      )}
    </div>
  );
}

// ---- API Logs ----
function AdminApiLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (methodFilter) params.set("method", methodFilter);
    api(`/admin/analytics/api-logs?${params}`).then((r) => setLogs(r.data)).catch((e: any) => setError(e.message || "Failed to load")).finally(() => setLoading(false));
  }, [methodFilter]);

  const methodColor = (m: string) => m === "GET" ? "text-emerald-600 bg-emerald-50 border-emerald-200" : m === "POST" ? "text-blue-600 bg-blue-50 border-blue-200" : m === "DELETE" ? "text-red-600 bg-rose-50 border-rose-200" : m === "PATCH" ? "text-amber-600 bg-amber-50 border-amber-200" : "text-gray-600 bg-gray-100 border-gray-200";
  const statusColor = (s: number) => s < 300 ? "text-emerald-600" : s < 400 ? "text-blue-600" : s < 500 ? "text-amber-600" : "text-red-600";

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div><h1 className="text-xl font-semibold text-gray-900 tracking-tight">API Logs</h1><p className="text-sm text-gray-500 mt-1">Recent API requests across all accounts</p></div>
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="h-9 px-3 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
          <option value="">All methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-200 rounded-2xl bg-white"><p className="text-sm font-medium text-gray-900">No API requests yet</p><p className="text-[13px] text-gray-500 mt-1">Logs appear when users make API calls</p></div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200">
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Time</th>
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Method</th>
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Path</th>
          <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Status</th>
          <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Time (ms)</th>
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Account</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-100">{logs.map((l: any) => (
          <tr key={l.id} className="hover:bg-gray-50">
            <td className="px-4 py-2 text-[12px] text-gray-500 font-mono whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
            <td className="px-4 py-2"><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold font-mono border ${methodColor(l.method)}`}>{l.method}</span></td>
            <td className="px-4 py-2 text-[13px] text-gray-700 font-mono truncate max-w-[250px]">{l.path}</td>
            <td className={`px-4 py-2 text-[13px] font-mono text-right ${statusColor(l.status_code)}`}>{l.status_code}</td>
            <td className="px-4 py-2 text-[13px] text-gray-500 font-mono text-right">{l.response_time}ms</td>
            <td className="px-4 py-2 text-[13px] text-gray-500">{l.account_name || "—"}</td>
          </tr>
        ))}</tbody></table></div></div>
      )}
    </div>
  );
}

// ---- Warmups (admin) ----
function AdminWarmups() {
  const [warmups, setWarmups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  useEffect(() => { api("/admin/warmups").then((r) => setWarmups(r.data)).catch((e: any) => setError(e.message || "Failed to load")).finally(() => setLoading(false)); }, []);

  const cancelWarmup = (id: string) => {
    confirm({
      title: "Cancel this warmup schedule?",
      message: "The warmup will be stopped and cannot be resumed.",
      confirmLabel: "Cancel Warmup",
      onConfirm: async () => {
        try {
          await post(`/admin/warmups/${id}/cancel`, {});
          setWarmups((prev) => prev.map((w) => w.id === id ? { ...w, status: "cancelled" } : w));
          toast("Warmup cancelled");
        } catch (e: any) { toast(e.message || "Failed to cancel warmup", "error"); }
      },
    });
  };

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /></div>;

  const statusColor = (s: string) => s === "active" ? "text-emerald-600 bg-emerald-50 border-emerald-200" : s === "paused" ? "text-amber-600 bg-amber-50 border-amber-200" : s === "completed" ? "text-blue-600 bg-blue-50 border-blue-200" : "text-gray-600 bg-gray-100 border-gray-200";

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>;

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-semibold text-gray-900 tracking-tight">Warmup Schedules</h1><p className="text-sm text-gray-500 mt-1">Monitor and manage domain warmup across all accounts</p></div>
      {warmups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-200 rounded-2xl bg-white">
          <p className="text-sm font-medium text-gray-900">No warmup schedules</p>
          <p className="text-[13px] text-gray-500 mt-1">Users can start warmup from their dashboard</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200">
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Account</th>
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Domain</th>
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Status</th>
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Progress</th>
          <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Sent</th>
          <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Last Run</th>
          <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase">Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-100">{warmups.map((w: any) => (
          <tr key={w.id} className="hover:bg-gray-50">
            <td className="px-4 py-2"><p className="text-[13px] text-gray-900">{w.account_name}</p><p className="text-[11px] text-gray-400">{w.account_email}</p></td>
            <td className="px-4 py-2 text-[13px] text-gray-900 font-mono">{w.domain_name}</td>
            <td className="px-4 py-2"><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${statusColor(w.status)}`}>{w.status}</span></td>
            <td className="px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${w.progress}%` }} /></div>
                <span className="text-[11px] text-gray-500 shrink-0">Day {w.current_day}/{w.total_days}</span>
              </div>
            </td>
            <td className="px-4 py-2 text-[13px] text-gray-600 text-right font-mono">{w.total_sent}</td>
            <td className="px-4 py-2 text-[12px] text-gray-500">{w.last_run_at ? new Date(w.last_run_at).toLocaleString() : "Not yet"}</td>
            <td className="px-4 py-2 text-right">
              {(w.status === "active" || w.status === "paused") && (
                <button onClick={() => cancelWarmup(w.id)} className="px-2.5 py-1.5 text-[12px] text-red-600 hover:bg-red-50 rounded-lg transition-colors">Cancel</button>
              )}
            </td>
          </tr>
        ))}</tbody></table></div></div>
      )}
      {confirmDialog}
    </div>
  );
}

// ---- Main Layout ----
export default function AdminPanel() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-gray-50 antialiased">
      <AdminSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-30 lg:hidden">
        <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg></button>
        <div className="flex-1 flex justify-center"><span className="font-semibold text-[14px] text-gray-900">Admin Panel</span></div>
        <div className="w-8" />
      </div>
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl overflow-y-auto pt-[4.5rem] lg:pt-8">
        <Routes>
          <Route index element={<AdminOverview />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="accounts" element={<AdminAccounts />} />
          <Route path="api-usage" element={<AdminApiUsage />} />
          <Route path="api-logs" element={<AdminApiLogs />} />
          <Route path="warmups" element={<AdminWarmups />} />
        </Routes>
      </main>
    </div>
  );
}
