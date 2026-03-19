import { useState, useEffect } from "react";
import { Link, Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

const navItems = [
  { to: "/dashboard", label: "Overview", end: true, icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
  { to: "/dashboard/emails", label: "Emails", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
  { to: "/dashboard/domains", label: "Domains", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 9c0 .9-.132 1.765-.377 2.582m0 0C19.832 16.206 16.246 19.5 12 19.5c-4.246 0-7.832-3.294-8.623-7.918" /></svg> },
  { to: "/dashboard/api-keys", label: "API Keys", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> },
  { to: "/dashboard/webhooks", label: "Webhooks", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg> },
];

function Badge({ children, variant = "default" }: { children: string; variant?: "success" | "warning" | "error" | "default" }) {
  const styles = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/10",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/10",
    error: "bg-red-500/10 text-red-400 border-red-500/10",
    default: "bg-zinc-500/10 text-zinc-400 border-zinc-500/10",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${styles[variant]}`}>{children}</span>;
}

function statusVariant(s: string): "success" | "warning" | "error" | "default" {
  if (["sent", "delivered", "verified"].includes(s)) return "success";
  if (["queued", "sending", "pending"].includes(s)) return "warning";
  if (["failed", "bounced", "complained"].includes(s)) return "error";
  return "default";
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      <p className="text-[13px] text-zinc-600 mt-1">{desc}</p>
    </div>
  );
}

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="w-[240px] shrink-0 border-r border-white/[0.06] bg-[#0c0c0f] flex flex-col min-h-screen">
      <div className="px-4 h-14 flex items-center border-b border-white/[0.06]">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
          </div>
          <span className="font-semibold text-[14px] text-white tracking-tight">MailStride</span>
        </Link>
      </div>

      <nav className="flex-1 px-2.5 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-white/[0.06] text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        {user?.role === "admin" && (
          <>
            <div className="pt-3 pb-1 px-2.5"><div className="border-t border-white/[0.06]" /></div>
            <NavLink
              to="/admin"
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-amber-400/80 hover:text-amber-400 hover:bg-amber-400/[0.04] transition-colors"
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Admin
            </NavLink>
          </>
        )}
      </nav>

      <div className="px-2.5 py-3 border-t border-white/[0.06]">
        <div className="px-2.5 mb-2">
          <p className="text-[13px] text-white font-medium truncate">{user?.name}</p>
          <p className="text-[11px] text-zinc-600 truncate">{user?.email}</p>
        </div>
        <button
          onClick={async () => { await logout(); navigate("/"); }}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-zinc-500">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-600">{icon}</div>
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { api("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {}); }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white tracking-tight">Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">Your email service at a glance</p>
      </div>
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Emails" value={stats.emails} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>} />
          <StatCard label="Domains" value={stats.domains} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" /></svg>} />
          <StatCard label="API Keys" value={stats.api_keys} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>} />
          <StatCard label="Webhooks" value={stats.webhooks} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>} />
          <StatCard label="Audiences" value={stats.audiences} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        </div>
      )}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[12px] font-medium text-zinc-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">{children}</tbody>
      </table>
    </div>
  );
}

function EmailsList() {
  const [emails, setEmails] = useState<any[]>([]);
  useEffect(() => { api("/dashboard/emails").then((r) => setEmails(r.data)).catch(() => {}); }, []);

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-semibold text-white tracking-tight">Emails</h1><p className="text-sm text-zinc-500 mt-1">All emails sent from your account</p></div>
      {emails.length === 0 ? <EmptyState title="No emails yet" desc="Send your first email via the API to see it here" /> : (
        <Table headers={["Recipient", "Subject", "Status", "Date"]}>
          {emails.map((e) => (
            <tr key={e.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-3 text-white text-[13px] font-medium">{Array.isArray(e.toAddresses) ? e.toAddresses[0] : "—"}</td>
              <td className="px-4 py-3 text-zinc-400 text-[13px]">{e.subject}</td>
              <td className="px-4 py-3"><Badge variant={statusVariant(e.status)}>{e.status}</Badge></td>
              <td className="px-4 py-3 text-zinc-500 text-[13px]">{new Date(e.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function DomainsList() {
  const [domains, setDomains] = useState<any[]>([]);
  useEffect(() => { api("/dashboard/domains").then((r) => setDomains(r.data)).catch(() => {}); }, []);
  const Dot = ({ ok }: { ok: boolean }) => <div className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-400" : "bg-zinc-700"}`} />;

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-semibold text-white tracking-tight">Domains</h1><p className="text-sm text-zinc-500 mt-1">Manage your verified sender domains</p></div>
      {domains.length === 0 ? <EmptyState title="No domains" desc="Add a domain via the API to start sending" /> : (
        <Table headers={["Domain", "Status", "SPF", "DKIM", "DMARC"]}>
          {domains.map((d) => (
            <tr key={d.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-3 text-white text-[13px] font-medium font-mono">{d.name}</td>
              <td className="px-4 py-3"><Badge variant={statusVariant(d.status)}>{d.status}</Badge></td>
              <td className="px-4 py-3"><Dot ok={d.spfVerified} /></td>
              <td className="px-4 py-3"><Dot ok={d.dkimVerified} /></td>
              <td className="px-4 py-3"><Dot ok={d.dmarcVerified} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function ApiKeysList() {
  const [keys, setKeys] = useState<any[]>([]);
  useEffect(() => { api("/dashboard/api-keys").then((r) => setKeys(r.data)).catch(() => {}); }, []);

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-semibold text-white tracking-tight">API Keys</h1><p className="text-sm text-zinc-500 mt-1">Manage your API authentication keys</p></div>
      {keys.length === 0 ? <EmptyState title="No API keys" desc="Create an API key to start using the email API" /> : (
        <Table headers={["Name", "Key", "Rate Limit", "Last Used"]}>
          {keys.map((k) => (
            <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-3 text-white text-[13px] font-medium">{k.name}</td>
              <td className="px-4 py-3 text-zinc-500 text-[13px] font-mono">{k.keyPrefix}••••••••</td>
              <td className="px-4 py-3 text-zinc-400 text-[13px]">{k.rateLimit}/min</td>
              <td className="px-4 py-3 text-zinc-500 text-[13px]">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : <span className="text-zinc-700">Never</span>}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function WebhooksList() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  useEffect(() => { api("/dashboard/webhooks").then((r) => setWebhooks(r.data)).catch(() => {}); }, []);

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-semibold text-white tracking-tight">Webhooks</h1><p className="text-sm text-zinc-500 mt-1">Event notification endpoints</p></div>
      {webhooks.length === 0 ? <EmptyState title="No webhooks" desc="Register a webhook to receive delivery events" /> : (
        <Table headers={["URL", "Events", "Status"]}>
          {webhooks.map((w) => (
            <tr key={w.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-3 text-white text-[13px] font-mono truncate max-w-xs">{w.url}</td>
              <td className="px-4 py-3 text-zinc-400 text-[13px]">{Array.isArray(w.events) ? w.events.length : 0} events</td>
              <td className="px-4 py-3"><Badge variant={w.active ? "success" : "default"}>{w.active ? "Active" : "Inactive"}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="flex min-h-screen bg-[#09090b] antialiased">
      <Sidebar />
      <main className="flex-1 p-8 max-w-5xl">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="emails" element={<EmailsList />} />
          <Route path="domains" element={<DomainsList />} />
          <Route path="api-keys" element={<ApiKeysList />} />
          <Route path="webhooks" element={<WebhooksList />} />
        </Routes>
      </main>
    </div>
  );
}
