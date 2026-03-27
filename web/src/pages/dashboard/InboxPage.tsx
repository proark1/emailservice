import { useState, useEffect, useCallback, useRef } from "react";
import { api, post, patch, del } from "../../lib/api";
import { Badge, Button, Input, Textarea } from "../../components/ui";

type InboxEmail = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  ccAddresses: string[] | null;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  messageId: string | null;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  createdAt: string;
};

type FilterTab = "all" | "unread" | "starred" | "archived";

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(d).toLocaleDateString();
};

const getInitials = (name: string | null, email: string): string => {
  const source = name || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.charAt(0).toUpperCase();
};

const avatarGradients = [
  "from-violet-100 to-indigo-100 text-violet-600",
  "from-sky-100 to-cyan-100 text-sky-600",
  "from-emerald-100 to-teal-100 text-emerald-600",
  "from-amber-100 to-orange-100 text-amber-600",
  "from-rose-100 to-pink-100 text-rose-600",
  "from-fuchsia-100 to-purple-100 text-fuchsia-600",
];

const avatarColor = (email: string) => {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0;
  return avatarGradients[Math.abs(h) % avatarGradients.length];
};

/* ---------- tiny icon components ---------- */
const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg className="w-4 h-4" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
);
const ArchiveIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
  </svg>
);
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);
const ReplyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
  </svg>
);
const SendIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);
const BackIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
);
const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
  </svg>
);
const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const filterTabs: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "starred", label: "Starred" },
  { key: "archived", label: "Archived" },
];

