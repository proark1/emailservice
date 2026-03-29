import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { api, post, del } from "../../lib/api";
import { RichEditor, wrapEmailHtml } from "../../components/RichEditor";
import {
  Badge,
  statusVariant,
  EmptyState,
  Table,
  PageHeader,
  Button,
  Input,
  Textarea,
  Modal,
  CopyButton,
  Dot,
  useConfirmDialog,
  useToast,
} from "../../components/ui";

/* ---------- types ---------- */

type Email = {
  id: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string;
  status: string;
  htmlBody?: string;
  textBody?: string;
  openCount?: number;
  clickCount?: number;
  tags?: Record<string, string>;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  scheduledAt?: string;
};

type EmailEvent = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  created_at: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type Domain = {
  id: string;
  name: string;
  status: string;
};

const STATUS_TABS = ["all", "queued", "scheduled", "sent", "delivered", "bounced", "failed"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/* ---------- helpers ---------- */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatFullDate(dateStr: string | undefined): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function eventDotClass(type: string): string {
  switch (type) {
    case "delivered": return "border-green-500 bg-green-500";
    case "sent": return "border-emerald-400 bg-emerald-400";
    case "queued": return "border-gray-400 bg-gray-400";
    case "bounced": return "border-red-500 bg-red-500";
    case "soft_bounced": return "border-orange-400 bg-orange-400";
    case "failed": return "border-red-600 bg-red-600";
    case "opened": return "border-blue-500 bg-blue-500";
    case "clicked": return "border-cyan-500 bg-cyan-500";
    case "complained": return "border-amber-500 bg-amber-500";
    case "deferred": return "border-yellow-400 bg-yellow-400";
    default: return "border-gray-300 bg-gray-300";
  }
}

/* ---------- main component ---------- */

export default function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainFilter, setDomainFilter] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [detailEmail, setDetailEmail] = useState<Email | null>(null);
  const [detailEvents, setDetailEvents] = useState<EmailEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [form, setForm] = useState({ from: "", to: "", cc: "", bcc: "", subject: "", html: "", scheduledAt: "" });
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(600);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const verifiedDomains = domains.filter((d) => d.status === "verified");
  const hasDomains = verifiedDomains.length > 0;

  /* --- data loading --- */

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (activeTab === "scheduled") params.set("status", "queued");
      else if (activeTab !== "all") params.set("status", activeTab);
      if (domainFilter) params.set("domain_id", domainFilter);
      params.set("page", String(page));
      params.set("limit", "50");
      const res = await api<{ data: Email[]; pagination: Pagination }>(`/dashboard/emails?${params}`);
      if (activeTab === "scheduled") {
        const scheduled = res.data.filter((e: Email) => e.scheduledAt && new Date(e.scheduledAt) > new Date());
        setEmails(scheduled);
        if (res.pagination) setPagination({ ...res.pagination, total: scheduled.length, pages: 1 });
      } else {
        setEmails(res.data);
        if (res.pagination) setPagination(res.pagination);
      }
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, activeTab, page, domainFilter]);

  const loadCounts = useCallback(async () => {
    try {
      const counts: Record<string, number> = {};
      const allRes = await api<{ data: Email[]; pagination: Pagination }>("/dashboard/emails?limit=1");
      counts.all = allRes.pagination?.total ?? 0;
      await Promise.all(
        STATUS_TABS.filter((s) => s !== "all" && s !== "scheduled").map(async (status) => {
          try {
            const res = await api<{ data: Email[]; pagination: Pagination }>(`/dashboard/emails?status=${status}&limit=1`);
            counts[status] = res.pagination?.total ?? 0;
          } catch {
            counts[status] = 0;
          }
        })
      );
      // For "scheduled" tab, we fetch queued emails and count those with future scheduledAt
      try {
        const queuedRes = await api<{ data: Email[] }>("/dashboard/emails?status=queued&limit=100");
        counts.scheduled = queuedRes.data.filter((e: Email) => e.scheduledAt && new Date(e.scheduledAt) > new Date()).length;
      } catch { counts.scheduled = 0; }
      setStatusCounts(counts);
    } catch {
      // silent
    }
  }, []);

  const loadDomains = useCallback(async () => {
    try {
      const res = await api<{ data: Domain[] }>("/dashboard/domains");
      setDomains(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadDomains();
    loadCounts();
  }, [loadDomains, loadCounts]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  /* --- load events when detail modal opens --- */

  useEffect(() => {
    if (!detailEmail) {
      setDetailEvents([]);
      return;
    }
    const loadEvents = async () => {
      setEventsLoading(true);
      try {
        const res = await api<{ data: EmailEvent[] }>(`/dashboard/emails/${detailEmail.id}/events`);
        setDetailEvents(res.data);
      } catch {
        setDetailEvents([]);
      } finally {
        setEventsLoading(false);
      }
    };
    loadEvents();
  }, [detailEmail?.id]);

  /* --- search debounce --- */

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  const handleTabChange = (tab: StatusTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  /* --- compose --- */

  const resetCompose = () => {
    setForm({ from: "", to: "", cc: "", bcc: "", subject: "", html: "", scheduledAt: "" });
    setShowCcBcc(false);
    setComposeError("");
    setPreviewMode(false);
    setPreviewWidth(600);
  };

  const handleSend = async () => {
    setComposeError("");
    setSending(true);
    try {
      const htmlContent = form.html ? wrapEmailHtml(form.html) : undefined;
      const body: Record<string, any> = {
        from: form.from,
        to: form.to,
        subject: form.subject,
        html: htmlContent,
        text: htmlContent ? undefined : " ",
      };
      if (form.cc.trim()) body.cc = form.cc.split(",").map((s: string) => s.trim()).filter(Boolean).join(",");
      if (form.bcc.trim()) body.bcc = form.bcc.split(",").map((s: string) => s.trim()).filter(Boolean).join(",");
      if (form.scheduledAt) body.scheduled_at = new Date(form.scheduledAt).toISOString();
      await post("/dashboard/emails", body);
      setComposeOpen(false);
      resetCompose();
      loadEmails();
      loadCounts();
    } catch (e: any) {
      setComposeError(e.message);
    } finally {
      setSending(false);
    }
  };

  /* ---------- render ---------- */

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Emails"
        desc="Send and track your emails"
        action={
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search by recipient or subject..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="h-10 w-64 pl-9 pr-3.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
              />
            </div>
            {domains.length > 1 && (
              <select
                value={domainFilter}
                onChange={(e) => { setDomainFilter(e.target.value); setPage(1); }}
                className="h-10 px-3 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
              >
                <option value="">All domains</option>
                {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <Button onClick={() => { resetCompose(); setComposeOpen(true); }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Compose
            </Button>
          </div>
        }
      />

      {/* Domain warning */}
      {!hasDomains && (
        <div className="mb-6 p-5 rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4.5 h-4.5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-amber-600">Connect a domain to start sending and receiving</h3>
              <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
                Add a domain and complete DNS verification (SPF, DKIM, DMARC for sending + MX for receiving). After verification, it takes about 5-10 minutes for the email service to become fully active.
              </p>
              <Link
                to="/dashboard/domains"
                className="inline-flex items-center gap-1 mt-3 text-[13px] font-medium text-violet-600 hover:text-violet-700 transition-colors"
              >
                Go to Domains
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium capitalize whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              activeTab === tab
                ? "border-violet-600 text-violet-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab}
            {statusCounts[tab] !== undefined && (
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-medium ${
                  activeTab === tab ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {statusCounts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Email list */}
      {loading && emails.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : emails.length === 0 ? (
        <EmptyState
          title={search ? "No emails match your search" : "No emails yet"}
          desc={search ? "Try adjusting your search or filters" : hasDomains ? "Click Compose to send your first email" : "Connect a verified domain first"}
        />
      ) : (
        <>
          <Table headers={["To", "Subject", "Status", ...(activeTab === "scheduled" ? ["Scheduled For"] : []), "Opens", "Clicks", "Date"]}>
            {emails.map((e) => (
              <tr
                key={e.id}
                onClick={() => setDetailEmail(e)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-gray-900 text-[13px] font-medium max-w-[200px] truncate">
                  {Array.isArray(e.toAddresses) && e.toAddresses.length > 0 ? e.toAddresses[0] : "\u2014"}
                  {Array.isArray(e.toAddresses) && e.toAddresses.length > 1 && (
                    <span className="ml-1 text-[11px] text-gray-400">+{e.toAddresses.length - 1}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 text-[13px] max-w-[300px] truncate">{e.subject || "\u2014"}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                </td>
                {activeTab === "scheduled" && (
                  <td className="px-4 py-3 text-gray-500 text-[13px] whitespace-nowrap">{e.scheduledAt ? formatFullDate(e.scheduledAt) : "\u2014"}</td>
                )}
                <td className="px-4 py-3 text-gray-500 text-[13px] tabular-nums">{e.openCount ?? 0}</td>
                <td className="px-4 py-3 text-gray-500 text-[13px] tabular-nums">{e.clickCount ?? 0}</td>
                <td className="px-4 py-3 text-gray-500 text-[13px] whitespace-nowrap">{formatDate(e.createdAt)}</td>
              </tr>
            ))}
          </Table>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-[13px] text-gray-500">
                Page {pagination.page} of {pagination.pages}
                <span className="ml-2 text-gray-400">({pagination.total} total)</span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                >
                  Next
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Email detail modal */}
      <Modal open={!!detailEmail} onClose={() => setDetailEmail(null)} title="Email Details">
        {detailEmail && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Status and tracking stats */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={statusVariant(detailEmail.status)}>{detailEmail.status}</Badge>
              {(detailEmail.openCount ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-[12px] text-gray-500">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {detailEmail.openCount} open{detailEmail.openCount !== 1 ? "s" : ""}
                </span>
              )}
              {(detailEmail.clickCount ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-[12px] text-gray-500">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                  </svg>
                  {detailEmail.clickCount} click{detailEmail.clickCount !== 1 ? "s" : ""}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {detailEmail.status === "failed" && (
                  <Button variant="secondary" onClick={async () => {
                    try {
                      await post(`/dashboard/emails/${detailEmail.id}/retry`, {});
                      setDetailEmail(null);
                      loadEmails();
                      loadCounts();
                    } catch (e: any) { showError(e.message); }
                  }}>Retry Send</Button>
                )}
                {(detailEmail.status === "queued" && detailEmail.scheduledAt) && (
                  <Button variant="secondary" onClick={() => {
                    confirm({
                      title: "Cancel this scheduled email?",
                      message: "The email will not be sent.",
                      confirmLabel: "Cancel Email",
                      onConfirm: async () => {
                        try {
                          await del(`/dashboard/emails/${detailEmail.id}`);
                          setDetailEmail(null);
                          loadEmails();
                          loadCounts();
                        } catch (e: any) { showError(e.message); }
                      },
                    });
                  }}>Cancel Scheduled</Button>
                )}
                <CopyButton text={detailEmail.id} />
              </div>
            </div>

            {/* Address fields */}
            <div className="space-y-2.5 rounded-xl bg-gray-50 border border-gray-100 p-3.5">
              <DetailRow label="From" value={detailEmail.fromName ? `${detailEmail.fromName} <${detailEmail.fromAddress}>` : detailEmail.fromAddress} />
              <DetailRow label="To" value={detailEmail.toAddresses?.join(", ") ?? "\u2014"} />
              {detailEmail.ccAddresses && detailEmail.ccAddresses.length > 0 && (
                <DetailRow label="CC" value={detailEmail.ccAddresses.join(", ")} />
              )}
              {detailEmail.bccAddresses && detailEmail.bccAddresses.length > 0 && (
                <DetailRow label="BCC" value={detailEmail.bccAddresses.join(", ")} />
              )}
              <DetailRow label="Subject" value={detailEmail.subject || "\u2014"} />
            </div>

            {/* Tags */}
            {detailEmail.tags && Object.keys(detailEmail.tags).length > 0 && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(detailEmail.tags).map(([key, val]) => (
                    <span key={key} className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                      {key}: {val}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* HTML preview */}
            {detailEmail.htmlBody && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">Preview</p>
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                  <iframe
                    sandbox=""
                    srcDoc={detailEmail.htmlBody}
                    title="Email preview"
                    className="w-full h-56 border-0"
                  />
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">Timeline</p>
              <DetailRow label="Created" value={formatFullDate(detailEmail.createdAt)} />
              {detailEmail.sentAt && <DetailRow label="Sent" value={formatFullDate(detailEmail.sentAt)} />}
              {detailEmail.deliveredAt && <DetailRow label="Delivered" value={formatFullDate(detailEmail.deliveredAt)} />}
              {detailEmail.scheduledAt && <DetailRow label="Scheduled" value={formatFullDate(detailEmail.scheduledAt)} />}
            </div>

            {/* Event Timeline */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">Event Log</p>
              {eventsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detailEvents.length === 0 ? (
                <p className="text-[13px] text-gray-400 py-2">No events recorded yet</p>
              ) : (
                <div className="relative ml-2">
                  {/* Vertical line */}
                  <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200" />
                  <div className="space-y-3">
                    {detailEvents.map((evt) => (
                      <div key={evt.id} className="flex items-start gap-3 relative">
                        <div
                          className={`w-[11px] h-[11px] rounded-full border-2 shrink-0 mt-0.5 z-10 ${eventDotClass(evt.type)}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-gray-900 capitalize">
                              {evt.type.replace(/_/g, " ")}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {formatFullDate(evt.created_at)}
                            </span>
                          </div>
                          {evt.data && Object.keys(evt.data).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(evt.data).map(([key, val]) => (
                                <span
                                  key={key}
                                  className="inline-flex px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-500 border border-gray-150"
                                >
                                  {key}: {String(val)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Compose modal */}
      <Modal
        open={composeOpen}
        onClose={() => { setComposeOpen(false); setComposeError(""); }}
        title="Compose Email"
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {composeError && (
            <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px] flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {composeError}
            </div>
          )}

          {!hasDomains && (
            <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[13px] flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              No verified domains found. You need a verified domain to send emails.
            </div>
          )}

          <div>
            <Input
              label="From"
              placeholder={hasDomains ? `you@${verifiedDomains[0]?.name}` : "you@yourdomain.com"}
              value={form.from}
              onChange={(e) => setForm({ ...form, from: (e.target as HTMLInputElement).value })}
            />
            {verifiedDomains.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                <span className="text-[11px] text-gray-400">Domains:</span>
                {verifiedDomains.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      const localPart = form.from.split("@")[0] || "you";
                      setForm({ ...form, from: `${localPart}@${d.name}` });
                    }}
                    className="text-[11px] text-violet-600 hover:text-violet-700 font-medium cursor-pointer transition-colors"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Input
            label="To"
            placeholder="recipient@example.com (comma-separated)"
            value={form.to}
            onChange={(e) => setForm({ ...form, to: (e.target as HTMLInputElement).value })}
          />

          {!showCcBcc ? (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="text-[12px] text-violet-600 hover:text-violet-700 font-medium transition-colors cursor-pointer"
            >
              + Add CC / BCC
            </button>
          ) : (
            <>
              <Input
                label="CC"
                placeholder="cc@example.com (comma-separated)"
                value={form.cc}
                onChange={(e) => setForm({ ...form, cc: (e.target as HTMLInputElement).value })}
              />
              <Input
                label="BCC"
                placeholder="bcc@example.com (comma-separated)"
                value={form.bcc}
                onChange={(e) => setForm({ ...form, bcc: (e.target as HTMLInputElement).value })}
              />
            </>
          )}

          <Input
            label="Subject"
            placeholder="Email subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: (e.target as HTMLInputElement).value })}
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[13px] font-medium text-gray-700">Body</label>
              <button type="button" onClick={() => setPreviewMode(!previewMode)} className="text-[12px] text-violet-600 hover:text-violet-700 font-medium cursor-pointer transition-colors">
                {previewMode ? "Edit" : "Preview"}
              </button>
            </div>
            {previewMode ? (
              <div>
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setPreviewWidth(600)} className={`text-[12px] px-2 py-1 rounded-md cursor-pointer transition-colors ${previewWidth === 600 ? "bg-violet-100 text-violet-700" : "text-gray-500"}`}>Desktop</button>
                  <button onClick={() => setPreviewWidth(375)} className={`text-[12px] px-2 py-1 rounded-md cursor-pointer transition-colors ${previewWidth === 375 ? "bg-violet-100 text-violet-700" : "text-gray-500"}`}>Mobile</button>
                </div>
                <div className="flex justify-center bg-gray-100 rounded-xl p-4">
                  <iframe
                    srcDoc={wrapEmailHtml(form.html)}
                    sandbox=""
                    title="Preview"
                    className="border border-gray-200 rounded-lg bg-white"
                    style={{ width: previewWidth, height: 400 }}
                  />
                </div>
              </div>
            ) : (
              <RichEditor
                value={form.html}
                onChange={(html) => setForm({ ...form, html })}
                placeholder="Write your email content..."
                minHeight="180px"
              />
            )}
          </div>

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Schedule (optional)</label>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              className="w-full h-10 px-3.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
            />
            {form.scheduledAt && (
              <p className="text-[11px] text-gray-400 mt-1">
                Email will be sent at {new Date(form.scheduledAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <Button onClick={handleSend} disabled={sending || !form.from || !form.to || !form.subject}>
              {sending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : form.scheduledAt ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Schedule Email
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                  Send Email
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={async () => {
              try {
                const body: any = {};
                if (form.from) body.from = form.from;
                if (form.to) body.to = form.to.split(",").map((s: string) => s.trim()).filter(Boolean);
                if (form.subject) body.subject = form.subject;
                if (form.html) body.html = form.html;
                await post("/dashboard/drafts", body);
                setComposeOpen(false);
                setComposeError("");
              } catch (err: any) {
                setComposeError(err.message || "Failed to save draft");
              }
            }}>
              Save as Draft
            </Button>
            <Button variant="secondary" onClick={() => { setComposeOpen(false); setComposeError(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
      {confirmDialog}
      {toast}
    </div>
  );
}

/* ---------- sub-components ---------- */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wider w-20 shrink-0">{label}</span>
      <span className="text-[13px] text-gray-900 break-all">{value}</span>
    </div>
  );
}
