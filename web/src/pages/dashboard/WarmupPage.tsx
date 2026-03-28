import { useState, useEffect } from "react";
import { api, post, del } from "../../lib/api";
import { Badge, statusVariant, EmptyState, Table, PageHeader, Button, Input, Modal, useConfirmDialog, useToast } from "../../components/ui";

interface Domain {
  id: string;
  name: string;
  status: string;
}

interface Warmup {
  id: string;
  domain_id: string;
  status: string;
  current_day: number;
  total_days: number;
  sent_today: number;
  target_today: number;
  total_sent: number;
  total_opens: number;
  total_replies: number;
  open_rate: number;
  reply_rate: number;
  progress_percent: number;
  from_address: string;
  ramp_schedule: number[];
  started_at: string;
  completed_at?: string;
  created_at: string;
}

interface DailyStats {
  day: number;
  sent: number;
  opened: number;
  replied: number;
  inbox: number;
  spam: number;
}

interface WarmupStats {
  schedule: Warmup;
  daily: DailyStats[];
  summary: {
    total_sent: number;
    total_opens: number;
    total_replies: number;
    open_rate: number;
    reply_rate: number;
    days_completed: number;
    days_remaining: number;
  };
}

function warmupVariant(s: string): "success" | "warning" | "error" | "default" {
  if (s === "completed") return "success";
  if (s === "active") return "warning";
  if (s === "cancelled") return "error";
  return "default";
}