export default function InboxPage() {
  const [items, setItems] = useState<InboxEmail[]>([]);
  const [selected, setSelected] = useState<InboxEmail | null>(null);
  const [domainsList, setDomainsList] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyForm, setReplyForm] = useState({ from: "", body: "" });
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const verifiedDomains = domainsList.filter((d: any) => d.status === "verified");

  /* ---- data fetching ---- */
  const fetchEmails = useCallback(
    async (p: number, s: string, f: FilterTab, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (s) params.set("search", s);
        if (f !== "all") params.set("filter", f);
        params.set("page", String(p));
        params.set("limit", "50");
        const res = await api(`/dashboard/inbox?${params}`);
        if (append) {
          setItems((prev) => [...prev, ...(res.data ?? [])]);
        } else {
          setItems(res.data ?? []);
        }
        if (res.pagination) setPagination(res.pagination);
      } catch {
        if (!append) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchDomains = useCallback(async () => {
    try {
      const res = await api("/dashboard/domains");
      setDomainsList(res.data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchEmails(1, "", "all");
    fetchDomains();
  }, [fetchEmails, fetchDomains]);

  /* ---- search (debounced) ---- */
  const onSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchEmails(1, value, filter);
    }, 300);
  };

  /* ---- filter ---- */
  const onFilterChange = (f: FilterTab) => {
    setFilter(f);
    setPage(1);
    fetchEmails(1, search, f);
  };

  /* ---- select / open ---- */
  const openEmail = async (email: InboxEmail) => {
    setReplyOpen(false);
    setError("");
    try {
      const res = await api(`/dashboard/inbox/${email.id}`);
      setSelected(res.data);
      if (!email.isRead) {
        setItems((prev) => prev.map((e) => (e.id === email.id ? { ...e, isRead: true } : e)));
      }
    } catch {
      setSelected(email);
    }
  };

  /* ---- actions ---- */
  const toggleStar = async (id: string, current: boolean, ev?: React.MouseEvent) => {
    ev?.stopPropagation();
    try {
      await patch(`/dashboard/inbox/${id}`, { isStarred: !current });
      setItems((prev) => prev.map((e) => (e.id === id ? { ...e, isStarred: !current } : e)));
      if (selected?.id === id) setSelected({ ...selected, isStarred: !current });
    } catch {}
  };

  const archiveEmail = async (id: string) => {
    try {
      await patch(`/dashboard/inbox/${id}`, { isArchived: true });
      setItems((prev) => prev.filter((e) => e.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {}
  };

  const deleteEmail = async (id: string) => {
    try {
      await del(`/dashboard/inbox/${id}`);
      setItems((prev) => prev.filter((e) => e.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {}
  };

  /* ---- reply ---- */
  const startReply = () => {
    if (!selected) return;
    const toDomain = selected.toAddress?.split("@")[1] ?? "";
    const matchedDomain = verifiedDomains.find((d: any) => d.name === toDomain);
    setReplyForm({ from: matchedDomain ? selected.toAddress : "", body: "" });
    setReplyOpen(true);
    setError("");
  };

  const sendReply = async () => {
    if (!selected) return;
    setError("");
    setReplying(true);
    try {
      await post("/dashboard/emails", {
        from: replyForm.from,
        to: selected.fromAddress,
        subject: `Re: ${selected.subject}`,
        html: replyForm.body,
      });
      setReplyOpen(false);
      setReplyForm({ from: "", body: "" });
    } catch (e: any) {
      setError(e.message || "Failed to send reply");
    } finally {
      setReplying(false);
    }
  };

  /* ---- pagination ---- */
  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchEmails(next, search, filter, true);
  };

  /* ---- iframe auto-height ---- */
  const onIframeLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        iframeRef.current!.style.height = `${Math.max(doc.body.scrollHeight + 32, 200)}px`;
      }
    } catch {}
  };

  const unreadCount = items.filter((e) => !e.isRead).length;

  /* ================================================================
   *  RENDER
   * ============================================================= */
  return (
    <div className="flex flex-col lg:flex-row gap-0 -m-4 sm:-m-6 lg:-m-8 h-[calc(100vh)] overflow-hidden">
      {/* ====================== LEFT PANEL ====================== */}
      <div
        className={`w-full lg:w-[360px] shrink-0 border-r border-gray-200 flex flex-col h-full bg-white ${
          selected ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* ---- header area ---- */}
        <div className="px-4 pt-3 pb-2.5 border-b border-gray-200 space-y-2.5">
          {/* title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-gray-900">Inbox</h2>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={() => fetchEmails(page, search, filter)}
              className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshIcon />
            </button>
          </div>

          {/* search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search by sender, subject..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-9 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setPage(1); fetchEmails(1, "", filter); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600"
              >
                <CloseIcon />
              </button>
            )}
          </div>

          {/* filter tabs */}
          <div className="flex gap-0.5 bg-gray-100 rounded-xl p-0.5">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onFilterChange(tab.key)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                  filter === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- email list ---- */}
        <div className="flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
              </svg>
              <p className="text-[13px] text-gray-500">{search ? "No emails match your search" : "No emails yet"}</p>
              <p className="text-[12px] text-gray-400 mt-1">
                {search ? "Try a different search term" : "Emails sent to your verified domains will appear here"}
              </p>
            </div>
          ) : (
            <>
              {items.map((email) => (
                <button
                  key={email.id}
                  onClick={() => openEmail(email)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors group ${
                    selected?.id === email.id
                      ? "bg-violet-50 border-l-2 border-l-violet-500"
                      : !email.isRead
                        ? "bg-white"
                        : "bg-gray-50/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* avatar */}
                    <div
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColor(email.fromAddress)} border border-gray-200 flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5`}
                    >
                      {getInitials(email.fromName, email.fromAddress)}
                    </div>

                    {/* text content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!email.isRead && <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />}
                          <span
                            className={`text-[13px] truncate ${
                              !email.isRead ? "font-semibold text-gray-900" : "text-gray-600"
                            }`}
                          >
                            {email.fromName || email.fromAddress}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400 shrink-0 ml-2">{timeAgo(email.createdAt)}</span>
                      </div>

                      <p className={`text-[13px] truncate ${!email.isRead ? "text-gray-700" : "text-gray-500"}`}>
                        {email.subject || "(no subject)"}
                      </p>

                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[11px] text-gray-400 truncate">to: {email.toAddress}</p>
                        <button
                          onClick={(ev) => toggleStar(email.id, email.isStarred, ev)}
                          className={`p-0.5 rounded transition-opacity ${
                            email.isStarred
                              ? "text-amber-400 opacity-100"
                              : "text-gray-300 hover:text-amber-400 opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <StarIcon filled={email.isStarred} />
                        </button>
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              {/* load more */}
              {pagination && pagination.page < pagination.pages && (
                <div className="px-4 py-3">
                  <button
                    onClick={loadMore}
                    className="w-full py-2 text-[13px] font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-xl transition-colors"
                  >
                    Load more ({pagination.total - pagination.page * pagination.limit} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ====================== RIGHT PANEL ====================== */}
      <div className={`flex-1 flex flex-col h-full overflow-hidden bg-white ${selected ? "flex" : "hidden lg:flex"}`}>
        {!selected ? (
          /* empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-gray-500">Select an email to read</p>
            <p className="text-[12px] text-gray-400 mt-1">Choose a conversation from the list</p>
          </div>
        ) : (
          <>
            {/* ---- email header ---- */}
            <div className="px-6 py-4 border-b border-gray-200 shrink-0">
              {/* mobile back */}
              <button
                onClick={() => setSelected(null)}
                className="lg:hidden flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 mb-3 -ml-1"
              >
                <BackIcon />
                <span>Back to inbox</span>
              </button>

              {/* subject + action bar */}
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-[16px] font-semibold text-gray-900 leading-snug pr-4">
                  {selected.subject || "(no subject)"}
                </h2>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => toggleStar(selected.id, selected.isStarred)}
                    className={`p-2 rounded-xl hover:bg-gray-100 transition-colors ${
                      selected.isStarred ? "text-amber-400" : "text-gray-400 hover:text-amber-400"
                    }`}
                    title={selected.isStarred ? "Unstar" : "Star"}
                  >
                    <StarIcon filled={selected.isStarred} />
                  </button>
                  <button
                    onClick={() => archiveEmail(selected.id)}
                    className="p-2 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                    title="Archive"
                  >
                    <ArchiveIcon />
                  </button>
                  <button
                    onClick={() => deleteEmail(selected.id)}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {/* sender info */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor(selected.fromAddress)} border border-gray-200 flex items-center justify-center text-[12px] font-semibold shrink-0`}
                >
                  {getInitials(selected.fromName, selected.fromAddress)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] text-gray-900 font-medium truncate">
                      {selected.fromName || selected.fromAddress}
                    </p>
                    {!selected.isRead && <Badge variant="default">New</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1 text-[12px] text-gray-500 mt-0.5">
                    <span className="truncate">{selected.fromAddress}</span>
                    <span className="text-gray-300">&rarr;</span>
                    <span className="truncate">{selected.toAddress}</span>
                    {selected.ccAddresses && selected.ccAddresses.length > 0 && (
                      <>
                        <span className="text-gray-300 ml-1">cc:</span>
                        <span className="truncate">{selected.ccAddresses.join(", ")}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[12px] text-gray-400 shrink-0 hidden sm:block">
                  {new Date(selected.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* ---- email body ---- */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-5">
                {selected.htmlBody ? (
                  <iframe
                    ref={iframeRef}
                    srcDoc={selected.htmlBody}
                    sandbox=""
                    title="Email preview"
                    className="w-full border-0 rounded-xl bg-white"
                    style={{ minHeight: "300px", height: "100%", colorScheme: "light" }}
                    onLoad={onIframeLoad}
                  />
                ) : (
                  <pre className="text-[13px] text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
                    {selected.textBody || "(empty)"}
                  </pre>
                )}
              </div>
            </div>

            {/* ---- reply bar ---- */}
            <div className="shrink-0 border-t border-gray-200">
              {!replyOpen ? (
                <div className="px-6 py-3 flex items-center gap-2">
                  <Button onClick={startReply} disabled={verifiedDomains.length === 0}>
                    <ReplyIcon />
                    Reply
                  </Button>
                  {verifiedDomains.length === 0 && (
                    <span className="text-[12px] text-gray-400">Verify a domain to reply</span>
                  )}
                </div>
              ) : (
                <div className="px-6 py-4 space-y-3 bg-gray-50/50">
                  {/* reply header */}
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium text-gray-700">
                      Reply to {selected.fromName || selected.fromAddress}
                    </p>
                    <button onClick={() => setReplyOpen(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
                      <CloseIcon />
                    </button>
                  </div>

                  {error && (
                    <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">
                      {error}
                    </div>
                  )}

                  {/* from selector */}
                  <div>
                    <label className="block text-[12px] font-medium text-gray-500 mb-1">From</label>
                    <select
                      value={replyForm.from}
                      onChange={(e) => setReplyForm({ ...replyForm, from: e.target.value })}
                      className="w-full h-10 px-3.5 bg-white border border-gray-300 rounded-xl text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
                    >
                      <option value="">Select a sender address...</option>
                      {verifiedDomains.map((d: any) => {
                        const addr = selected.toAddress?.includes(`@${d.name}`)
                          ? selected.toAddress
                          : `reply@${d.name}`;
                        return (
                          <option key={d.id} value={addr}>
                            {addr}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <Textarea
                    label="Message"
                    placeholder="Type your reply..."
                    rows={4}
                    value={replyForm.body}
                    onChange={(e) =>
                      setReplyForm({ ...replyForm, body: (e.target as HTMLTextAreaElement).value })
                    }
                  />

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={sendReply}
                      disabled={replying || !replyForm.from || !replyForm.body}
                    >
                      {replying ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <SendIcon />
                          Send Reply
                        </>
                      )}
                    </Button>
                    <Button variant="secondary" onClick={() => setReplyOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
