import { useState, useEffect, useCallback, useRef } from "react";
import { api, post, patch, del } from "../../lib/api";
import { Badge, Button, Input, Textarea, Modal, useConfirmDialog } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { RichEditor, wrapEmailHtml } from "../../components/RichEditor";

type InboxEmail = {
  id: string;
  from: string;
  from_name: string | null;
  to: string;
  cc: string[] | null;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  thread_id: string | null;
  references: string[] | null;
  folder_id: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  has_attachments: boolean;
  deleted_at: string | null;
  created_at: string;
  // Legacy field compat — API may return camelCase from old dashboard endpoint
  fromAddress?: string;
  fromName?: string | null;
  toAddress?: string;
  ccAddresses?: string[] | null;
  textBody?: string | null;
  htmlBody?: string | null;
  messageId?: string | null;
  isRead?: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
  createdAt?: string;
};

// Normalize email object from either old camelCase or new snake_case API
function normalizeEmail(e: any): InboxEmail {
  return {
    id: e.id,
    from: e.from || e.fromAddress || "",
    from_name: e.from_name ?? e.fromName ?? null,
    to: e.to || e.toAddress || "",
    cc: e.cc || e.ccAddresses || null,
    subject: e.subject || "",
    text_body: e.text_body ?? e.textBody ?? null,
    html_body: e.html_body ?? e.htmlBody ?? null,
    message_id: e.message_id ?? e.messageId ?? null,
    in_reply_to: e.in_reply_to ?? e.inReplyTo ?? null,
    thread_id: e.thread_id ?? e.threadId ?? null,
    references: e.references ?? null,
    folder_id: e.folder_id ?? e.folderId ?? null,
    is_read: e.is_read ?? e.isRead ?? false,
    is_starred: e.is_starred ?? e.isStarred ?? false,
    is_archived: e.is_archived ?? e.isArchived ?? false,
    has_attachments: e.has_attachments ?? e.hasAttachments ?? false,
    deleted_at: e.deleted_at ?? e.deletedAt ?? null,
    created_at: e.created_at || e.createdAt || "",
  };
}

type Folder = {
  id: string;
  name: string;
  slug: string;
  type: string;
  unread_count: number;
};

type Attachment = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
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

const avatarColors = [
  "from-violet-400 to-indigo-400 text-white",
  "from-cyan-400 to-blue-400 text-white",
  "from-emerald-400 to-green-400 text-white",
  "from-amber-400 to-orange-400 text-white",
  "from-pink-400 to-rose-400 text-white",
  "from-teal-400 to-cyan-400 text-white",
];

const colorIndex = (email: string) => {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = ((hash << 5) - hash) + email.charCodeAt(i);
  return Math.abs(hash) % avatarColors.length;
};