export default function WarmupPage() {
  const [warmups, setWarmups] = useState<Warmup[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsData, setStatsData] = useState<WarmupStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [form, setForm] = useState({ domain_id: "", total_days: 30, from_address: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();

  const loadWarmups = () => {
    api("/dashboard/warmup").then((r) => setWarmups(r.data)).catch(() => {});
  };

  const loadDomains = () => {
    api("/dashboard/domains").then((r) => setDomains(r.data)).catch(() => {});
  };

  useEffect(() => { loadWarmups(); loadDomains(); }, []);

  const verifiedDomains = domains.filter((d) => d.status === "verified");

  const domainNameById = (id: string) => {
    const d = domains.find((d) => d.id === id);
    return d?.name || id;
  };

  const openCreate = () => {
    const defaultDomain = verifiedDomains[0];
    setForm({
      domain_id: defaultDomain?.id || "",
      total_days: 30,
      from_address: defaultDomain ? `warmup@${defaultDomain.name}` : "",
    });
    setError("");
    setCreateOpen(true);
  };

  const handleDomainChange = (domainId: string) => {
    const domain = verifiedDomains.find((d) => d.id === domainId);
    setForm({
      ...form,
      domain_id: domainId,
      from_address: domain ? `warmup@${domain.name}` : "",
    });
  };

  const startWarmup = async () => {
    setError(""); setCreating(true);
    try {
      const body: Record<string, any> = { domain_id: form.domain_id };
      if (form.total_days !== 30) body.total_days = form.total_days;
      if (form.from_address.trim()) body.from_address = form.from_address;
      await post("/dashboard/warmup", body);
      setCreateOpen(false);
      loadWarmups();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const pauseWarmup = async (id: string) => {
    try { await post(`/dashboard/warmup/${id}/pause`, {}); } catch (e: any) { showError(e.message || "Pause failed"); }
    loadWarmups();
  };

  const resumeWarmup = async (id: string) => {
    try { await post(`/dashboard/warmup/${id}/resume`, {}); } catch (e: any) { showError(e.message || "Resume failed"); }
    loadWarmups();
  };

  const cancelWarmup = (id: string) => {
    confirm({
      title: "Cancel this warmup?",
      message: "This cannot be undone. The warmup schedule will be permanently stopped.",
      confirmLabel: "Cancel Warmup",
      onConfirm: async () => {
        try { await del(`/dashboard/warmup/${id}`); } catch (e: any) { showError(e.message || "Cancel failed"); }
        loadWarmups();
      },
    });
  };

  const viewStats = async (w: Warmup) => {
    setStatsLoading(true);
    setStatsData(null);
    setStatsOpen(true);
    try {
      const res = await api(`/dashboard/warmup/${w.id}/stats`);
      setStatsData(res.data);
    } catch {
      setStatsData(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const hasVerifiedDomains = verifiedDomains.length > 0;

  return (
    <div>
      <PageHeader
        title="Email Warmup"
        desc="Build sender reputation for your domains"
        action={hasVerifiedDomains ? <Button onClick={openCreate}>+ Start Warmup</Button> : undefined}
      />

      {!hasVerifiedDomains && (
        <div className="mb-6 p-5 rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4.5 h-4.5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-amber-600">Setup required</h3>
              <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
                You need at least one verified domain before starting email warmup.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Start Warmup Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Start Email Warmup">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Domain</label>
            <select
              value={form.domain_id}
              onChange={(e) => handleDomainChange(e.target.value)}
              className="w-full h-10 px-3.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
            >
              <option value="">Select a domain</option>
              {verifiedDomains.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Duration: {form.total_days} days</label>
            <input
              type="range"
              min={7}
              max={90}
              value={form.total_days}
              onChange={(e) => setForm({ ...form, total_days: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
            />
            <div className="flex justify-between text-[11px] text-gray-400 mt-1">
              <span>7 days</span>
              <span>90 days</span>
            </div>
          </div>

          <Input
            label="From address"
            placeholder="warmup@yourdomain.com"
            value={form.from_address}
            onChange={(e) => setForm({ ...form, from_address: (e.target as HTMLInputElement).value })}
          />

          <Button
            onClick={startWarmup}
            disabled={creating || !form.domain_id}
          >
            {creating ? "Starting..." : "Start Warmup"}
          </Button>
        </div>
      </Modal>

      {/* Stats Modal */}
      <Modal open={statsOpen} onClose={() => setStatsOpen(false)} title="Warmup Stats">
        {statsLoading && (
          <div className="py-8 text-center text-[13px] text-gray-500">Loading stats...</div>
        )}
        {!statsLoading && !statsData && (
          <div className="py-8 text-center text-[13px] text-gray-500">Failed to load stats.</div>
        )}
        {statsData && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{statsData.summary.total_sent.toLocaleString()}</p>
                <p className="text-[11px] text-gray-500">Total Sent</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">{statsData.summary.open_rate.toFixed(1)}%</p>
                <p className="text-[11px] text-gray-500">Open Rate</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                <p className="text-lg font-bold text-violet-600">{statsData.summary.reply_rate.toFixed(1)}%</p>
                <p className="text-[11px] text-gray-500">Reply Rate</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{statsData.summary.days_completed} / {statsData.summary.days_completed + statsData.summary.days_remaining}</p>
                <p className="text-[11px] text-gray-500">Days Complete</p>
              </div>
            </div>

            {/* Progress visualization */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-3">Ramp Progress</p>
              <div className="flex items-end gap-[2px] h-16">
                {statsData.schedule.ramp_schedule.map((target, i) => {
                  const maxTarget = Math.max(...statsData.schedule.ramp_schedule);
                  const heightPct = maxTarget > 0 ? (target / maxTarget) * 100 : 0;
                  const daily = statsData.daily.find((d) => d.day === i + 1);
                  const actualPct = daily && maxTarget > 0 ? (daily.sent / maxTarget) * 100 : 0;
                  const isPast = i < statsData.summary.days_completed;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative" title={`Day ${i + 1}: ${daily?.sent ?? 0} / ${target}`}>
                      {/* Target bar (background) */}
                      <div
                        className="w-full rounded-sm bg-gray-200 absolute bottom-0"
                        style={{ height: `${heightPct}%` }}
                      />
                      {/* Actual bar (foreground) */}
                      {isPast && (
                        <div
                          className="w-full rounded-sm bg-violet-500 absolute bottom-0"
                          style={{ height: `${actualPct}%` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] text-gray-400 mt-2">
                <span>Day 1</span>
                <span>Day {statsData.schedule.total_days}</span>
              </div>
            </div>

            {/* Daily Breakdown Table */}
            {statsData.daily.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50 sticky top-0">
                        <th className="text-left px-3 py-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider">Day</th>
                        <th className="text-left px-3 py-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider">Sent</th>
                        <th className="text-left px-3 py-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider">Opens</th>
                        <th className="text-left px-3 py-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider">Replies</th>
                        <th className="text-left px-3 py-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider">Inbox</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statsData.daily.map((d) => (
                        <tr key={d.day}>
                          <td className="px-3 py-2 text-[12px] text-gray-900 font-medium">{d.day}</td>
                          <td className="px-3 py-2 text-[12px] text-gray-500">{d.sent}</td>
                          <td className="px-3 py-2 text-[12px] text-gray-500">{d.opened}</td>
                          <td className="px-3 py-2 text-[12px] text-gray-500">{d.replied}</td>
                          <td className="px-3 py-2 text-[12px] text-gray-500">
                            {d.sent > 0 ? `${Math.round((d.inbox / d.sent) * 100)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button variant="secondary" onClick={() => setStatsOpen(false)}>Close</Button>
          </div>
        )}
      </Modal>

      {/* Warmups List */}
      {warmups.length === 0 ? (
        <EmptyState
          title="No warmups yet"
          desc={hasVerifiedDomains ? "Start a warmup to build sender reputation for your domains" : "Verify a domain first, then start a warmup"}
        />
      ) : (
        <div className="space-y-3">
          {warmups.map((w) => (
            <div key={w.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-[14px] font-semibold text-gray-900">{domainNameById(w.domain_id)}</h3>
                  <Badge variant={warmupVariant(w.status)}>{w.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {w.status === "active" && (
                    <button onClick={() => pauseWarmup(w.id)} className="text-[12px] text-amber-600 hover:text-amber-700 font-medium transition-colors">
                      Pause
                    </button>
                  )}
                  {w.status === "paused" && (
                    <button onClick={() => resumeWarmup(w.id)} className="text-[12px] text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                      Resume
                    </button>
                  )}
                  <button onClick={() => viewStats(w)} className="text-[12px] text-violet-600 hover:text-violet-700 font-medium transition-colors">
                    View Stats
                  </button>
                  {(w.status === "active" || w.status === "paused") && (
                    <button onClick={() => cancelWarmup(w.id)} className="text-[12px] text-red-500 hover:text-red-600 font-medium transition-colors">
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${w.progress_percent}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-gray-500">
                <span>Day {w.current_day} of {w.total_days}</span>
                <span>{w.progress_percent}% complete</span>
                <span>Sent today: {w.sent_today} / {w.target_today}</span>
                <span>Open rate: {w.open_rate.toFixed(1)}%</span>
                <span>Reply rate: {w.reply_rate.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
      {toast}
    </div>
  );
}
