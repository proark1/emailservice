import { useState, useEffect } from "react";
import { Link, Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, post, del } from "../lib/api";

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: "/dashboard", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { to: "/dashboard/emails", label: "Emails", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
    { to: "/dashboard/domains", label: "Domains", icon: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" },
    { to: "/dashboard/api-keys", label: "API Keys", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
    { to: "/dashboard/webhooks", label: "Webhooks", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  ];

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="px-4 py-4 border-b border-gray-800">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-sm">MS</div>
          <span className="font-semibold text-white">MailStride</span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/dashboard"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${isActive ? "bg-indigo-500/10 text-indigo-400" : "text-gray-400 hover:text-white hover:bg-gray-800"}`
            }
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={l.icon} />
            </svg>
            {l.label}
          </NavLink>
        ))}
        {user?.role === "admin" && (
          <NavLink
            to="/admin"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-amber-400 hover:bg-gray-800 transition mt-4"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin Panel
          </NavLink>
        )}
      </nav>
      <div className="px-3 py-4 border-t border-gray-800">
        <div className="text-sm text-gray-400 px-3 mb-2 truncate">{user?.email}</div>
        <button
          onClick={async () => { await logout(); navigate("/"); }}
          className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { api("/dashboard/stats").then((r) => setStats(r.data)); }, []);

  if (!stats) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Emails Sent" value={stats.emails} />
        <StatCard label="Domains" value={stats.domains} />
        <StatCard label="API Keys" value={stats.api_keys} />
        <StatCard label="Webhooks" value={stats.webhooks} />
        <StatCard label="Audiences" value={stats.audiences} />
      </div>
    </div>
  );
}

function EmailsList() {
  const [emails, setEmails] = useState<any[]>([]);
  useEffect(() => { api("/dashboard/emails").then((r) => setEmails(r.data)); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Emails</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">To</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Subject</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {emails.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No emails sent yet</td></tr>
            )}
            {emails.map((e) => (
              <tr key={e.id} className="hover:bg-gray-800/30">
                <td className="px-4 py-3 text-white">{Array.isArray(e.toAddresses) ? e.toAddresses[0] : e.toAddresses}</td>
                <td className="px-4 py-3 text-gray-300">{e.subject}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    e.status === "sent" || e.status === "delivered" ? "bg-green-500/10 text-green-400" :
                    e.status === "failed" || e.status === "bounced" ? "bg-red-500/10 text-red-400" :
                    "bg-yellow-500/10 text-yellow-400"
                  }`}>{e.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-400">{new Date(e.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DomainsList() {
  const [domains, setDomains] = useState<any[]>([]);
  useEffect(() => { api("/dashboard/domains").then((r) => setDomains(r.data)); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Domains</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Domain</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">SPF</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">DKIM</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">DMARC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {domains.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No domains added yet</td></tr>
            )}
            {domains.map((d) => (
              <tr key={d.id} className="hover:bg-gray-800/30">
                <td className="px-4 py-3 text-white font-medium">{d.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    d.status === "verified" ? "bg-green-500/10 text-green-400" :
                    d.status === "failed" ? "bg-red-500/10 text-red-400" :
                    "bg-yellow-500/10 text-yellow-400"
                  }`}>{d.status}</span>
                </td>
                <td className="px-4 py-3">{d.spfVerified ? <Check /> : <X />}</td>
                <td className="px-4 py-3">{d.dkimVerified ? <Check /> : <X />}</td>
                <td className="px-4 py-3">{d.dmarcVerified ? <Check /> : <X />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Check() { return <span className="text-green-400 text-xs font-bold">YES</span>; }
function X() { return <span className="text-gray-600 text-xs">NO</span>; }

function ApiKeysList() {
  const [keys, setKeys] = useState<any[]>([]);
  useEffect(() => { api("/dashboard/api-keys").then((r) => setKeys(r.data)); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">API Keys</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Key</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Rate Limit</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Last Used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {keys.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No API keys created yet</td></tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="hover:bg-gray-800/30">
                <td className="px-4 py-3 text-white">{k.name}</td>
                <td className="px-4 py-3 text-gray-400 font-mono">{k.keyPrefix}••••••••</td>
                <td className="px-4 py-3 text-gray-400">{k.rateLimit}/min</td>
                <td className="px-4 py-3 text-gray-400">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WebhooksList() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  useEffect(() => { api("/dashboard/webhooks").then((r) => setWebhooks(r.data)); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Webhooks</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">URL</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Events</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {webhooks.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No webhooks configured yet</td></tr>
            )}
            {webhooks.map((w) => (
              <tr key={w.id} className="hover:bg-gray-800/30">
                <td className="px-4 py-3 text-white font-mono text-xs truncate max-w-xs">{w.url}</td>
                <td className="px-4 py-3 text-gray-400">{Array.isArray(w.events) ? w.events.length : 0} events</td>
                <td className="px-4 py-3">{w.active ? <Check /> : <X />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 p-8">
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
