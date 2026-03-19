import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, patch, del } from "../lib/api";

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

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
    if (!confirm("Delete this account? This cannot be undone.")) return;
    await del(`/admin/${id}`);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Admin header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-sm text-white">MS</div>
              <span className="font-semibold text-white">MailStride</span>
            </Link>
            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-xs font-medium rounded">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition">Dashboard</Link>
            <button
              onClick={async () => { await logout(); navigate("/"); }}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-gray-900 rounded-lg p-1 inline-flex">
          <button
            onClick={() => setTab("overview")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === "overview" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
          >
            System Overview
          </button>
          <button
            onClick={() => setTab("accounts")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === "accounts" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Accounts ({accounts.length})
          </button>
        </div>

        {/* Overview Tab */}
        {tab === "overview" && stats && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">System Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Total Accounts" value={stats.accounts} color="text-white" />
              <StatCard label="Total Domains" value={stats.domains} color="text-indigo-400" />
              <StatCard label="Total Emails" value={stats.emails} color="text-green-400" />
              <StatCard label="Total API Keys" value={stats.api_keys} color="text-amber-400" />
              <StatCard label="Total Webhooks" value={stats.webhooks} color="text-purple-400" />
            </div>
          </div>
        )}

        {/* Accounts Tab */}
        {tab === "accounts" && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">All Accounts</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Role</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Created</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-white">{a.name}</td>
                      <td className="px-4 py-3 text-gray-300">{a.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          a.role === "admin" ? "bg-amber-500/10 text-amber-400" : "bg-gray-700 text-gray-300"
                        }`}>{a.role}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => toggleRole(a.id, a.role)}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                          disabled={a.id === user?.id}
                        >
                          {a.role === "admin" ? "Demote" : "Promote"}
                        </button>
                        {a.id !== user?.id && (
                          <button
                            onClick={() => removeAccount(a.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        )}
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
