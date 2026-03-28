import { useState, useEffect, useRef, useCallback } from "react";
import { Link, Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, post, del } from "../lib/api";
import { Badge, statusVariant, EmptyState, Table, PageHeader, Button, Input, Textarea, Modal, CopyButton, Dot, useConfirmDialog, useToast } from "../components/ui";
import { patch } from "../lib/api";
import InboxPage from "./dashboard/InboxPage";
import EmailsPage from "./dashboard/EmailsPage";
import AudiencesPage from "./dashboard/AudiencesPage";
import BroadcastsPage from "./dashboard/BroadcastsPage";
import WarmupPage from "./dashboard/WarmupPage";
import TemplatesPage from "./dashboard/TemplatesPage";
import SettingsPage from "./dashboard/SettingsPage";
import SuppressionsPage from "./dashboard/SuppressionsPage";
import UsagePage from "./dashboard/UsagePage";
import DeliverabilityPage from "./dashboard/DeliverabilityPage";

const navSections = [
  { label: "", items: [
    { to: "/dashboard", label: "Overview", end: true, icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
  ]},
  { label: "Email", items: [
    { to: "/dashboard/inbox", label: "Inbox", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" /></svg> },
    { to: "/dashboard/emails", label: "Emails", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
    { to: "/dashboard/broadcasts", label: "Broadcasts", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" /></svg> },
  ]},
  { label: "Manage", items: [
    { to: "/dashboard/audiences", label: "Audiences", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg> },
    { to: "/dashboard/templates", label: "Templates", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
    { to: "/dashboard/warmup", label: "Warmup", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /></svg> },
    { to: "/dashboard/deliverability", label: "Deliverability", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg> },
  ]},
  { label: "Configure", items: [
    { to: "/dashboard/domains", label: "Domains", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" /></svg> },
    { to: "/dashboard/api-keys", label: "API Keys", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> },
    { to: "/dashboard/webhooks", label: "Webhooks", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg> },
  ]},
  { label: "Account", items: [
    { to: "/dashboard/suppressions", label: "Suppressions", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
    { to: "/dashboard/usage", label: "Usage", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg> },
    { to: "/dashboard/settings", label: "Settings", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { to: "/dashboard/api-docs", label: "API Docs", icon: <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
  ]},
];

function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults(null); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api(`/dashboard/search?q=${encodeURIComponent(q.trim())}`);
        setResults(res.data);
        setOpen(true);
      } catch { setResults(null); }
    }, 300);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hasResults = results && (results.emails?.length || results.inbox?.length || results.domains?.length || results.contacts?.length || results.templates?.length);

  const go = (path: string) => { navigate(path); setOpen(false); setQuery(""); setResults(null); };

  return (
    <div ref={wrapperRef} className="relative px-2.5 pt-3 pb-1">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => { if (results) setOpen(true); }}
          placeholder="Search..."
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors"
        />
      </div>
      {open && results && (
        <div className="absolute left-2.5 right-2.5 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
          {!hasResults && <p className="px-3 py-4 text-[13px] text-gray-400 text-center">No results found</p>}
          {results.emails?.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Emails</p>
              {results.emails.map((e: any) => (
                <button key={e.id} onClick={() => go("/dashboard/emails")} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                  <span className="text-[13px] text-gray-900 dark:text-gray-100 truncate">{e.subject || "(no subject)"}</span>
                  <span className="text-[11px] text-gray-400 ml-auto shrink-0">{e.fromAddress}</span>
                </button>
              ))}
            </div>
          )}
          {results.inbox?.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Inbox</p>
              {results.inbox.map((e: any) => (
                <button key={e.id} onClick={() => go("/dashboard/inbox")} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                  <span className="text-[13px] text-gray-900 dark:text-gray-100 truncate">{e.subject || "(no subject)"}</span>
                  <span className="text-[11px] text-gray-400 ml-auto shrink-0">{e.fromAddress}</span>
                </button>
              ))}
            </div>
          )}
          {results.domains?.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Domains</p>
              {results.domains.map((d: any) => (
                <button key={d.id} onClick={() => go("/dashboard/domains")} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                  <span className="text-[13px] text-gray-900 dark:text-gray-100 font-mono">{d.name}</span>
                  <span className="text-[11px] text-gray-400 ml-auto">{d.status}</span>
                </button>
              ))}
            </div>
          )}
          {results.contacts?.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Contacts</p>
              {results.contacts.map((c: any) => (
                <button key={c.id} onClick={() => go("/dashboard/audiences")} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                  <span className="text-[13px] text-gray-900 dark:text-gray-100">{c.email}</span>
                  {(c.firstName || c.lastName) && <span className="text-[11px] text-gray-400 ml-auto">{[c.firstName, c.lastName].filter(Boolean).join(" ")}</span>}
                </button>
              ))}
            </div>
          )}
          {results.templates?.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Templates</p>
              {results.templates.map((t: any) => (
                <button key={t.id} onClick={() => go("/dashboard/templates")} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                  <span className="text-[13px] text-gray-900 dark:text-gray-100">{t.name}</span>
                  {t.subject && <span className="text-[11px] text-gray-400 ml-auto truncate">{t.subject}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onToggle} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[240px] shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-screen transform transition-transform duration-200 lg:relative lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-4 h-14 flex items-center border-b border-gray-200">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg></div>
            <span className="font-semibold text-[14px] text-gray-900 tracking-tight">MailNowAPI</span>
          </Link>
          {/* Close button on mobile */}
          <button onClick={onToggle} className="ml-auto p-1 rounded-lg text-gray-500 hover:text-gray-900 lg:hidden">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <SearchBar />
        <nav className="flex-1 px-2.5 py-2 space-y-3 overflow-y-auto">
          {navSections.map((section, si) => (
            <div key={si}>
              {section.label && (
                <div className="px-2.5 pt-1 pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{section.label}</span>
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : undefined} onClick={onToggle} className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${isActive ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-l-[3px] border-violet-500 -ml-[3px]" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-700"}`}>
                    {item.icon}{item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          {user?.role === "admin" && (<><div className="pt-3 pb-1 px-2.5"><div className="border-t border-gray-200" /></div><NavLink to="/admin" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-amber-600 hover:text-amber-600 hover:bg-amber-50 transition-colors"><svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Admin</NavLink></>)}
        </nav>
        <div className="px-2.5 py-2">
          <button
            onClick={() => {
              const isDark = document.documentElement.classList.toggle("dark");
              localStorage.setItem("mailnowapi-theme", isDark ? "dark" : "light");
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-[18px] h-[18px] dark:hidden" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
            <svg className="w-[18px] h-[18px] hidden dark:block" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
            <span className="dark:hidden">Dark Mode</span>
            <span className="hidden dark:block">Light Mode</span>
          </button>
        </div>
        <div className="px-2.5 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="px-2.5 mb-2"><p className="text-[13px] text-gray-900 dark:text-gray-100 font-medium truncate">{user?.name}</p><p className="text-[11px] text-gray-400 truncate">{user?.email}</p></div>
          <button onClick={async () => { await logout(); navigate("/"); }} className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

function ActivityFeed() {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let mounted = true;
    const es = new EventSource("/dashboard/activity/stream", { withCredentials: true });

    es.onopen = () => { if (mounted) setConnected(true); };

    es.onmessage = (e) => {
      if (!mounted) return;
      try {
        const data = JSON.parse(e.data);
        if (data.type === "init") {
          setEvents(data.events);
        } else if (data.type === "event") {
          setEvents((prev) => [data.event, ...prev].slice(0, 50));
        }
      } catch {}
    };

    es.onerror = () => { if (mounted) setConnected(false); };

    return () => { mounted = false; es.close(); };
  }, []);

  const eventColors: Record<string, string> = {
    sent: "bg-emerald-500",
    delivered: "bg-green-500",
    bounced: "bg-amber-500",
    failed: "bg-red-500",
    opened: "bg-blue-500",
    clicked: "bg-cyan-500",
    complained: "bg-rose-500",
    queued: "bg-gray-400",
  };

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(d).toLocaleDateString();
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-750 dark:to-gray-800">
        <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">Live Activity</h3>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse-live" : "bg-gray-300 dark:bg-gray-600"}`} />
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{connected ? "Live" : "Connecting..."}</span>
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
        {events.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-gray-400 dark:text-gray-500">No activity yet. Send an email to see events here.</div>
        ) : events.map((e: any, i: number) => (
          <div key={e.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors animate-slide-in" style={{ animationDelay: `${i * 30}ms` }}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${eventColors[e.type] || "bg-gray-400"}`} />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] text-gray-700 dark:text-gray-300 capitalize">{e.type.replace(/[._]/g, " ")}</span>
              {e.data?.subject && <span className="text-[12px] text-gray-400 dark:text-gray-500 ml-2 truncate">— {e.data.subject}</span>}
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">{timeAgo(e.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnboardingWizard({ stats }: { stats: any }) {
  const stepIcons = [
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" /></svg>,
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>,
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>,
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>,
  ];
  const steps = [
    { label: "Add a domain", desc: "Configure DNS records for sending and receiving", done: stats.domains > 0, link: "/dashboard/domains" },
    { label: "Verify DNS records", desc: "Complete SPF, DKIM, DMARC verification", done: stats.verified_domains > 0, link: "/dashboard/domains" },
    { label: "Create an API key", desc: "Generate a key to authenticate API requests", done: stats.api_keys > 0, link: "/dashboard/api-keys" },
    { label: "Send your first email", desc: "Try sending a test email via the dashboard", done: stats.emails > 0, link: "/dashboard/emails" },
    { label: "Set up a webhook", desc: "Receive delivery notifications in real-time", done: stats.webhooks > 0, link: "/dashboard/webhooks" },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Get started with MailNowAPI</h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">Complete these steps to start sending emails</p>
        </div>
        <span className="text-[13px] font-medium text-violet-600 dark:text-violet-400">{completed} of {steps.length} complete</span>
      </div>
      <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-5">
        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(completed / steps.length) * 100}%` }} />
      </div>
      <div className="relative space-y-0">
        {steps.map((step, i) => (
          <Link
            key={i}
            to={step.link}
            className={`relative flex items-start gap-3 px-4 py-3 rounded-xl transition-colors ${step.done ? "bg-gray-50 dark:bg-gray-700/30" : "hover:bg-violet-50 dark:hover:bg-violet-900/20"}`}
          >
            {/* Connecting vertical line */}
            {i < steps.length - 1 && (
              <div className={`absolute left-[29px] top-[38px] w-0.5 h-[calc(100%-18px)] ${step.done ? "bg-emerald-300 dark:bg-emerald-700" : "bg-gray-200 dark:bg-gray-600"}`} />
            )}
            <div className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 relative z-10 ${step.done ? "border-emerald-500 bg-emerald-500" : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"}`}>
              {step.done ? (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">{stepIcons[i]}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-medium ${step.done ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-gray-100"}`}>{step.label}</p>
              <p className={`text-[12px] mt-0.5 ${step.done ? "text-gray-300 dark:text-gray-600" : "text-gray-500 dark:text-gray-400"}`}>{step.desc}</p>
            </div>
            {!step.done && (
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState<any>(null);
  const [setupDismissed, setSetupDismissed] = useState(() => localStorage.getItem("mailnowapi-setup-dismissed") === "true");
  useEffect(() => { api("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {}); }, []);

  const statIcons: Record<string, { gradient: string; icon: React.ReactNode }> = {
    Emails: { gradient: "from-violet-500 to-indigo-500", icon: <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
    Domains: { gradient: "from-emerald-500 to-teal-500", icon: <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" /></svg> },
    "API Keys": { gradient: "from-amber-500 to-orange-500", icon: <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> },
    Webhooks: { gradient: "from-blue-500 to-cyan-500", icon: <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg> },
    Audiences: { gradient: "from-rose-500 to-pink-500", icon: <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg> },
  };

  const sc = (l: string, v: number) => {
    const si = statIcons[l] || { gradient: "from-gray-500 to-gray-600", icon: null };
    return (
      <div key={l} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${si.gradient} flex items-center justify-center shrink-0`}>{si.icon}</div>
          <span className="text-[13px] text-gray-500 dark:text-gray-400">{l}</span>
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight animate-number-up">{v}</div>
      </div>
    );
  };

  if (!stats) {
    return (<div><PageHeader title="Overview" desc="Your email service at a glance" /></div>);
  }

  const allStepsDone = stats.domains > 0 && stats.verified_domains > 0 && stats.api_keys > 0 && stats.emails > 0 && stats.webhooks > 0;

  return (
    <div>
      <PageHeader title="Overview" desc="Your email service at a glance" />

      {/* Setup complete banner */}
      {allStepsDone && !setupDismissed && (
        <div className="mb-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-900/30 dark:via-teal-900/20 dark:to-cyan-900/20 p-5 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-emerald-800 dark:text-emerald-200">All set! Your email service is ready.</p>
              <p className="text-[13px] text-emerald-600 dark:text-emerald-400 mt-0.5">You have completed all onboarding steps. Start sending emails with confidence.</p>
            </div>
          </div>
          <button
            onClick={() => { setSetupDismissed(true); localStorage.setItem("mailnowapi-setup-dismissed", "true"); }}
            className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-800/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Onboarding wizard when not all steps are done */}
      {!allStepsDone && (
        <div className="mb-6">
          <OnboardingWizard stats={stats} />
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {sc("Emails", stats.emails)}
        {sc("Domains", stats.domains)}
        {sc("API Keys", stats.api_keys)}
        {sc("Webhooks", stats.webhooks)}
        {sc("Audiences", stats.audiences)}
      </div>

      <div className="mt-4"><ActivityFeed /></div>
    </div>
  );
}

// EmailsPage is now imported from ./dashboard/EmailsPage

// --- DOMAINS with add/delete/verify + auto-setup ---
function DomainsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"send" | "receive" | "both">("both");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();
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
      const res = await post("/dashboard/domains", { name, mode });
      setOpen(false); setName(""); setMode("both"); load();
      // Immediately open setup for the new domain
      openSetup(res.data);
    }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const [hasSavedCreds, setHasSavedCreds] = useState(false);

  const openSetup = async (domain: any) => {
    setSetupDomain(domain);
    setSetupResult(null);
    setVerifyResult(null);
    setTestResult(null);
    setSetupProvider("manual");
    setSetupCreds({ godaddy_key: "", godaddy_secret: "", cloudflare_token: "", cloudflare_zone_id: "" });
    setDetecting(true);
    setDetectedProvider(null);
    setHasSavedCreds(false);
    try {
      const res = await api(`/dashboard/domains/${domain.id}/detect-provider`);
      setDetectedProvider(res.data.provider);
      if (res.data.savedProvider) {
        setSetupProvider(res.data.savedProvider);
        setHasSavedCreds(true);
      } else if (res.data.provider === "godaddy" || res.data.provider === "cloudflare") {
        setSetupProvider(res.data.provider);
      }
    } catch (e: any) { setError(e.message || "Failed to detect DNS provider"); } finally { setDetecting(false); }
  };

  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const testCredentials = async () => {
    if (!setupDomain || setupProvider === "manual") return;
    setTesting(true); setTestResult(null);
    try {
      const res = await post(`/dashboard/domains/${setupDomain.id}/test-credentials`, { provider: setupProvider, ...setupCreds });
      setTestResult(res.data);
    } catch (e: any) { setTestResult({ success: false, error: e.message }); }
    finally { setTesting(false); }
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

  const remove = (id: string) => {
    confirm({
      title: "Delete this domain?",
      message: "DNS records and email history associated with this domain will be affected.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try { await del(`/dashboard/domains/${id}`); } catch (e: any) { showError(e.message || "Delete failed"); }
        load();
      },
    });
  };
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const verify = async (id: string) => {
    setVerifying(true); setVerifyResult(null);
    try {
      const res = await post(`/dashboard/domains/${id}/verify`, {});
      setVerifyResult(res.data);
      load();
    } catch (e: any) { setVerifyResult({ message: e.message }); }
    finally { setVerifying(false); }
  };

  const providerNames: Record<string, string> = { godaddy: "GoDaddy", cloudflare: "Cloudflare", namecheap: "Namecheap" };

  return (
    <div>
      <PageHeader title="Domains" desc="Manage domains for sending and receiving emails" action={<Button onClick={() => setOpen(true)}>+ Add Domain</Button>} />

      {/* Add Domain Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Domain">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Domain name" placeholder="mail.example.com" value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} />
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {([["both", "Send & Receive"], ["send", "Send Only"], ["receive", "Receive Only"]] as const).map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)} className={`px-3 py-2.5 rounded-xl text-[13px] font-medium border transition-all ${mode === m ? "border-violet-500/40 bg-violet-50 text-gray-900" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              {mode === "both" && "DNS records for SPF, DKIM, DMARC (sending) + MX (receiving) will be required. After verification, the service is fully active within 5-10 minutes."}
              {mode === "send" && "Only SPF, DKIM, DMARC records required. No MX needed. Sending is active within 5-10 minutes after verification."}
              {mode === "receive" && "Only MX record required. Receiving is active within 5-10 minutes after verification."}
            </p>
          </div>
          <Button onClick={add} disabled={loading}>{loading ? "Adding..." : "Add Domain"}</Button>
        </div>
      </Modal>

      {/* DNS Records Detail Modal */}
      <Modal open={!!detail && !setupDomain} onClose={() => setDetail(null)} title={`DNS Records — ${detail?.name || ""}`}>
        {detail?.records?.map((r: any) => (
          <div key={r.purpose} className="mb-3 p-3 rounded-xl bg-gray-50 border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[12px] font-semibold text-gray-500">{r.purpose} ({r.type})</span>
              <div className="flex items-center gap-2"><Dot ok={r.verified} /><CopyButton text={r.value} /></div>
            </div>
            <p className="text-[11px] text-gray-500 mb-1">Name: <span className="text-gray-600 font-mono">{r.name}</span></p>
            <p className="text-[11px] text-gray-600 font-mono break-all leading-relaxed">{r.value}</p>
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
          <div className="flex items-center gap-2 text-[13px] text-gray-500 py-4"><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" /><path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Detecting DNS provider...</div>
        ) : (
          <div className="space-y-4">
            {detectedProvider && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-[13px] text-emerald-600">Detected: <strong>{providerNames[detectedProvider] || detectedProvider}</strong></span>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-2">Setup method</label>
              <div className="grid grid-cols-3 gap-2">
                {(["godaddy", "cloudflare", "manual"] as const).map((p) => (
                  <button key={p} onClick={() => setSetupProvider(p)}
                    className={`px-3 py-2.5 rounded-xl text-[13px] font-medium border transition-all ${setupProvider === p ? "border-violet-500/40 bg-violet-50 text-gray-900" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                    {p === "manual" ? "Manual" : providerNames[p]}
                  </button>
                ))}
              </div>
            </div>

            {setupProvider === "godaddy" && (
              <div className="space-y-3">
                {hasSavedCreds && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-[13px] text-violet-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    Credentials saved. Leave blank to reuse saved keys, or enter new ones to update.
                  </div>
                )}
                <p className="text-[12px] text-gray-500">Get <strong className="text-gray-500">Production</strong> keys (not OTE/test) at <a href="https://developer.godaddy.com/keys" target="_blank" className="text-violet-600 hover:text-violet-700">developer.godaddy.com/keys</a></p>
                <Input label="API Key" placeholder={hasSavedCreds ? "••••••••••••••• (saved)" : "GoDaddy API Key"} type="password" value={setupCreds.godaddy_key} onChange={(e) => { setSetupCreds({ ...setupCreds, godaddy_key: (e.target as HTMLInputElement).value }); setTestResult(null); }} />
                <Input label="API Secret" placeholder={hasSavedCreds ? "••••••••••••••• (saved)" : "GoDaddy API Secret"} type="password" value={setupCreds.godaddy_secret} onChange={(e) => { setSetupCreds({ ...setupCreds, godaddy_secret: (e.target as HTMLInputElement).value }); setTestResult(null); }} />
                {testResult && (
                  <div className={`px-3 py-2.5 rounded-xl border text-[13px] ${testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-red-50 border-red-200 text-red-600"}`}>
                    <p className="font-medium">{testResult.success ? "✓ " : "✗ "}{testResult.message || testResult.error}</p>
                    {testResult.hint && <p className="mt-1 text-[12px] opacity-80">{testResult.hint}</p>}
                    {testResult.status && <p className="mt-0.5 text-[11px] opacity-60">HTTP {testResult.status}</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={testCredentials} disabled={testing || (!hasSavedCreds && (!setupCreds.godaddy_key || !setupCreds.godaddy_secret))}>{testing ? "Testing..." : "Test Connection"}</Button>
                  <Button onClick={runAutoSetup} disabled={setupLoading || (!hasSavedCreds && (!setupCreds.godaddy_key || !setupCreds.godaddy_secret))}>{setupLoading ? "Setting up DNS..." : "Auto-Configure DNS"}</Button>
                </div>
              </div>
            )}

            {setupProvider === "cloudflare" && (
              <div className="space-y-3">
                {hasSavedCreds && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-[13px] text-violet-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    Credentials saved. Leave blank to reuse, or enter new ones to update.
                  </div>
                )}
                <p className="text-[12px] text-gray-500">Create a token at <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" className="text-violet-600 hover:text-violet-700">Cloudflare Dashboard</a> with "Zone DNS Edit" permission</p>
                <Input label="API Token" placeholder={hasSavedCreds ? "••••••••••••••• (saved)" : "Cloudflare API Token"} type="password" value={setupCreds.cloudflare_token} onChange={(e) => { setSetupCreds({ ...setupCreds, cloudflare_token: (e.target as HTMLInputElement).value }); setTestResult(null); }} />
                <Input label="Zone ID" placeholder="Found on your domain's overview page" value={setupCreds.cloudflare_zone_id} onChange={(e) => { setSetupCreds({ ...setupCreds, cloudflare_zone_id: (e.target as HTMLInputElement).value }); setTestResult(null); }} />
                {testResult && (
                  <div className={`px-3 py-2.5 rounded-xl border text-[13px] ${testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-red-50 border-red-200 text-red-600"}`}>
                    <p className="font-medium">{testResult.success ? "✓ " : "✗ "}{testResult.message || testResult.error}</p>
                    {testResult.hint && <p className="mt-1 text-[12px] opacity-80">{testResult.hint}</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={testCredentials} disabled={testing || (!hasSavedCreds && (!setupCreds.cloudflare_token || !setupCreds.cloudflare_zone_id))}>{testing ? "Testing..." : "Test Connection"}</Button>
                  <Button onClick={runAutoSetup} disabled={setupLoading || (!hasSavedCreds && (!setupCreds.cloudflare_token || !setupCreds.cloudflare_zone_id))}>{setupLoading ? "Setting up DNS..." : "Auto-Configure DNS"}</Button>
                </div>
              </div>
            )}

            {setupProvider === "manual" && (
              <div className="space-y-3">
                {setupDomain?.mailHostConfigured === false && (
                  <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-red-50 border border-red-200 text-[13px] text-red-600">
                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                    <div>
                      <p className="font-medium">Mail host not configured</p>
                      <p className="text-red-500 mt-0.5">Set the <code className="bg-red-100 px-1 rounded">MAIL_HOST</code> environment variable to your server's public hostname. MX and SPF records need this to work correctly.</p>
                    </div>
                  </div>
                )}
                <p className="text-[13px] text-gray-500">Add these DNS records with your domain registrar:</p>
                {setupDomain?.records?.map((r: any) => (
                  <div key={r.purpose} className="p-3 rounded-xl bg-gray-50 border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[12px] font-semibold text-gray-500">{r.purpose} ({r.type})</span>
                      <CopyButton text={r.value} />
                    </div>
                    <p className="text-[11px] text-gray-500">Name: <span className="text-gray-600 font-mono">{r.name}</span></p>
                    <p className="text-[11px] text-gray-600 font-mono break-all mt-1">{r.value}</p>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => verify(setupDomain.id)} disabled={verifying}>{verifying ? "Checking DNS..." : "I've added the records — Verify now"}</Button>
              </div>
            )}

            {setupResult && (
              <div className="mt-3 space-y-2">
                {setupResult.results?.map((r: any) => (
                  <div key={r.purpose} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${r.success ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                    {r.success ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                    <span className="font-medium">{r.purpose}:</span> {r.success ? (r.detail || "done") : r.error}
                  </div>
                ))}
                {setupResult.success && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[12px] text-emerald-600">DNS records configured successfully. After verification, it takes about 5-10 minutes for sending and receiving to become fully active.</p>
                    <Button onClick={() => verify(setupDomain.id)} disabled={verifying}>{verifying ? "Verifying..." : "Verify DNS Now"}</Button>
                  </div>
                )}
              </div>
            )}
            {/* DNS Debug Check */}
            {setupDomain && (
              <div className="mt-3">
                <button onClick={async () => {
                  try {
                    const res = await api(`/dashboard/domains/${setupDomain.id}/dns-check`);
                    setVerifyResult({ ...verifyResult, dnsDebug: res.data });
                  } catch (e: any) { setError(e.message || "DNS check failed"); }
                }} className="text-[12px] text-gray-500 hover:text-gray-900 underline">Debug: Check what GoDaddy & DNS actually see</button>
                {verifyResult?.dnsDebug && (
                  <pre className="mt-2 p-3 rounded-xl bg-gray-100 text-[11px] text-gray-500 font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">{JSON.stringify(verifyResult.dnsDebug, null, 2)}</pre>
                )}
              </div>
            )}

            {verifyResult && !verifyResult.dnsDebug && (
              <div className={`mt-3 p-3 rounded-xl border text-[13px] ${verifyResult.status === "verified" ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-amber-50 border-amber-200 text-amber-600"}`}>
                <p className="font-medium mb-1">{verifyResult.status === "verified" ? "Domain verified!" : "Verification results:"}</p>
                <p>{verifyResult.message}</p>
                {verifyResult.status === "verified" && (
                  <p className="text-[12px] mt-1 opacity-80">Sending and receiving will be fully active within 5-10 minutes.</p>
                )}
                {verifyResult.status !== "verified" && (
                  <div className="flex gap-3 mt-2 text-[12px]">
                    <span>SPF: {verifyResult.spf ? "OK" : "pending"}</span>
                    <span>DKIM: {verifyResult.dkim ? "OK" : "pending"}</span>
                    <span>DMARC: {verifyResult.dmarc ? "OK" : "pending"}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {items.length === 0 ? <EmptyState title="No domains" desc="Add a domain to start sending and receiving emails" /> : (
        <Table headers={["Domain", "Mode", "Status", "DNS Records", "Actions"]}>
          {items.map((d) => (
            <tr key={d.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900 text-[13px] font-medium font-mono cursor-pointer hover:text-violet-600" onClick={() => setDetail(d)}>{d.name}</td>
              <td className="px-4 py-3"><Badge variant="default">{d.mode || "both"}</Badge></td>
              <td className="px-4 py-3"><Badge variant={statusVariant(d.status)}>{d.status}</Badge></td>
              <td className="px-4 py-3"><div className="flex gap-2">{d.records?.map((r:any) => <span key={r.purpose} className="flex items-center gap-1 text-[11px] text-gray-500"><Dot ok={r.verified} />{r.purpose.split(" ")[0]}</span>)}</div></td>
              <td className="px-4 py-3 text-right">
                <div className="flex gap-1">
                  <button onClick={() => openSetup(d)} className="px-2 py-1 text-[12px] text-violet-600 hover:bg-violet-50 rounded-lg">Setup</button>
                  <button onClick={() => verify(d.id)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">Verify</button>
                  <button onClick={() => remove(d.id)} className="px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded-lg">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {confirmDialog}
      {toast}
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
  const [error, setError] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();

  const load = () => api("/dashboard/api-keys").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError(""); setLoading(true);
    try { const res = await post("/dashboard/api-keys", { name }); setNewKey(res.data.key); setName(""); load(); }
    catch (e: any) { setError(e.message || "Failed to create API key"); } finally { setLoading(false); }
  };

  const revoke = (id: string) => {
    confirm({
      title: "Revoke this API key?",
      message: "Any applications using this key will lose access immediately.",
      confirmLabel: "Revoke",
      onConfirm: async () => {
        try { await del(`/dashboard/api-keys/${id}`); } catch (e: any) { showError(e.message || "Revoke failed"); }
        load();
      },
    });
  };

  return (
    <div>
      <PageHeader title="API Keys" desc="Create and manage API keys" action={<Button onClick={() => { setOpen(true); setNewKey(""); }}>+ Create Key</Button>} />
      <Modal open={open} onClose={() => setOpen(false)} title={newKey ? "Key Created" : "Create API Key"}>
        {newKey ? (
          <div>
            <p className="text-[13px] text-gray-500 mb-3">Copy this key now — it won't be shown again.</p>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200 shadow-sm">
              <code className="text-[13px] text-emerald-600 font-mono flex-1 break-all">{newKey}</code>
              <CopyButton text={newKey} />
            </div>
            <div className="mt-4"><Button onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input label="Key name" placeholder="e.g. Production" value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} />
            {error && <p className="text-red-600 text-[13px]">{error}</p>}
            <Button onClick={create} disabled={loading || !name}>{loading ? "Creating..." : "Create Key"}</Button>
          </div>
        )}
      </Modal>
      {items.length === 0 ? <EmptyState title="No API keys" desc="Create a key to authenticate API requests" /> : (
        <Table headers={["Name", "Key", "Rate Limit", "Last Used", ""]}>
          {items.map((k) => (
            <tr key={k.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900 text-[13px] font-medium">{k.name}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px] font-mono">{k.key_prefix}••••••••</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{k.rate_limit}/min</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : <span className="text-gray-300">Never</span>}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => revoke(k.id)} className="px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded-lg">Revoke</button></td>
            </tr>
          ))}
        </Table>
      )}
      {confirmDialog}
      {toast}
    </div>
  );
}

// --- WEBHOOKS with create/delete + delivery log ---
function WebhooksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedWebhook, setSelectedWebhook] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { showError, toast } = useToast();

  const load = () => api("/dashboard/webhooks").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const loadDeliveries = async (webhook: any) => {
    setSelectedWebhook(webhook);
    setDeliveriesLoading(true);
    try {
      const res = await api(`/dashboard/webhooks/${webhook.id}/deliveries`);
      setDeliveries(res.data);
    } catch { setDeliveries([]); }
    finally { setDeliveriesLoading(false); }
  };

  const create = async () => {
    setError(""); setLoading(true);
    try {
      await post("/dashboard/webhooks", { url, events: ["email.sent", "email.delivered", "email.bounced", "email.opened", "email.clicked", "email.failed"] });
      setOpen(false); setUrl(""); load();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const remove = (id: string) => {
    confirm({
      title: "Delete this webhook?",
      message: "This webhook will stop receiving event notifications immediately.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try { await del(`/dashboard/webhooks/${id}`); } catch (e: any) { showError(e.message || "Delete failed"); }
        load();
      },
    });
  };

  return (
    <div>
      <PageHeader title="Webhooks" desc="Receive real-time email event notifications" action={<Button onClick={() => setOpen(true)}>+ Add Webhook</Button>} />
      <Modal open={open} onClose={() => setOpen(false)} title="Add Webhook">
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>}
        <div className="space-y-3">
          <Input label="Endpoint URL" placeholder="https://yourapp.com/webhook" value={url} onChange={(e) => setUrl((e.target as HTMLInputElement).value)} />
          <p className="text-[12px] text-gray-500">Subscribes to: sent, delivered, bounced, opened, clicked, failed</p>
          <Button onClick={create} disabled={loading || !url}>{loading ? "Adding..." : "Add Webhook"}</Button>
        </div>
      </Modal>
      {items.length === 0 ? <EmptyState title="No webhooks" desc="Add a webhook to receive delivery events" /> : (
        <Table headers={["URL", "Events", "Status", "Secret", ""]}>
          {items.map((w) => (
            <tr key={w.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => loadDeliveries(w)}>
              <td className="px-4 py-3 text-gray-900 text-[13px] font-mono truncate max-w-[200px]">{w.url}</td>
              <td className="px-4 py-3 text-gray-500 text-[13px]">{w.events?.length || 0} events</td>
              <td className="px-4 py-3"><Badge variant={w.active ? "success" : "default"}>{w.active ? "Active" : "Inactive"}</Badge></td>
              <td className="px-4 py-3"><div className="flex items-center gap-1"><code className="text-[11px] text-gray-400 font-mono">{w.signing_secret?.slice(0, 12)}...</code><CopyButton text={w.signing_secret || ""} /></div></td>
              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}><button onClick={() => remove(w.id)} className="px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded-lg">Delete</button></td>
            </tr>
          ))}
        </Table>
      )}

      {/* Webhook Deliveries Modal */}
      <Modal open={!!selectedWebhook} onClose={() => setSelectedWebhook(null)} title={`Deliveries — ${selectedWebhook?.url || ""}`}>
        {deliveriesLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : deliveries.length === 0 ? (
          <p className="text-[13px] text-gray-400 py-4 text-center">No deliveries recorded yet</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {deliveries.map((d: any) => (
              <div key={d.id} className="p-3 rounded-xl border border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={d.status === "success" ? "success" : d.status === "failed" ? "error" : "default"}>{d.status}</Badge>
                  <span className="text-[12px] text-gray-500">Attempt {d.attempt_number}</span>
                  {d.response_status_code && <span className="text-[12px] text-gray-400">HTTP {d.response_status_code}</span>}
                  <span className="text-[11px] text-gray-400 ml-auto">{new Date(d.created_at).toLocaleString()}</span>
                </div>
                {d.event_type && <p className="text-[12px] text-gray-500 mt-1">Event: <span className="font-medium text-gray-700">{d.event_type}</span></p>}
                {d.error_message && <p className="text-[12px] text-red-500 mt-1">{d.error_message}</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
      {confirmDialog}
      {toast}
    </div>
  );
}

// InboxPage is now imported from ./dashboard/InboxPage

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

  const methodColor: Record<string, string> = { GET: "text-emerald-600", POST: "text-blue-600", PATCH: "text-amber-600", DELETE: "text-red-600", CRUD: "text-violet-600" };

  return (
    <div>
      <PageHeader title="API Documentation" desc={`v1.4.0 — Updated 2026-03-19 ${isAdmin ? "(Admin view)" : "(User view)"}`} />
      <div className="space-y-3">
        {sections.map((s) => (
          <details key={s.title} className="group rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
              {s.method && <span className={`text-[11px] font-bold font-mono w-14 ${methodColor[s.method] || "text-gray-500"}`}>{s.method}</span>}
              {s.path && <code className="text-[13px] text-gray-600 font-mono">{s.path}</code>}
              <span className="text-[13px] text-gray-500 ml-auto">{s.title}</span>
            </summary>
            <div className="px-5 pb-4 border-t border-gray-100 pt-3">
              <p className="text-[13px] text-gray-500 mb-3">{s.desc}</p>
              {s.code && <pre className="p-3 rounded-xl bg-gray-100 text-[12px] text-gray-600 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">{s.code}</pre>}
            </div>
          </details>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4"><h2 className="text-lg font-semibold text-amber-600 flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>Admin Endpoints</h2></div>
            {adminSections.map((s) => (
              <details key={s.title} className="group rounded-2xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
                <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-amber-50 transition-colors">
                  {s.method && <span className={`text-[11px] font-bold font-mono w-14 ${methodColor[s.method] || "text-gray-500"}`}>{s.method}</span>}
                  <code className="text-[13px] text-gray-600 font-mono">{s.path}</code>
                  <span className="text-[13px] text-gray-500 ml-auto">{s.title}</span>
                </summary>
                <div className="px-5 pb-4 border-t border-amber-100 pt-3">
                  <p className="text-[13px] text-gray-500 mb-3">{s.desc}</p>
                  {s.code && <pre className="p-3 rounded-xl bg-gray-100 text-[12px] text-gray-600 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">{s.code}</pre>}
                </div>
              </details>
            ))}
          </>
        )}
      </div>
      <div className="mt-6"><a href="/docs" target="_blank" className="text-[13px] text-violet-600 hover:text-violet-700 transition-colors">Open interactive Swagger UI &rarr;</a></div>
    </div>
  );
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("mailnowapi-theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50 antialiased">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-30 lg:hidden">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
        </button>
        <div className="flex-1 flex justify-center">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg></div>
            <span className="font-semibold text-[14px] text-gray-900 tracking-tight">MailNowAPI</span>
          </Link>
        </div>
        <div className="w-8" /> {/* Spacer for centering */}
      </div>
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl overflow-y-auto pt-[4.5rem] lg:pt-8">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="emails" element={<EmailsPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="audiences" element={<AudiencesPage />} />
          <Route path="broadcasts" element={<BroadcastsPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="warmup" element={<WarmupPage />} />
          <Route path="deliverability" element={<DeliverabilityPage />} />
          <Route path="domains" element={<DomainsPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="suppressions" element={<SuppressionsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="api-docs" element={<ApiDocsPage />} />
        </Routes>
      </main>
    </div>
  );
}
