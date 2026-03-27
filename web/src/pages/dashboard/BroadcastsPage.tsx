import { useState, useEffect } from "react";
import { api, post, del } from "../../lib/api";
import { Badge, statusVariant, EmptyState, Table, PageHeader, Button, Input, Textarea, Modal } from "../../components/ui";

interface Broadcast {
  id: string;
  name: string;
  audienceId: string;
  audienceName?: string;
  from: string;
  subject: string;
  status: string;
  totalCount?: number;
  sentCount?: number;
  failedCount?: number;
  html?: string;
  text?: string;
  sentAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface Audience {
  id: string;
  name: string;
  contactCount?: number;
}

interface Domain {
  id: string;
  name: string;
  status: string;
}

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailBroadcast, setDetailBroadcast] = useState<Broadcast | null>(null);
  const [form, setForm] = useState({ name: "", audience_id: "", from: "", subject: "", html: "", text: "" });
  const [showText, setShowText] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadBroadcasts = () => {
    api("/dashboard/broadcasts").then((r) => setBroadcasts(r.data)).catch(() => {});
  };

  const loadSupporting = () => {
    api("/dashboard/audiences").then((r) => setAudiences(r.data)).catch(() => {});
    api("/dashboard/domains").then((r) => setDomains(r.data)).catch(() => {});
  };

  useEffect(() => { loadBroadcasts(); loadSupporting(); }, []);

  const verifiedDomains = domains.filter((d) => d.status === "verified");

  const openCreate = () => {
    setForm({ name: "", audience_id: "", from: "", subject: "", html: "", text: "" });
    setShowText(false);
    setError("");
    setCreateOpen(true);
  };

  const createBroadcast = async () => {
    setError(""); setCreating(true);
    try {
      const body: Record<string, string> = {
        name: form.name,
        audience_id: form.audience_id,
        from: form.from,
        subject: form.subject,
      };
      if (form.html.trim()) body.html = form.html;
      if (form.text.trim()) body.text = form.text;
      await post("/dashboard/broadcasts", body);
      setCreateOpen(false);
      loadBroadcasts();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const deleteBroadcast = async (id: string) => {
    if (!window.confirm("Delete this broadcast?")) return;
    try { await del(`/dashboard/broadcasts/${id}`); } catch (e: any) { alert(e.message || "Delete failed"); }
    loadBroadcasts();
  };

  const openDetail = async (b: Broadcast) => {
    try {
      const res = await api(`/dashboard/broadcasts/${b.id}`);
      setDetailBroadcast(res.data);
    } catch {
      setDetailBroadcast(b);
    }
  };

  const progressPercent = (b: Broadcast) => {
    const total = b.totalCount || 0;
    if (total === 0) return 0;
    return Math.round(((b.sentCount || 0) / total) * 100);
  };

  const audienceNameById = (id: string) => {
    const a = audiences.find((a) => a.id === id);
    return a?.name || id;
  };

  const hasVerifiedDomains = verifiedDomains.length > 0;

  return (
    <div>
      <PageHeader
        title="Broadcasts"
        desc="Send emails to your audiences"
        action={hasVerifiedDomains && audiences.length > 0 ? <Button onClick={openCreate}>+ New Broadcast</Button> : undefined}
      />

      {(!hasVerifiedDomains || audiences.length === 0) && (
        <div className="mb-6 p-5 rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4.5 h-4.5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-amber-600">Setup required</h3>
              <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
                {!hasVerifiedDomains && "You need at least one verified domain. "}
                {audiences.length === 0 && "You need at least one audience with contacts. "}
                Complete these steps to create a broadcast.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Create Broadcast Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Broadcast">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Campaign name" placeholder="March newsletter" value={form.name} onChange={(e) => setForm({ ...form, name: (e.target as HTMLInputElement).value })} />

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Audience</label>
            <select
              value={form.audience_id}
              onChange={(e) => setForm({ ...form, audience_id: e.target.value })}
              className="w-full h-10 px-3.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
            >
              <option value="">Select an audience</option>
              {audiences.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.contactCount ?? 0} contacts)</option>
              ))}
            </select>
          </div>

          <div>
            <Input label="From address" placeholder="you@yourdomain.com" value={form.from} onChange={(e) => setForm({ ...form, from: (e.target as HTMLInputElement).value })} />
            {verifiedDomains.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">Verified domains: {verifiedDomains.map((d) => d.name).join(", ")}</p>
            )}
          </div>

          <Input label="Subject line" placeholder="Your weekly update" value={form.subject} onChange={(e) => setForm({ ...form, subject: (e.target as HTMLInputElement).value })} />

          <Textarea label="HTML body" placeholder="<h1>Hello {{first_name}}!</h1>" rows={5} value={form.html} onChange={(e) => setForm({ ...form, html: (e.target as HTMLTextAreaElement).value })} />

          {!showText ? (
            <button onClick={() => setShowText(true)} className="text-[12px] text-violet-600 hover:text-violet-700 font-medium transition-colors">
              + Add plain text body
            </button>
          ) : (
            <Textarea label="Text body (optional)" placeholder="Hello {{first_name}}!" rows={3} value={form.text} onChange={(e) => setForm({ ...form, text: (e.target as HTMLTextAreaElement).value })} />
          )}

          <Button
            onClick={createBroadcast}
            disabled={creating || !form.name.trim() || !form.audience_id || !form.from.trim() || !form.subject.trim()}
          >
            {creating ? "Sending..." : "Send Broadcast"}
          </Button>
        </div>
      </Modal>

      {/* Broadcast Detail Modal */}
      <Modal open={!!detailBroadcast} onClose={() => setDetailBroadcast(null)} title="Broadcast Details">
        {detailBroadcast && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Name</p>
                <p className="text-[13px] text-gray-900 mt-0.5">{detailBroadcast.name}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Status</p>
                <div className="mt-0.5"><Badge variant={statusVariant(detailBroadcast.status)}>{detailBroadcast.status}</Badge></div>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">From</p>
                <p className="text-[13px] text-gray-900 mt-0.5">{detailBroadcast.from}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Subject</p>
                <p className="text-[13px] text-gray-900 mt-0.5">{detailBroadcast.subject}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Audience</p>
                <p className="text-[13px] text-gray-900 mt-0.5">{detailBroadcast.audienceName || audienceNameById(detailBroadcast.audienceId)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Created</p>
                <p className="text-[13px] text-gray-900 mt-0.5">{new Date(detailBroadcast.createdAt).toLocaleString()}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-3">Delivery Stats</p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{detailBroadcast.totalCount ?? 0}</p>
                  <p className="text-[11px] text-gray-500">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-emerald-600">{detailBroadcast.sentCount ?? 0}</p>
                  <p className="text-[11px] text-gray-500">Sent</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-600">{detailBroadcast.failedCount ?? 0}</p>
                  <p className="text-[11px] text-gray-500">Failed</p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent(detailBroadcast)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5 text-right">{progressPercent(detailBroadcast)}% complete</p>
            </div>

            {/* Timestamps */}
            {(detailBroadcast.sentAt || detailBroadcast.completedAt) && (
              <div className="flex gap-4 text-[12px] text-gray-500">
                {detailBroadcast.sentAt && <span>Sent: {new Date(detailBroadcast.sentAt).toLocaleString()}</span>}
                {detailBroadcast.completedAt && <span>Completed: {new Date(detailBroadcast.completedAt).toLocaleString()}</span>}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDetailBroadcast(null)}>Close</Button>
              <Button variant="danger" onClick={() => { setDetailBroadcast(null); deleteBroadcast(detailBroadcast.id); }}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>

      {broadcasts.length === 0 ? (
        <EmptyState title="No broadcasts yet" desc={hasVerifiedDomains && audiences.length > 0 ? "Click New Broadcast to send to an audience" : "Set up a verified domain and audience first"} />
      ) : (
        <Table headers={["Name", "Audience", "Status", "Sent / Total", "Date"]}>
          {broadcasts.map((b) => (
            <tr key={b.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(b)}>
              <td className="px-4 py-3 text-gray-900 text-[13px] font-medium">{b.name}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{b.audienceName || audienceNameById(b.audienceId)}</td>
              <td className="px-4 py-3"><Badge variant={statusVariant(b.status)}>{b.status}</Badge></td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{b.sentCount ?? 0} / {b.totalCount ?? 0}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{new Date(b.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
