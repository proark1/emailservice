import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

/**
 * ⌘K command palette — minimal, no external deps. Filters a flat list of
 * "go to X" and "do Y" actions; ⏎ runs the highlighted one. Lives at the
 * dashboard layout so every page gets it.
 *
 * Keep the action list short and stable so users can build muscle memory —
 * if it grows past ~20 entries we should add categories or a fuzzy matcher.
 */
export type Command = {
  id: string;
  label: string;
  hint?: string;
  /** Falls back to navigating to `path` if `run` is not provided. */
  path?: string;
  run?: () => void;
  icon?: ReactNode;
  /** Hide from results when this returns false. Useful for owner-only items. */
  show?: () => boolean;
};

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const visible = commands.filter((c) => !c.show || c.show());
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.hint?.toLowerCase().includes(q) ||
      c.path?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Keep the highlight in range when the result list shrinks.
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  if (!open) return null;

  const runCommand = (cmd: Command) => {
    onClose();
    if (cmd.run) cmd.run();
    else if (cmd.path) navigate(cmd.path);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[10vh] px-4 animate-fade-in" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl animate-scale-in overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); const cmd = filtered[activeIndex]; if (cmd) runCommand(cmd); }
            }}
            placeholder="Jump to a page or run an action…"
            aria-label="Search commands"
            className="flex-1 bg-transparent text-[14px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
          />
          <kbd className="text-[11px] text-gray-400 font-mono px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-gray-400">No matches. Try "domain", "key", "broadcast"…</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => runCommand(cmd)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors ${i === activeIndex ? "bg-violet-50 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
              >
                {cmd.icon && <span className="text-gray-400 dark:text-gray-500 shrink-0">{cmd.icon}</span>}
                <span className="font-medium">{cmd.label}</span>
                {cmd.hint && <span className="text-[12px] text-gray-400 ml-auto">{cmd.hint}</span>}
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 text-[11px] text-gray-400 flex items-center gap-3">
          <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">↑↓</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">↵</kbd> open</span>
          <span className="ml-auto">⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny "?" cheat sheet — opens on `?` key. Lists the keyboard shortcuts so
 * users can discover them without reading docs.
 */
export function KeyboardShortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  const rows: Array<{ keys: string; what: string }> = [
    { keys: "⌘ K  /  Ctrl K", what: "Open the command palette" },
    { keys: "?", what: "Show this cheat sheet" },
    { keys: "esc", what: "Close any dialog" },
    { keys: "/", what: "Focus the sidebar search" },
  ];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-xl animate-scale-in">
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-3">Keyboard shortcuts</h3>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.keys} className="flex items-center justify-between text-[13px]">
              <span className="text-gray-500 dark:text-gray-400">{r.what}</span>
              <kbd className="font-mono text-[12px] px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200">{r.keys}</kbd>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="text-[12px] text-gray-400 hover:text-gray-600">Close</button>
        </div>
      </div>
    </div>
  );
}
