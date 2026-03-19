import { useState, useEffect } from "react";
import { Link, Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, post, del } from "../lib/api";
import { Badge, statusVariant, EmptyState, Table, PageHeader, Button, Input, Textarea, Modal, CopyButton, Dot } from "../components/ui";

const navItems = [
  { to: "/dashboard", label: "Overview", end: true, icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
  { to: "/dashboard/emails", label: "Emails", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
  { to: "/dashboard/domains", label: "Domains", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" /></svg> },
  { to: "/dashboard/api-keys", label: "API Keys", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> },
  { to: "/dashboard/webhooks", label: "Webhooks", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg> },
  { to: "/dashboard/api-docs", label: "API Docs", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
];

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <aside className="w-[240px] shrink-0 border-r border-white/[0.06] bg-[#0c0c0f] flex flex-col min-h-screen">
      <div className="px-4 h-14 flex items-center border-b border-white/[0.06]">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg></div>
          <span className="font-semibold text-[14px] text-white tracking-tight">MailStride</span>
        </Link>
      </div>
      <nav className="flex-1 px-2.5 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive ? "bg-white/[0.06] text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"}`}>
            {item.icon}{item.label}
          </NavLink>
        ))}
        {user?.role === "admin" && (<><div className="pt-3 pb-1 px-2.5"><div className="border-t border-white/[0.06]" /></div><NavLink to="/admin" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-amber-400/80 hover:text-amber-400 hover:bg-amber-400/[0.04] transition-colors"><svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Admin</NavLink></>)}
      </nav>
      <div className="px-2.5 py-3 border-t border-white/[0.06]">
        <div className="px-2.5 mb-2"><p className="text-[13px] text-white font-medium truncate">{user?.name}</p><p className="text-[11px] text-zinc-600 truncate">{user?.email}</p></div>
        <button onClick={async () => { await logout(); navigate("/"); }} className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>Sign out
        </button>
      </div>
    </aside>
  );
}

function Overview() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { api("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {}); }, []);
  const sc = (l: string, v: number) => (
    <div key={l} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <span className="text-[13px] text-zinc-500">{l}</span>
      <div className="text-2xl font-bold text-white tracking-tight mt-1">{v}</div>
    </div>
  );
  return (<div><PageHeader title="Overview" desc="Your email service at a glance" />{stats && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{sc("Emails", stats.emails)}{sc("Domains", stats.domains)}{sc("API Keys", stats.api_keys)}{sc("Webhooks", stats.webhooks)}{sc("Audiences", stats.audiences)}</div>}</div>);
}

// --- EMAILS with compose + domain check ---
function EmailsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [domainsList, setDomainsList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ from: "", to: "", subject: "", html: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api("/dashboard/emails").then((r) => setItems(r.data)).catch(() => {});
    api("/dashboard/domains").then((r) => setDomainsList(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const verifiedDomains = domainsList.filter((d) => d.status === "verified");
  const hasDomains = verifiedDomains.length > 0;

  const send = async () => {
    setError(""); setSending(true);
    try { await post("/dashboard/emails", form); setOpen(false); setForm({ from: "", to: "", subject: "", html: "" }); load(); }
    catch (e: any) { setError(e.message); }
    finally { setSending(false); }
  };

  return (
    <div>
      <PageHeader title="Emails" desc="Send and track emails" action={hasDomains ? <Button onClick={() => setOpen(true)}>+ Compose</Button> : undefined} />

      {!hasDomains && (
        <div className="mb-6 p-5 rounded-2xl border border-amber-500/10 bg-amber-500/[0.03]">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4.5 h-4.5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-amber-300">Connect a domain to start sending</h3>
              <p className="text-[13px] text-zinc-400 mt-1 leading-relaxed">You need at least one verified domain before you can send emails. Add a domain in the Domains page and complete DNS verification.</p>
              <Link to="/dashboard/domains" className="inline-flex items-center gap-1 mt-3 text-[13px] font-medium text-violet-400 hover:text-violet-300 transition-colors">
                Go to Domains
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Compose Email">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/10 text-red-400 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="From" placeholder="you@yourdomain.com" value={form.from} onChange={(e) => setForm({ ...form, from: (e.target as HTMLInputElement).value })} />
          {verifiedDomains.length > 0 && <p className="text-[11px] text-zinc-600">Verified domains: {verifiedDomains.map((d) => d.name).join(", ")}</p>}
          <Input label="To" placeholder="recipient@example.com (comma-separated)" value={form.to} onChange={(e) => setForm({ ...form, to: (e.target as HTMLInputElement).value })} />
          <Input label="Subject" placeholder="Email subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: (e.target as HTMLInputElement).value })} />
          <Textarea label="HTML Body" placeholder="<h1>Hello!</h1>" rows={4} value={form.html} onChange={(e) => setForm({ ...form, html: (e.target as HTMLTextAreaElement).value })} />
          <Button onClick={send} disabled={sending}>{sending ? "Sending..." : "Send Email"}</Button>
        </div>
      </Modal>
      {items.length === 0 ? (
        <EmptyState title="No emails yet" desc={hasDomains ? "Click Compose to send your first email" : "Connect a verified domain first"} />
      ) : (
        <Table headers={["Recipient", "Subject", "Status", "Date"]}>
          {items.map((e) => (
            <tr key={e.id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3 text-white text-[13px] font-medium">{Array.isArray(e.toAddresses) ? e.toAddresses[0] : "—"}</td>
              <td className="px-4 py-3 text-zinc-400 text-[13px]">{e.subject}</td>
              <td className="px-4 py-3"><Badge variant={statusVariant(e.status)}>{e.status}</Badge></td>
              <td className="px-4 py-3 text-zinc-500 text-[13px]">{new Date(e.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

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

  const openSetup = async (domain: any) => {
    setSetupDomain(domain);
    setSetupResult(null);
    setSetupProvider("manual");
    setSetupCreds({ godaddy_key: "", godaddy_secret: "", cloudflare_token: "", cloudflare_zone_id: "" });
    setDetecting(true);
    setDetectedProvider(null);
    try {
      const res = await api(`/dashboard/domains/${domain.id}/detect-provider`);
      setDetectedProvider(res.data.provider);
      if (res.data.provider === "godaddy" || res.data.provider === "cloudflare") {
        setSetupProvider(res.data.provider);
      }
    } catch {} finally { setDetecting(false); }
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

  const remove = async (id: string) => { if (!confirm("Delete this domain?")) return; await del(`/dashboard/domains/${id}`); load(); };
  const verify = async (id: string) => { await post(`/dashboard/domains/${id}/verify`, {}); alert("Verification started. Check back in a minute."); load(); };

  const providerNames: Record<string, string> = { godaddy: "GoDaddy", cloudflare: "Cloudflare", namecheap: "Namecheap" };

  return (
    <div>
      <PageHeader title="Domains" desc="Manage sender domains and DNS records" action={<Button onClick={() => setOpen(true)}>+ Add Domain</Button>} />

      {/* Add Domain Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Domain">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/10 text-red-400 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Domain name" placeholder="mail.example.com" value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} />
          <Button onClick={add} disabled={loading}>{loading ? "Adding..." : "Add Domain"}</Button>
        </div>
      </Modal>

      {/* DNS Records Detail Modal */}
      <Modal open={!!detail && !setupDomain} onClose={() => setDetail(null)} title={`DNS Records — ${detail?.name || ""}`}>
        {detail?.records?.map((r: any) => (
          <div key={r.purpose} className="mb-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[12px] font-semibold text-zinc-400">{r.purpose} ({r.type})</span>
              <div className="flex items-center gap-2"><Dot ok={r.verified} /><CopyButton text={r.value} /></div>
            </div>
            <p className="text-[11px] text-zinc-500 mb-1">Name: <span className="text-zinc-300 font-mono">{r.name}</span></p>
            <p className="text-[11px] text-zinc-300 font-mono break-all leading-relaxed">{r.value}</p>
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
          <div className="flex items-center gap-2 text-[13px] text-zinc-400 py-4"><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" /><path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Detecting DNS provider...</div>
        ) : (
          <div className="space-y-4">
            {detectedProvider && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/10">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-[13px] text-emerald-300">Detected: <strong>{providerNames[detectedProvider] || detectedProvider}</strong></span>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-zinc-300 mb-2">Setup method</label>
              <div className="grid grid-cols-3 gap-2">
                {(["godaddy", "cloudflare", "manual"] as const).map((p) => (
                  <button key={p} onClick={() => setSetupProvider(p)}
                    className={`px-3 py-2.5 rounded-xl text-[13px] font-medium border transition-all ${setupProvider === p ? "border-violet-500/40 bg-violet-500/10 text-white" : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/[0.15]"}`}>
                    {p === "manual" ? "Manual" : providerNames[p]}
                  </button>
                ))}
              </div>
            </div>

            {setupProvider === "godaddy" && (
              <div className="space-y-3">
                <p className="text-[12px] text-zinc-500">Enter your GoDaddy API credentials. Get them at <a href="https://developer.godaddy.com/keys" target="_blank" className="text-violet-400 hover:text-violet-300">developer.godaddy.com/keys</a></p>
                <Input label="API Key" placeholder="GoDaddy API Key" value={setupCreds.godaddy_key} onChange={(e) => setSetupCreds({ ...setupCreds, godaddy_key: (e.target as HTMLInputElement).value })} />
                <Input label="API Secret" placeholder="GoDaddy API Secret" type="password" value={setupCreds.godaddy_secret} onChange={(e) => setSetupCreds({ ...setupCreds, godaddy_secret: (e.target as HTMLInputElement).value })} />
                <Button onClick={runAutoSetup} disabled={setupLoading || !setupCreds.godaddy_key || !setupCreds.godaddy_secret}>{setupLoading ? "Setting up DNS..." : "Auto-Configure DNS"}</Button>
              </div>
            )}

            {setupProvider === "cloudflare" && (
              <div className="space-y-3">
                <p className="text-[12px] text-zinc-500">Enter your Cloudflare API token and Zone ID. Create a token at <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" className="text-violet-400 hover:text-violet-300">Cloudflare Dashboard</a></p>
                <Input label="API Token" placeholder="Cloudflare API Token" type="password" value={setupCreds.cloudflare_token} onChange={(e) => setSetupCreds({ ...setupCreds, cloudflare_token: (e.target as HTMLInputElement).value })} />
                <Input label="Zone ID" placeholder="Found on your domain's overview page" value={setupCreds.cloudflare_zone_id} onChange={(e) => setSetupCreds({ ...setupCreds, cloudflare_zone_id: (e.target as HTMLInputElement).value })} />
                <Button onClick={runAutoSetup} disabled={setupLoading || !setupCreds.cloudflare_token || !setupCreds.cloudflare_zone_id}>{setupLoading ? "Setting up DNS..." : "Auto-Configure DNS"}</Button>
              </div>
            )}

            {setupProvider === "manual" && (
              <div className="space-y-3">
                <p className="text-[13px] text-zinc-400">Add these DNS records with your domain registrar:</p>
                {setupDomain?.records?.map((r: any) => (
                  <div key={r.purpose} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[12px] font-semibold text-zinc-400">{r.purpose} ({r.type})</span>
                      <CopyButton text={r.value} />
                    </div>
                    <p className="text-[11px] text-zinc-500">Name: <span className="text-zinc-300 font-mono">{r.name}</span></p>
                    <p className="text-[11px] text-zinc-300 font-mono break-all mt-1">{r.value}</p>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => { verify(setupDomain.id); setSetupDomain(null); setDetail(null); }}>I've added the records — Verify now</Button>
              </div>
            )}

            {setupResult && (
              <div className="mt-3 space-y-2">
                {setupResult.results?.map((r: any) => (
                  <div key={r.purpose} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${r.success ? "bg-emerald-500/[0.06] text-emerald-400" : "bg-red-500/[0.06] text-red-400"}`}>
                    {r.success ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                    {r.purpose}: {r.success ? "configured" : r.error}
                  </div>
                ))}
                {setupResult.success && <p className="text-[12px] text-zinc-500 mt-2">DNS records configured. Verification will start automatically in ~10 seconds.</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {items.length === 0 ? <EmptyState title="No domains" desc="Add a domain to start sending emails" /> : (
        <Table headers={["Domain", "Status", "SPF", "DKIM", "DMARC", "Actions"]}>
          {items.map((d) => (
            <tr key={d.id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3 text-white text-[13px] font-medium font-mono cursor-pointer hover:text-violet-400" onClick={() => setDetail(d)}>{d.name}</td>
              <td className="px-4 py-3"><Badge variant={statusVariant(d.status)}>{d.status}</Badge></td>
              <td className="px-4 py-3"><Dot ok={d.records?.find((r:any)=>r.purpose==="SPF")?.verified} /></td>
              <td className="px-4 py-3"><Dot ok={d.records?.find((r:any)=>r.purpose==="DKIM")?.verified} /></td>
              <td className="px-4 py-3"><Dot ok={d.records?.find((r:any)=>r.purpose==="DMARC")?.verified} /></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => openSetup(d)} className="px-2 py-1 text-[12px] text-violet-400 hover:bg-violet-500/10 rounded-lg">Setup</button>
                  <button onClick={() => verify(d.id)} className="px-2 py-1 text-[12px] text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded-lg">Verify</button>
                  <button onClick={() => remove(d.id)} className="px-2 py-1 text-[12px] text-red-400 hover:bg-red-500/10 rounded-lg">Delete</button>
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

  const load = () => api("/dashboard/api-keys").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    setLoading(true);
    try { const res = await post("/dashboard/api-keys", { name }); setNewKey(res.data.key); setName(""); load(); }
    catch {} finally { setLoading(false); }
  };

  const revoke = async (id: string) => { if (!confirm("Revoke this API key?")) return; await del(`/dashboard/api-keys/${id}`); load(); };

  return (
    <div>
      <PageHeader title="API Keys" desc="Create and manage API keys" action={<Button onClick={() => { setOpen(true); setNewKey(""); }}>+ Create Key</Button>} />
      <Modal open={open} onClose={() => setOpen(false)} title={newKey ? "Key Created" : "Create API Key"}>
        {newKey ? (
          <div>
            <p className="text-[13px] text-zinc-400 mb-3">Copy this key now — it won't be shown again.</p>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <code className="text-[13px] text-emerald-400 font-mono flex-1 break-all">{newKey}</code>
              <CopyButton text={newKey} />
            </div>
            <div className="mt-4"><Button onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input label="Key name" placeholder="e.g. Production" value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} />
            <Button onClick={create} disabled={loading || !name}>{loading ? "Creating..." : "Create Key"}</Button>
          </div>
        )}
      </Modal>
      {items.length === 0 ? <EmptyState title="No API keys" desc="Create a key to authenticate API requests" /> : (
        <Table headers={["Name", "Key", "Rate Limit", "Last Used", ""]}>
          {items.map((k) => (
            <tr key={k.id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3 text-white text-[13px] font-medium">{k.name}</td>
              <td className="px-4 py-3 text-zinc-500 text-[13px] font-mono">{k.key_prefix}••••••••</td>
              <td className="px-4 py-3 text-zinc-400 text-[13px]">{k.rate_limit}/min</td>
              <td className="px-4 py-3 text-zinc-500 text-[13px]">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : <span className="text-zinc-700">Never</span>}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => revoke(k.id)} className="px-2 py-1 text-[12px] text-red-400 hover:bg-red-500/10 rounded-lg">Revoke</button></td>
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

  const remove = async (id: string) => { if (!confirm("Delete this webhook?")) return; await del(`/dashboard/webhooks/${id}`); load(); };

  return (
    <div>
      <PageHeader title="Webhooks" desc="Receive real-time email event notifications" action={<Button onClick={() => setOpen(true)}>+ Add Webhook</Button>} />
      <Modal open={open} onClose={() => setOpen(false)} title="Add Webhook">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/10 text-red-400 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Endpoint URL" placeholder="https://yourapp.com/webhook" value={url} onChange={(e) => setUrl((e.target as HTMLInputElement).value)} />
          <p className="text-[12px] text-zinc-500">Subscribes to: sent, delivered, bounced, opened, clicked, failed</p>
          <Button onClick={create} disabled={loading || !url}>{loading ? "Adding..." : "Add Webhook"}</Button>
        </div>
      </Modal>
      {items.length === 0 ? <EmptyState title="No webhooks" desc="Add a webhook to receive delivery events" /> : (
        <Table headers={["URL", "Events", "Status", "Secret", ""]}>
          {items.map((w) => (
            <tr key={w.id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3 text-white text-[13px] font-mono truncate max-w-[200px]">{w.url}</td>
              <td className="px-4 py-3 text-zinc-400 text-[13px]">{w.events?.length || 0} events</td>
              <td className="px-4 py-3"><Badge variant={w.active ? "success" : "default"}>{w.active ? "Active" : "Inactive"}</Badge></td>
              <td className="px-4 py-3"><div className="flex items-center gap-1"><code className="text-[11px] text-zinc-600 font-mono">{w.signing_secret?.slice(0, 12)}...</code><CopyButton text={w.signing_secret || ""} /></div></td>
              <td className="px-4 py-3 text-right"><button onClick={() => remove(w.id)} className="px-2 py-1 text-[12px] text-red-400 hover:bg-red-500/10 rounded-lg">Delete</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

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

  const methodColor: Record<string, string> = { GET: "text-emerald-400", POST: "text-blue-400", PATCH: "text-amber-400", DELETE: "text-red-400", CRUD: "text-violet-400" };

  return (
    <div>
      <PageHeader title="API Documentation" desc={`v1.4.0 — Updated 2026-03-19 ${isAdmin ? "(Admin view)" : "(User view)"}`} />
      <div className="space-y-3">
        {sections.map((s) => (
          <details key={s.title} className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors">
              {s.method && <span className={`text-[11px] font-bold font-mono w-14 ${methodColor[s.method] || "text-zinc-400"}`}>{s.method}</span>}
              {s.path && <code className="text-[13px] text-zinc-300 font-mono">{s.path}</code>}
              <span className="text-[13px] text-zinc-500 ml-auto">{s.title}</span>
            </summary>
            <div className="px-5 pb-4 border-t border-white/[0.04] pt-3">
              <p className="text-[13px] text-zinc-400 mb-3">{s.desc}</p>
              {s.code && <pre className="p-3 rounded-xl bg-black/30 text-[12px] text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">{s.code}</pre>}
            </div>
          </details>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4"><h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>Admin Endpoints</h2></div>
            {adminSections.map((s) => (
              <details key={s.title} className="group rounded-2xl border border-amber-500/10 bg-amber-500/[0.02] overflow-hidden">
                <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-amber-500/[0.03] transition-colors">
                  {s.method && <span className={`text-[11px] font-bold font-mono w-14 ${methodColor[s.method] || "text-zinc-400"}`}>{s.method}</span>}
                  <code className="text-[13px] text-zinc-300 font-mono">{s.path}</code>
                  <span className="text-[13px] text-zinc-500 ml-auto">{s.title}</span>
                </summary>
                <div className="px-5 pb-4 border-t border-amber-500/[0.06] pt-3">
                  <p className="text-[13px] text-zinc-400 mb-3">{s.desc}</p>
                  {s.code && <pre className="p-3 rounded-xl bg-black/30 text-[12px] text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">{s.code}</pre>}
                </div>
              </details>
            ))}
          </>
        )}
      </div>
      <div className="mt-6"><a href="/docs" target="_blank" className="text-[13px] text-violet-400 hover:text-violet-300 transition-colors">Open interactive Swagger UI &rarr;</a></div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="flex min-h-screen bg-[#09090b] antialiased">
      <Sidebar />
      <main className="flex-1 p-8 max-w-5xl overflow-y-auto">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="emails" element={<EmailsPage />} />
          <Route path="domains" element={<DomainsPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="api-docs" element={<ApiDocsPage />} />
        </Routes>
      </main>
    </div>
  );
}
