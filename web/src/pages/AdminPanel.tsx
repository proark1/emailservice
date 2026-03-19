import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, patch, del } from "../lib/api";

export default function AdminPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview" | "accounts">("overview");

  useEffect(() => {
    api("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
    api("/admin/accounts").then((r) => setAccounts(r.data)).catch(() => {});
  }, []);

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
