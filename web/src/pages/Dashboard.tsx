import { useState, useEffect } from "react";
import { Link, Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, post, del } from "../lib/api";
import { Badge, statusVariant, EmptyState, Table, PageHeader, Button, Input, Textarea, Modal, CopyButton, Dot } from "../components/ui";
import { patch } from "../lib/api";
import InboxPage from "./dashboard/InboxPage";
import EmailsPage from "./dashboard/EmailsPage";
import AudiencesPage from "./dashboard/AudiencesPage";
import BroadcastsPage from "./dashboard/BroadcastsPage";

const navItems = [
  { to: "/dashboard", label: "Overview", end: true, icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
  { to: "/dashboard/inbox", label: "Inbox", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" /></svg> },
  { to: "/dashboard/emails", label: "Emails", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
  { to: "/dashboard/audiences", label: "Audiences", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg> },
  { to: "/dashboard/broadcasts", label: "Broadcasts", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" /></svg> },
  { to: "/dashboard/domains", label: "Domains", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" /></svg> },
  { to: "/dashboard/api-keys", label: "API Keys", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> },
  { to: "/dashboard/webhooks", label: "Webhooks", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg> },
  { to: "/dashboard/api-docs", label: "API Docs", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
];

function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onToggle} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[240px] shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-screen transform transition-transform duration-200 lg:relative lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-4 h-14 flex items-center border-b border-gray-200">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg></div>
            <span className="font-semibold text-[14px] text-gray-900 tracking-tight">MailNowAPI</span>
          </Link>
          {/* Close button on mobile */}
          <button onClick={onToggle} className="ml-auto p-1 rounded-lg text-gray-500 hover:text-gray-900 lg:hidden">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={onToggle} className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? "bg-violet-50 text-violet-700" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
              {item.icon}{item.label}
            </NavLink>
          ))}
          {user?.role === "admin" && (<><div className="pt-3 pb-1 px-2.5"><div className="border-t border-gray-200" /></div><NavLink to="/admin" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-amber-600 hover:text-amber-600 hover:bg-amber-50 transition-colors"><svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Admin</NavLink></>)}
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

function Overview() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { api("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {}); }, []);
  const sc = (l: string, v: number) => (
    <div key={l} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
      <span className="text-[13px] text-gray-500">{l}</span>
      <div className="text-2xl font-bold text-gray-900 tracking-tight mt-1">{v}</div>
    </div>
  );
  return (<div><PageHeader title="Overview" desc="Your email service at a glance" />{stats && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{sc("Emails", stats.emails)}{sc("Domains", stats.domains)}{sc("API Keys", stats.api_keys)}{sc("Webhooks", stats.webhooks)}{sc("Audiences", stats.audiences)}</div>}</div>);
}

// EmailsPage is now imported from ./dashboard/EmailsPage

// --- DOMAINS with add/delete/verify + auto-setup ---
function DomainsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<any>(null);
  // Auto-setup state
  const [setupDomain, setSetupDomain] = useState<any>(null);
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [setupProvider, setSetupProvider] = useState<"godaddy" | "cloudflare" | "manual">("manual");
  const [setupCreds, setSetupCreds] = useState({ godaddy_key: "", godaddy_secret: "", cloudflare_token: "", cloudflare_zone_id: "" });
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupResult, setSetupResult] = useState<any>(null);

  const load = () => api("/dashboard/domains").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    setError(""); setLoading(true);
    try {
      const res = await post("/dashboard/domains", { name });
      setOpen(false); setName(""); load();
      // Immediately open setup for the new domain
      openSetup(res.data);
    }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const [hasSavedCreds, setHasSavedCreds] = useState(false);

  const openSetup = async (domain: any) => {
    setSetupDomain(domain);
    setSetupResult(null);
    setVerifyResult(null);
    setTestResult(null);
    setSetupProvider("manual");
    setSetupCreds({ godaddy_key: "", godaddy_secret: "", cloudflare_token: "", cloudflare_zone_id: "" });
    setDetecting(true);
    setDetectedProvider(null);
    setHasSavedCreds(false);
    try {
      const res = await api(`/dashboard/domains/${domain.id}/detect-provider`);
      setDetectedProvider(res.data.provider);
      if (res.data.savedProvider) {
        setSetupProvider(res.data.savedProvider);
        setHasSavedCreds(true);
      } else if (res.data.provider === "godaddy" || res.data.provider === "cloudflare") {
        setSetupProvider(res.data.provider);
      }
    } catch (e: any) { setError(e.message || "Failed to detect DNS provider"); } finally { setDetecting(false); }
  };

  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const testCredentials = async () => {
    if (!setupDomain || setupProvider === "manual") return;
    setTesting(true); setTestResult(null);
    try {
      const res = await post(`/dashboard/domains/${setupDomain.id}/test-credentials`, { provider: setupProvider, ...setupCreds });
      setTestResult(res.data);
    } catch (e: any) { setTestResult({ success: false, error: e.message }); }
    finally { setTesting(false); }
  };

  const runAutoSetup = async () => {
    if (!setupDomain || setupProvider === "manual") return;
    setSetupLoading(true); setSetupResult(null);
    try {
      const res = await post(`/dashboard/domains/${setupDomain.id}/auto-setup`, { provider: setupProvider, ...setupCreds });
      setSetupResult(res.data);
      load();
    } catch (e: any) { setSetupResult({ success: false, results: [{ purpose: "All", success: false, error: e.message }] }); }
    finally { setSetupLoading(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this domain?")) return;
    try { await del(`/dashboard/domains/${id}`); } catch (e: any) { alert(e.message || "Delete failed"); }
    load();
  };
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const verify = async (id: string) => {
    setVerifying(true); setVerifyResult(null);
    try {
      const res = await post(`/dashboard/domains/${id}/verify`, {});
      setVerifyResult(res.data);
      load();
    } catch (e: any) { setVerifyResult({ message: e.message }); }
    finally { setVerifying(false); }
  };

  const providerNames: Record<string, string> = { godaddy: "GoDaddy", cloudflare: "Cloudflare", namecheap: "Namecheap" };

  return (
    <div>
      <PageHeader title="Domains" desc="Manage domains for sending and receiving emails" action={<Button onClick={() => setOpen(true)}>+ Add Domain</Button>} />

      {/* Add Domain Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Domain">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Domain name" placeholder="mail.example.com" value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} />
          <Button onClick={add} disabled={loading}>{loading ? "Adding..." : "Add Domain"}</Button>
        </div>
      </Modal>

      {/* DNS Records Detail Modal */}
      <Modal open={!!detail && !setupDomain} onClose={() => setDetail(null)} title={`DNS Records — ${detail?.name || ""}`}>
        {detail?.records?.map((r: any) => (
          <div key={r.purpose} className="mb-3 p-3 rounded-xl bg-gray-50 border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[12px] font-semibold text-gray-500">{r.purpose} ({r.type})</span>
              <div className="flex items-center gap-2"><Dot ok={r.verified} /><CopyButton text={r.value} /></div>
            </div>
            <p className="text-[11px] text-gray-500 mb-1">Name: <span className="text-gray-600 font-mono">{r.name}</span></p>
            <p className="text-[11px] text-gray-600 font-mono break-all leading-relaxed">{r.value}</p>
          </div>
        ))}
        {detail && (
          <div className="mt-4 flex gap-2">
            <Button onClick={() => { openSetup(detail); }}>Auto-Setup DNS</Button>
            <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
          </div>
        )}
      </Modal>

      {/* Auto-Setup Modal */}
      <Modal open={!!setupDomain} onClose={() => { setSetupDomain(null); setDetail(null); }} title={`DNS Setup — ${setupDomain?.name || ""}`}>
        {detecting ? (
          <div className="flex items-center gap-2 text-[13px] text-gray-500 py-4"><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" /><path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Detecting DNS provider...</div>
        ) : (
          <div className="space-y-4">
            {detectedProvider && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-[13px] text-emerald-600">Detected: <strong>{providerNames[detectedProvider] || detectedProvider}</strong></span>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-2">Setup method</label>
              <div className="grid grid-cols-3 gap-2">
                {(["godaddy", "cloudflare", "manual"] as const).map((p) => (
                  <button key={p} onClick={() => setSetupProvider(p)}
                    className={`px-3 py-2.5 rounded-xl text-[13px] font-medium border transition-all ${setupProvider === p ? "border-violet-500/40 bg-violet-50 text-gray-900" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                    {p === "manual" ? "Manual" : providerNames[p]}
                  </button>
                ))}
              </div>
            </div>

            {setupProvider === "godaddy" && (
              <div className="space-y-3">
                {hasSavedCreds && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-[13px] text-violet-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    Credentials saved. Leave blank to reuse saved keys, or enter new ones to update.
                  </div>
                )}
                <p className="text-[12px] text-gray-500">Get <strong className="text-gray-500">Production</strong> keys (not OTE/test) at <a href="https://developer.godaddy.com/keys" target="_blank" className="text-violet-600 hover:text-violet-700">developer.godaddy.com/keys</a></p>
                <Input label="API Key" placeholder={hasSavedCreds ? "••••••••••••••• (saved)" : "GoDaddy API Key"} type="password" value={setupCreds.godaddy_key} onChange={(e) => { setSetupCreds({ ...setupCreds, godaddy_key: (e.target as HTMLInputElement).value }); setTestResult(null); }} />
                <Input label="API Secret" placeholder={hasSavedCreds ? "••••••••••••••• (saved)" : "GoDaddy API Secret"} type="password" value={setupCreds.godaddy_secret} onChange={(e) => { setSetupCreds({ ...setupCreds, godaddy_secret: (e.target as HTMLInputElement).value }); setTestResult(null); }} />
                {testResult && (
                  <div className={`px-3 py-2.5 rounded-xl border text-[13px] ${testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-red-50 border-red-200 text-red-600"}`}>
                    <p className="font-medium">{testResult.success ? "✓ " : "✗ "}{testResult.message || testResult.error}</p>
                    {testResult.hint && <p className="mt-1 text-[12px] opacity-80">{testResult.hint}</p>}
                    {testResult.status && <p className="mt-0.5 text-[11px] opacity-60">HTTP {testResult.status}</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={testCredentials} disabled={testing || (!hasSavedCreds && (!setupCreds.godaddy_key || !setupCreds.godaddy_secret))}>{testing ? "Testing..." : "Test Connection"}</Button>
                  <Button onClick={runAutoSetup} disabled={setupLoading || (!hasSavedCreds && (!setupCreds.godaddy_key || !setupCreds.godaddy_secret))}>{setupLoading ? "Setting up DNS..." : "Auto-Configure DNS"}</Button>
                </div>
              </div>
            )}

            {setupProvider === "cloudflare" && (
              <div className="space-y-3">
                {hasSavedCreds && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-[13px] text-violet-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    Credentials saved. Leave blank to reuse, or enter new ones to update.
                  </div>
                )}
                <p className="text-[12px] text-gray-500">Create a token at <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" className="text-violet-600 hover:text-violet-700">Cloudflare Dashboard</a> with "Zone DNS Edit" permission</p>
                <Input label="API Token" placeholder={hasSavedCreds ? "••••••••••••••• (saved)" : "Cloudflare API Token"} type="password" value={setupCreds.cloudflare_token} onChange={(e) => { setSetupCreds({ ...setupCreds, cloudflare_token: (e.target as HTMLInputElement).value }); setTestResult(null); }} />
                <Input label="Zone ID" placeholder="Found on your domain's overview page" value={setupCreds.cloudflare_zone_id} onChange={(e) => { setSetupCreds({ ...setupCreds, cloudflare_zone_id: (e.target as HTMLInputElement).value }); setTestResult(null); }} />
                {testResult && (
                  <div className={`px-3 py-2.5 rounded-xl border text-[13px] ${testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-red-50 border-red-200 text-red-600"}`}>
                    <p className="font-medium">{testResult.success ? "✓ " : "✗ "}{testResult.message || testResult.error}</p>
                    {testResult.hint && <p className="mt-1 text-[12px] opacity-80">{testResult.hint}</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={testCredentials} disabled={testing || (!hasSavedCreds && (!setupCreds.cloudflare_token || !setupCreds.cloudflare_zone_id))}>{testing ? "Testing..." : "Test Connection"}</Button>
                  <Button onClick={runAutoSetup} disabled={setupLoading || (!hasSavedCreds && (!setupCreds.cloudflare_token || !setupCreds.cloudflare_zone_id))}>{setupLoading ? "Setting up DNS..." : "Auto-Configure DNS"}</Button>
                </div>
              </div>
            )}

            {setupProvider === "manual" && (
              <div className="space-y-3">
                {setupDomain?.mailHostConfigured === false && (
                  <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-red-50 border border-red-200 text-[13px] text-red-600">
                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                    <div>
                      <p className="font-medium">Mail host not configured</p>
                      <p className="text-red-500 mt-0.5">Set the <code className="bg-red-100 px-1 rounded">MAIL_HOST</code> environment variable to your server's public hostname. MX and SPF records need this to work correctly.</p>
                    </div>
                  </div>
                )}
                <p className="text-[13px] text-gray-500">Add these DNS records with your domain registrar:</p>
                {setupDomain?.records?.map((r: any) => (
                  <div key={r.purpose} className="p-3 rounded-xl bg-gray-50 border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[12px] font-semibold text-gray-500">{r.purpose} ({r.type})</span>
                      <CopyButton text={r.value} />
                    </div>
                    <p className="text-[11px] text-gray-500">Name: <span className="text-gray-600 font-mono">{r.name}</span></p>
                    <p className="text-[11px] text-gray-600 font-mono break-all mt-1">{r.value}</p>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => verify(setupDomain.id)} disabled={verifying}>{verifying ? "Checking DNS..." : "I've added the records — Verify now"}</Button>
              </div>
            )}

            {setupResult && (
              <div className="mt-3 space-y-2">
                {setupResult.results?.map((r: any) => (
                  <div key={r.purpose} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${r.success ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                    {r.success ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                    <span className="font-medium">{r.purpose}:</span> {r.success ? (r.detail || "done") : r.error}
                  </div>
                ))}
                {setupResult.success && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[12px] text-emerald-600">DNS records configured successfully.</p>
                    <Button onClick={() => verify(setupDomain.id)} disabled={verifying}>{verifying ? "Verifying..." : "Verify DNS Now"}</Button>
                  </div>
                )}
              </div>
            )}
            {/* DNS Debug Check */}
            {setupDomain && (
              <div className="mt-3">
                <button onClick={async () => {
                  try {
                    const res = await api(`/dashboard/domains/${setupDomain.id}/dns-check`);
                    setVerifyResult({ ...verifyResult, dnsDebug: res.data });
                  } catch (e: any) { setError(e.message || "DNS check failed"); }
                }} className="text-[12px] text-gray-500 hover:text-gray-900 underline">Debug: Check what GoDaddy & DNS actually see</button>
                {verifyResult?.dnsDebug && (
                  <pre className="mt-2 p-3 rounded-xl bg-gray-100 text-[11px] text-gray-500 font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">{JSON.stringify(verifyResult.dnsDebug, null, 2)}</pre>
                )}
              </div>
            )}

            {verifyResult && !verifyResult.dnsDebug && (
              <div className={`mt-3 p-3 rounded-xl border text-[13px] ${verifyResult.status === "verified" ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-amber-50 border-amber-200 text-amber-600"}`}>
                <p className="font-medium mb-1">{verifyResult.status === "verified" ? "Domain verified!" : "Verification results:"}</p>
                <p>{verifyResult.message}</p>
                {verifyResult.status !== "verified" && (
                  <div className="flex gap-3 mt-2 text-[12px]">
                    <span>SPF: {verifyResult.spf ? "OK" : "pending"}</span>
                    <span>DKIM: {verifyResult.dkim ? "OK" : "pending"}</span>
                    <span>DMARC: {verifyResult.dmarc ? "OK" : "pending"}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {items.length === 0 ? <EmptyState title="No domains" desc="Add a domain to start sending emails" /> : (
        <Table headers={["Domain", "Status", "SPF", "DKIM", "DMARC", "Actions"]}>
          {items.map((d) => (
            <tr key={d.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900 text-[13px] font-medium font-mono cursor-pointer hover:text-violet-600" onClick={() => setDetail(d)}>{d.name}</td>
              <td className="px-4 py-3"><Badge variant={statusVariant(d.status)}>{d.status}</Badge></td>
              <td className="px-4 py-3"><Dot ok={d.records?.find((r:any)=>r.purpose?.startsWith("SPF"))?.verified} /></td>
              <td className="px-4 py-3"><Dot ok={d.records?.find((r:any)=>r.purpose?.startsWith("DKIM"))?.verified} /></td>
              <td className="px-4 py-3"><Dot ok={d.records?.find((r:any)=>r.purpose?.startsWith("DMARC"))?.verified} /></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => openSetup(d)} className="px-2 py-1 text-[12px] text-violet-600 hover:bg-violet-50 rounded-lg">Setup</button>
                  <button onClick={() => verify(d.id)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">Verify</button>
                  <button onClick={() => remove(d.id)} className="px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded-lg">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// --- API KEYS with create/revoke ---
function ApiKeysPage() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = () => api("/dashboard/api-keys").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError(""); setLoading(true);
    try { const res = await post("/dashboard/api-keys", { name }); setNewKey(res.data.key); setName(""); load(); }
    catch (e: any) { setError(e.message || "Failed to create API key"); } finally { setLoading(false); }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this API key?")) return;
    try { await del(`/dashboard/api-keys/${id}`); } catch (e: any) { alert(e.message || "Revoke failed"); }
    load();
  };

  return (
    <div>
      <PageHeader title="API Keys" desc="Create and manage API keys" action={<Button onClick={() => { setOpen(true); setNewKey(""); }}>+ Create Key</Button>} />
      <Modal open={open} onClose={() => setOpen(false)} title={newKey ? "Key Created" : "Create API Key"}>
        {newKey ? (
          <div>
            <p className="text-[13px] text-gray-500 mb-3">Copy this key now — it won't be shown again.</p>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200 shadow-sm">
              <code className="text-[13px] text-emerald-600 font-mono flex-1 break-all">{newKey}</code>
              <CopyButton text={newKey} />
            </div>
            <div className="mt-4"><Button onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input label="Key name" placeholder="e.g. Production" value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} />
            {error && <p className="text-red-600 text-[13px]">{error}</p>}
            <Button onClick={create} disabled={loading || !name}>{loading ? "Creating..." : "Create Key"}</Button>
          </div>
        )}
      </Modal>
      {items.length === 0 ? <EmptyState title="No API keys" desc="Create a key to authenticate API requests" /> : (
        <Table headers={["Name", "Key", "Rate Limit", "Last Used", ""]}>
          {items.map((k) => (
            <tr key={k.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900 text-[13px] font-medium">{k.name}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px] font-mono">{k.key_prefix}••••••••</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{k.rate_limit}/min</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : <span className="text-gray-300">Never</span>}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => revoke(k.id)} className="px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded-lg">Revoke</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// --- WEBHOOKS with create/delete ---
function WebhooksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = () => api("/dashboard/webhooks").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError(""); setLoading(true);
    try {
      await post("/dashboard/webhooks", { url, events: ["email.sent", "email.delivered", "email.bounced", "email.opened", "email.clicked", "email.failed"] });
      setOpen(false); setUrl(""); load();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this webhook?")) return;
    try { await del(`/dashboard/webhooks/${id}`); } catch (e: any) { alert(e.message || "Delete failed"); }
    load();
  };

  return (
    <div>
      <PageHeader title="Webhooks" desc="Receive real-time email event notifications" action={<Button onClick={() => setOpen(true)}>+ Add Webhook</Button>} />
      <Modal open={open} onClose={() => setOpen(false)} title="Add Webhook">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Endpoint URL" placeholder="https://yourapp.com/webhook" value={url} onChange={(e) => setUrl((e.target as HTMLInputElement).value)} />
          <p className="text-[12px] text-gray-500">Subscribes to: sent, delivered, bounced, opened, clicked, failed</p>
          <Button onClick={create} disabled={loading || !url}>{loading ? "Adding..." : "Add Webhook"}</Button>
        </div>
      </Modal>
      {items.length === 0 ? <EmptyState title="No webhooks" desc="Add a webhook to receive delivery events" /> : (
        <Table headers={["URL", "Events", "Status", "Secret", ""]}>
          {items.map((w) => (
            <tr key={w.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900 text-[13px] font-mono truncate max-w-[200px]">{w.url}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{w.events?.length || 0} events</td>
              <td className="px-4 py-3"><Badge variant={w.active ? "success" : "default"}>{w.active ? "Active" : "Inactive"}</Badge></td>
              <td className="px-4 py-3"><div className="flex items-center gap-1"><code className="text-[11px] text-gray-400 font-mono">{w.signing_secret?.slice(0, 12)}...</code><CopyButton text={w.signing_secret || ""} /></div></td>
              <td className="px-4 py-3 text-right"><button onClick={() => remove(w.id)} className="px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded-lg">Delete</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// InboxPage is now imported from ./dashboard/InboxPage

// --- API DOCS page ---
function ApiDocsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const base = typeof window !== "undefined" ? window.location.origin : "";

  const sections = [
    { title: "Authentication", desc: "All API requests require a Bearer token.", code: `curl -H "Authorization: Bearer es_your_api_key" ${base}/v1/emails` },
    { title: "Send Email", method: "POST", path: "/v1/emails", desc: "Send a transactional email.", code: `curl -X POST ${base}/v1/emails \\
  -H "Authorization: Bearer es_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"from":"you@domain.com","to":["user@example.com"],"subject":"Hello","html":"<h1>Hi</h1>"}'` },
    { title: "List Emails", method: "GET", path: "/v1/emails", desc: "Retrieve sent emails with pagination." },
    { title: "Send Batch", method: "POST", path: "/v1/emails/batch", desc: "Send up to 100 emails in one request." },
    { title: "Add Domain", method: "POST", path: "/v1/domains", desc: "Register a sender domain. Returns DNS records to configure.", code: `curl -X POST ${base}/v1/domains -H "Authorization: Bearer es_xxx" -H "Content-Type: application/json" -d '{"name":"mail.example.com"}'` },
    { title: "Verify Domain", method: "POST", path: "/v1/domains/:id/verify", desc: "Trigger DNS verification for a domain." },
    { title: "Create API Key", method: "POST", path: "/v1/api-keys", desc: "Generate a new API key. The full key is only returned once." },
    { title: "Create Webhook", method: "POST", path: "/v1/webhooks", desc: "Register an endpoint to receive email events." },
    { title: "Audiences", method: "CRUD", path: "/v1/audiences", desc: "Create and manage contact audiences." },
    { title: "Contacts", method: "CRUD", path: "/v1/audiences/:id/contacts", desc: "Manage contacts within an audience." },
    { title: "Suppressions", method: "CRUD", path: "/v1/suppressions", desc: "Manage the suppression list (bounced/complained addresses)." },
    { title: "Analytics", method: "GET", path: "/v1/analytics", desc: "Get email delivery statistics." },
  ];

  const adminSections = [
    { title: "System Stats", method: "GET", path: "/admin/stats", desc: "Get system-wide statistics (accounts, domains, emails)." },
    { title: "List All Accounts", method: "GET", path: "/admin/accounts", desc: "List every registered account." },
    { title: "Update Role", method: "PATCH", path: "/admin/:id/role", desc: "Promote or demote an account.", code: `curl -X PATCH ${base}/admin/:id/role -H "Content-Type: application/json" -d '{"role":"admin"}'` },
    { title: "Delete Account", method: "DELETE", path: "/admin/:id", desc: "Permanently delete an account and all its data." },
  ];

  const methodColor: Record<string, string> = { GET: "text-emerald-600", POST: "text-blue-600", PATCH: "text-amber-600", DELETE: "text-red-600", CRUD: "text-violet-600" };

  return (
    <div>
      <PageHeader title="API Documentation" desc={`v1.4.0 — Updated 2026-03-19 ${isAdmin ? "(Admin view)" : "(User view)"}`} />
      <div className="space-y-3">
        {sections.map((s) => (
          <details key={s.title} className="group rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
              {s.method && <span className={`text-[11px] font-bold font-mono w-14 ${methodColor[s.method] || "text-gray-500"}`}>{s.method}</span>}
              {s.path && <code className="text-[13px] text-gray-600 font-mono">{s.path}</code>}
              <span className="text-[13px] text-gray-500 ml-auto">{s.title}</span>
            </summary>
            <div className="px-5 pb-4 border-t border-gray-100 pt-3">
              <p className="text-[13px] text-gray-500 mb-3">{s.desc}</p>
              {s.code && <pre className="p-3 rounded-xl bg-gray-100 text-[12px] text-gray-600 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">{s.code}</pre>}
            </div>
          </details>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4"><h2 className="text-lg font-semibold text-amber-600 flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>Admin Endpoints</h2></div>
            {adminSections.map((s) => (
              <details key={s.title} className="group rounded-2xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
                <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-amber-50 transition-colors">
                  {s.method && <span className={`text-[11px] font-bold font-mono w-14 ${methodColor[s.method] || "text-gray-500"}`}>{s.method}</span>}
                  <code className="text-[13px] text-gray-600 font-mono">{s.path}</code>
                  <span className="text-[13px] text-gray-500 ml-auto">{s.title}</span>
                </summary>
                <div className="px-5 pb-4 border-t border-amber-100 pt-3">
                  <p className="text-[13px] text-gray-500 mb-3">{s.desc}</p>
                  {s.code && <pre className="p-3 rounded-xl bg-gray-100 text-[12px] text-gray-600 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">{s.code}</pre>}
                </div>
              </details>
            ))}
          </>
        )}
      </div>
      <div className="mt-6"><a href="/docs" target="_blank" className="text-[13px] text-violet-600 hover:text-violet-700 transition-colors">Open interactive Swagger UI &rarr;</a></div>
    </div>
  );
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-gray-50 antialiased">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-30 lg:hidden">
        <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
        </button>
        <div className="flex-1 flex justify-center">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg></div>
            <span className="font-semibold text-[14px] text-gray-900 tracking-tight">MailNowAPI</span>
          </Link>
        </div>
        <div className="w-8" /> {/* Spacer for centering */}
      </div>
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl overflow-y-auto pt-18 lg:pt-8">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="emails" element={<EmailsPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="audiences" element={<AudiencesPage />} />
          <Route path="broadcasts" element={<BroadcastsPage />} />
          <Route path="domains" element={<DomainsPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="api-docs" element={<ApiDocsPage />} />
        </Routes>
      </main>
    </div>
  );
}