const avatarColor = (email: string) => avatarColors[colorIndex(email)];

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
  const [domainFilter, setDomainFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<"reply" | "reply-all" | "forward">("reply");
  const [replyForm, setReplyForm] = useState({ from: "", to: "", body: "" });
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");
  // Folders
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("inbox");
  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Thread view
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [showThread, setShowThread] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const verifiedDomains = domainsList.filter((d: any) => d.status === "verified");

  /* ---- data fetching ---- */
  const fetchFolders = useCallback(async () => {
    try {
      const res = await api("/dashboard/folders");
      setFolders(res.data ?? []);
    } catch {}
  }, []);

  const fetchEmails = useCallback(
    async (p: number, s: string, f: FilterTab, append = false, domain?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (s) params.set("search", s);
        if (f !== "all") params.set("filter", f);
        if (domain) params.set("domain_id", domain);
        // Use folder_slug for folder-aware fetching
        if (activeFolder && activeFolder !== "all") {
          params.set("folder_slug", activeFolder);
        }
        params.set("page", String(p));
        params.set("limit", "50");
        const res = await api(`/dashboard/inbox?${params}`);
        const normalized = (res.data ?? []).map(normalizeEmail);
        if (append) {
          setItems((prev) => [...prev, ...normalized]);
        } else {
          setItems(normalized);
        }
        if (res.pagination) setPagination(res.pagination);
      } catch {
        if (!append) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [activeFolder],
  );

  const fetchDomains = useCallback(async () => {
    try {
      const res = await api("/dashboard/domains");
      setDomainsList(res.data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchEmails(1, "", "all", false, "");
    fetchDomains();
    fetchFolders();
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchFolder = (slug: string) => {
    setActiveFolder(slug);
    setSelected(null);
    setSelectedIds(new Set());
    setPage(1);
  };

  // Re-fetch when folder changes
  useEffect(() => {
    fetchEmails(1, search, filter, false, domainFilter);
  }, [activeFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- search (debounced) ---- */
  const onSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchEmails(1, value, filter, false, domainFilter);
    }, 300);
  };

  /* ---- filter ---- */
  const onFilterChange = (f: FilterTab) => {
    setFilter(f);
    setPage(1);
    fetchEmails(1, search, f, false, domainFilter);
  };

  const onDomainFilterChange = (d: string) => {
    setDomainFilter(d);
    setPage(1);
    fetchEmails(1, search, filter, false, d);
  };

  /* ---- select / open ---- */
  const openEmail = async (email: InboxEmail) => {
    setReplyOpen(false);
    setError("");
    setShowThread(false);
    setAttachments([]);
    try {
      const res = await api(`/dashboard/inbox/${email.id}`);
      const norm = normalizeEmail(res.data);
      setSelected(norm);
      if (!email.is_read) {
        setItems((prev) => prev.map((e) => (e.id === email.id ? { ...e, is_read: true } : e)));
      }
      // Load attachments if present
      if (norm.has_attachments) {
        try {
          const attRes = await api(`/dashboard/inbox/${email.id}/attachments`);
          setAttachments(attRes.data ?? []);
        } catch {}
      }
    } catch {
      setSelected(email);
    }
  };

  /* ---- thread view ---- */
  const loadThread = async (threadId: string) => {
    try {
      const res = await api(`/dashboard/threads/${encodeURIComponent(threadId)}`);
      setThreadMessages(res.data?.messages ?? []);
      setShowThread(true);
    } catch (e: any) { toast(e.message || "Failed to load thread", "error"); }
  };

  /* ---- actions ---- */
  const toggleStar = async (id: string, current: boolean, ev?: React.MouseEvent) => {
    ev?.stopPropagation();
    try {
      await patch(`/dashboard/inbox/${id}`, { isStarred: !current });
      setItems((prev) => prev.map((e) => (e.id === id ? { ...e, is_starred: !current } : e)));
      if (selected?.id === id) setSelected({ ...selected, is_starred: !current });
    } catch (e: any) { toast(e.message || "Failed to update star", "error"); }
  };

  const archiveEmail = async (id: string) => {
    try {
      await patch(`/dashboard/inbox/${id}`, { isArchived: true });
      toast("Archived");
      setItems((prev) => prev.filter((e) => e.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { toast(e.message || "Failed to archive", "error"); }
  };

  const deleteEmail = (id: string) => {
    // In trash folder, permanently delete; otherwise soft-delete (move to trash)
    if (activeFolder === "trash") {
      confirm({
        title: "Permanently delete?",
        message: "This email will be permanently removed and cannot be recovered.",
        confirmLabel: "Delete Forever",
        onConfirm: async () => {
          try {
            await del(`/dashboard/inbox/${id}`);
            setItems((prev) => prev.filter((e) => e.id !== id));
            if (selected?.id === id) setSelected(null);
          } catch (e: any) { toast(e.message || "Failed to delete", "error"); }

        },
      });
    } else {
      // Soft delete — move to trash (no confirm needed)
      (async () => {
        try {
          await del(`/dashboard/inbox/${id}`);
          toast("Moved to trash");
          setItems((prev) => prev.filter((e) => e.id !== id));
          if (selected?.id === id) setSelected(null);
          fetchFolders(); // refresh unread counts
        } catch (e: any) { toast(e.message || "Failed to move to trash", "error"); }
      })();
    }
  };

  const restoreEmail = async (id: string) => {
    try {
      await post(`/dashboard/inbox/${id}/restore`, {});
      toast("Restored");
      setItems((prev) => prev.filter((e) => e.id !== id));
      if (selected?.id === id) setSelected(null);
      fetchFolders();
    } catch (e: any) { toast(e.message || "Failed to restore", "error"); }
  };

  const moveToFolder = async (id: string, folderId: string) => {
    try {
      await post(`/dashboard/inbox/${id}/move`, { folder_id: folderId });
      setItems((prev) => prev.filter((e) => e.id !== id));
      if (selected?.id === id) setSelected(null);
      fetchFolders();
    } catch (e: any) { toast(e.message || "Failed to move", "error"); }
  };

  /* ---- bulk actions ---- */
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((e) => e.id)));
    }
  };

  const toggleSelect = (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkAction = async (action: string, folderId?: string) => {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    try {
      await post("/dashboard/inbox/bulk", {
        ids: Array.from(selectedIds),
        action,
        folder_id: folderId,
      });
      toast("Done");
      setSelectedIds(new Set());
      fetchEmails(1, search, filter, false, domainFilter);
      fetchFolders();
    } catch (e: any) {
      toast(e.message || "Bulk action failed", "error");
    } finally {
      setBulkActing(false);
    }
  };

  /* ---- reply / reply-all / forward ---- */
  const startReply = (mode: "reply" | "reply-all" | "forward" = "reply") => {
    if (!selected) return;
    setReplyMode(mode);
    const toDomain = selected.to?.split("@")[1] ?? "";
    const matchedDomain = verifiedDomains.find((d: any) => d.name === toDomain);
    const fromAddr = matchedDomain ? selected.to : "";

    let toAddr = "";
    if (mode === "reply" || mode === "reply-all") {
      toAddr = selected.from;
      if (mode === "reply-all" && selected.cc) {
        toAddr += ", " + selected.cc.filter((a) => a !== fromAddr).join(", ");
      }
    }

    const quotedBody = mode === "forward"
      ? `<br/><hr/><p><b>---------- Forwarded message ----------</b><br/>From: ${selected.from}<br/>Date: ${selected.created_at}<br/>Subject: ${selected.subject}<br/>To: ${selected.to}</p>${selected.html_body || selected.text_body || ""}`
      : "";

    setReplyForm({ from: fromAddr, to: toAddr, body: quotedBody });
    setReplyOpen(true);
    setError("");
  };

  const sendReply = async () => {
    if (!selected) return;
    setError("");
    setReplying(true);
    try {
      const subject = replyMode === "forward"
        ? (selected.subject.startsWith("Fwd:") ? selected.subject : `Fwd: ${selected.subject}`)
        : (selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`);

      const refs = [...(selected.references || [])];
      if (selected.message_id && !refs.includes(selected.message_id)) refs.push(selected.message_id);

      const toAddresses = replyForm.to.split(",").map((s) => s.trim()).filter(Boolean);

      await post("/dashboard/emails", {
        from: replyForm.from,
        to: toAddresses.length > 0 ? toAddresses : [selected.from],
        subject,
        html: wrapEmailHtml(replyForm.body),
        in_reply_to: replyMode !== "forward" ? selected.message_id : undefined,
        references: replyMode !== "forward" ? refs : undefined,
      });
      setReplyOpen(false);
      setReplyForm({ from: "", to: "", body: "" });
    } catch (e: any) {
      setError(e.message || "Failed to send");
    } finally {
      setReplying(false);
    }
  };

  /* ---- pagination ---- */
  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchEmails(next, search, filter, true, domainFilter);
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

  const unreadCount = items.filter((e) => !e.is_read).length;
  const isTrash = activeFolder === "trash";
  const folderIcons: Record<string, string> = { inbox: "M2.25 13.5h3.86", sent: "M6 12L3.269", drafts: "M16.862 4.487", trash: "M14.74 9", spam: "M12 9v3.75", archive: "M20.25 7.5" };

  /* ================================================================
   *  RENDER
   * ============================================================= */
  return (
    <div className="flex flex-col lg:flex-row gap-0 -m-4 sm:-m-6 lg:-m-8 h-[calc(100vh)] overflow-hidden">
      {/* ====================== FOLDER SIDEBAR ====================== */}
      <div className="hidden lg:flex w-[180px] shrink-0 border-r border-gray-200 dark:border-gray-700 flex-col h-full bg-gray-50 dark:bg-gray-900">
        <div className="px-3 pt-3 pb-2">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Folders</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => switchFolder(f.slug)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                activeFolder === f.slug
                  ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <span className="truncate">{f.name}</span>
              {f.unread_count > 0 && (
                <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/50 px-1.5 rounded-full">
                  {f.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ====================== LEFT PANEL ====================== */}
      <div
        className={`w-full lg:w-[360px] shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full bg-white dark:bg-gray-900 ${
          selected ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* ---- header area ---- */}
        <div className="px-4 pt-3 pb-2.5 border-b border-gray-200 dark:border-gray-700 space-y-2.5">
          {/* bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 py-1.5 px-2 bg-violet-50 dark:bg-violet-900/30 rounded-lg mb-2">
              <span className="text-[12px] font-medium text-violet-700 dark:text-violet-300 mr-auto">{selectedIds.size} selected</span>
              <button onClick={() => bulkAction("mark_read")} disabled={bulkActing} className="text-[11px] px-2 py-1 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600">Read</button>
              <button onClick={() => bulkAction("mark_unread")} disabled={bulkActing} className="text-[11px] px-2 py-1 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600">Unread</button>
              <button onClick={() => bulkAction("star")} disabled={bulkActing} className="text-[11px] px-2 py-1 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600">Star</button>
              {isTrash ? (
                <button onClick={() => bulkAction("permanent_delete")} disabled={bulkActing} className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200">Delete</button>
              ) : (
                <button onClick={() => bulkAction("move_to_trash")} disabled={bulkActing} className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200">Trash</button>
              )}
              <button onClick={() => setSelectedIds(new Set())} className="text-[11px] px-1.5 py-1 text-gray-400 hover:text-gray-600">Clear</button>
            </div>
          )}
          {/* title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 capitalize">{activeFolder}</h2>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={() => fetchEmails(page, search, filter, false, domainFilter)}
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
                onClick={() => { setSearch(""); setPage(1); fetchEmails(1, "", filter, false, domainFilter); }}
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
          {/* domain filter */}
          {domainsList.length > 1 && (
            <select
              value={domainFilter}
              onChange={(e) => onDomainFilterChange(e.target.value)}
              className="w-full h-8 px-2 bg-white border border-gray-200 rounded-lg text-[12px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 mt-1.5"
            >
              <option value="">All domains</option>
              {domainsList.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
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
                {search ? "Try a different search term" : "Emails sent to your verified domains will appear here. After domain verification, receiving is active within 5-10 minutes."}
              </p>
            </div>
          ) : (
            <>
              {items.map((email, idx) => (
                <button
                  key={email.id}
                  onClick={() => openEmail(email)}
                  style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "backwards" }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group animate-slide-up ${
                    selected?.id === email.id
                      ? "bg-violet-50 dark:bg-violet-900/20 border-l-[3px] border-l-violet-500 pl-[13px]"
                      : !email.is_read
                        ? "bg-white dark:bg-gray-900 border-l-[3px] border-l-transparent pl-[13px]"
                        : "bg-gray-50/30 dark:bg-gray-800/30 border-l-[3px] border-l-transparent pl-[13px]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* checkbox for multi-select */}
                    <input
                      type="checkbox"
                      checked={selectedIds.has(email.id)}
                      onClick={(ev) => toggleSelect(email.id, ev as any)}
                      onChange={() => {}}
                      className="mt-2.5 w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={selectedIds.has(email.id) ? { opacity: 1 } : undefined}
                    />
                    {/* avatar */}
                    <div
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColor(email.from)} border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5`}
                    >
                      {getInitials(email.from_name, email.from)}
                    </div>

                    {/* text content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!email.is_read && <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />}
                          <span
                            className={`text-[13px] truncate ${
                              !email.is_read ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"
                            }`}
                          >
                            {email.from_name || email.from}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400 shrink-0 ml-2">{timeAgo(email.created_at)}</span>
                      </div>

                      <p className={`text-[13px] truncate ${!email.is_read ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-500"}`}>
                        {email.subject || "(no subject)"}
                        {email.has_attachments && <span className="ml-1 text-gray-400" title="Has attachments">&#128206;</span>}
                      </p>

                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[11px] text-gray-400 truncate">to: {email.to}</p>
                        <button
                          onClick={(ev) => toggleStar(email.id, email.is_starred, ev)}
                          className={`p-0.5 rounded transition-opacity ${
                            email.is_starred
                              ? "text-amber-400 opacity-100"
                              : "text-gray-300 hover:text-amber-400 opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <StarIcon filled={email.is_starred} />
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
      <div className={`flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900 ${selected ? "flex" : "hidden lg:flex"}`}>
        {!selected ? (
          /* empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-gray-500">Select an email to read</p>
            <p className="text-[12px] text-gray-400 mt-1">Choose a conversation from the list</p>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden animate-fade-in">
            {/* ---- email header ---- */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              {/* mobile back */}
              <button
                onClick={() => setSelected(null)}
                className="lg:hidden flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 mb-3 -ml-1"
              >
                <BackIcon />
                <span>Back</span>
              </button>

              {/* subject + action bar */}
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-gray-100 leading-snug pr-4">
                  {selected.subject || "(no subject)"}
                  {selected.thread_id && (
                    <button
                      onClick={() => loadThread(selected.thread_id!)}
                      className="ml-2 text-[11px] font-normal text-violet-600 dark:text-violet-400 hover:underline"
                    >
                      View thread
                    </button>
                  )}
                </h2>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => toggleStar(selected.id, selected.is_starred)}
                    className={`p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                      selected.is_starred ? "text-amber-400" : "text-gray-400 hover:text-amber-400"
                    }`}
                    title={selected.is_starred ? "Unstar" : "Star"}
                  >
                    <StarIcon filled={selected.is_starred} />
                  </button>
                  {isTrash ? (
                    <button
                      onClick={() => restoreEmail(selected.id)}
                      className="p-2 rounded-xl text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                      title="Restore"
                    >
                      <ArchiveIcon />
                    </button>
                  ) : (
                    <button
                      onClick={() => archiveEmail(selected.id)}
                      className="p-2 rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Archive"
                    >
                      <ArchiveIcon />
                    </button>
                  )}
                  {/* Move to folder dropdown */}
                  {folders.filter((f) => f.type === "custom" || !["trash", "spam"].includes(f.slug)).length > 0 && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) moveToFolder(selected.id, e.target.value); }}
                      className="h-8 px-1 text-[11px] text-gray-500 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                      title="Move to folder"
                    >
                      <option value="">Move...</option>
                      {folders.filter((f) => f.slug !== activeFolder).map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => deleteEmail(selected.id)}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    title={isTrash ? "Delete permanently" : "Move to trash"}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {/* sender info */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor(selected.from)} border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[12px] font-semibold shrink-0`}
                >
                  {getInitials(selected.from_name, selected.from)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] text-gray-900 dark:text-gray-100 font-medium truncate">
                      {selected.from_name || selected.from}
                    </p>
                    {!selected.is_read && <Badge variant="default">New</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1 text-[12px] text-gray-500 mt-0.5">
                    <span className="truncate">{selected.from}</span>
                    <span className="text-gray-300 dark:text-gray-600">&rarr;</span>
                    <span className="truncate">{selected.to}</span>
                    {selected.cc && selected.cc.length > 0 && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600 ml-1">cc:</span>
                        <span className="truncate">{selected.cc.join(", ")}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[12px] text-gray-400 shrink-0 hidden sm:block">
                  {new Date(selected.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {/* ---- attachments ---- */}
            {attachments.length > 0 && (
              <div className="px-6 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/dashboard/inbox/${selected.id}/attachments/${att.id}`}
                    download={att.filename}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[12px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span>&#128206;</span>
                    <span className="truncate max-w-[150px]">{att.filename}</span>
                    <span className="text-gray-400 text-[11px]">({Math.ceil(att.size / 1024)}KB)</span>
                  </a>
                ))}
              </div>
            )}

            {/* ---- thread view ---- */}
            {showThread && threadMessages.length > 1 && (
              <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-medium text-gray-600 dark:text-gray-400">Thread ({threadMessages.length} messages)</p>
                  <button onClick={() => setShowThread(false)} className="text-[11px] text-gray-400 hover:text-gray-600">Hide</button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {threadMessages.map((msg: any) => (
                    <div key={msg.id} className={`px-3 py-2 rounded-lg text-[12px] ${msg.id === selected.id ? "bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{msg.from_name || msg.from}</span>
                        <span className="text-gray-400">{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${msg.type === "outbound" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600" : "bg-gray-100 dark:bg-gray-700 text-gray-500"}`}>{msg.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ---- email body ---- */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-5">
                {selected.html_body ? (
                  <iframe
                    ref={iframeRef}
                    srcDoc={selected.html_body}
                    sandbox="allow-same-origin"
                    title="Email preview"
                    className="w-full border-0 rounded-xl bg-white"
                    style={{ minHeight: "300px", height: "100%", colorScheme: "light" }}
                    onLoad={onIframeLoad}
                  />
                ) : (
                  <pre className="text-[13px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans leading-relaxed">
                    {selected.text_body || "(empty)"}
                  </pre>
                )}
              </div>
            </div>

            {/* ---- reply bar ---- */}
            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700">
              {!replyOpen ? (
                <div className="px-6 py-3 flex items-center gap-2">
                  <Button onClick={() => startReply("reply")} disabled={verifiedDomains.length === 0}>
                    <ReplyIcon />
                    Reply
                  </Button>
                  <Button variant="secondary" onClick={() => startReply("reply-all")} disabled={verifiedDomains.length === 0}>
                    Reply All
                  </Button>
                  <Button variant="secondary" onClick={() => startReply("forward")} disabled={verifiedDomains.length === 0}>
                    Forward
                  </Button>
                  {verifiedDomains.length === 0 && (
                    <span className="text-[12px] text-gray-400">Verify a domain to reply</span>
                  )}
                </div>
              ) : (
                <div className="px-6 py-4 space-y-3 bg-gray-50/50 dark:bg-gray-800/50">
                  {/* reply header */}
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                      {replyMode === "forward" ? "Forward" : replyMode === "reply-all" ? "Reply All" : "Reply"} — {selected.from_name || selected.from}
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
                      className="w-full h-10 px-3.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-[13px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
                    >
                      <option value="">Select a sender address...</option>
                      {verifiedDomains.map((d: any) => {
                        const addr = selected.to?.includes(`@${d.name}`)
                          ? selected.to
                          : `reply@${d.name}`;
                        return (
                          <option key={d.id} value={addr}>
                            {addr}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* to field (editable for forward) */}
                  {replyMode === "forward" && (
                    <div>
                      <label className="block text-[12px] font-medium text-gray-500 mb-1">To</label>
                      <input
                        type="text"
                        value={replyForm.to}
                        onChange={(e) => setReplyForm({ ...replyForm, to: e.target.value })}
                        placeholder="recipient@example.com"
                        className="w-full h-10 px-3.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-[13px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">Message</label>
                    <RichEditor
                      value={replyForm.body}
                      onChange={(html) => setReplyForm({ ...replyForm, body: html })}
                      placeholder={replyMode === "forward" ? "Add a message..." : "Type your reply..."}
                      minHeight="120px"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={sendReply}
                      disabled={replying || !replyForm.from || (!replyForm.body && replyMode !== "forward") || (replyMode === "forward" && !replyForm.to)}
                    >
                      {replying ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <SendIcon />
                          {replyMode === "forward" ? "Forward" : "Send Reply"}
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
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
