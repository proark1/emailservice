import { useState, useEffect, useCallback, useRef, useId, type ReactNode } from "react";

// --- Badge ---
export function Badge({ children, variant = "default" }: { children: string; variant?: "success" | "warning" | "error" | "default" }) {
  const s: Record<string, string> = { success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800", warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800", error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800", default: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700" };
  return <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${s[variant]}`}>{children}</span>;
}

export function statusVariant(s: string): "success" | "warning" | "error" | "default" {
  if (["sent", "delivered", "verified", "active", "completed"].includes(s)) return "success";
  if (["queued", "sending", "pending", "paused", "scheduled"].includes(s)) return "warning";
  if (["failed", "bounced", "complained", "cancelled"].includes(s)) return "error";
  return "default";
}

// --- Empty State ---
export function EmptyState({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-200 rounded-2xl bg-white animate-fade-in dark:bg-gray-800 dark:border-gray-700">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center mb-4 dark:bg-gray-700 dark:border-gray-600">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" /></svg>
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --- Table ---
export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden animate-fade-in dark:bg-gray-800 dark:border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/50">{headers.map((h) => <th key={h} className="text-left px-4 py-3 text-[12px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

// --- Page Header ---
export function PageHeader({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-3">
      <div><h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{title}</h1><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{desc}</p></div>
      {action}
    </div>
  );
}

// --- Button ---
export function Button({ children, onClick, variant = "primary", disabled, type = "button", size = "md" }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger"; disabled?: boolean; type?: "button" | "submit"; size?: "sm" | "md" | "lg";
}) {
  const variants: Record<string, string> = {
    primary: "bg-violet-600 hover:bg-violet-700 text-white shadow-sm active:scale-[0.98] dark:bg-violet-500 dark:hover:bg-violet-600",
    secondary: "border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 active:bg-red-150 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900 dark:border-red-800",
  };
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-[12px]",
    md: "px-4 py-2 text-[13px]",
    lg: "px-6 py-2.5 text-[14px]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${variants[variant]} ${sizes[size]}`}>
      {children}
    </button>
  );
}

// --- Input ---
export function Input({ label, error, ...props }: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={errorId} {...props} className={`w-full h-10 px-3.5 bg-white border rounded-xl text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500 ${error ? "border-red-400 ring-1 ring-red-200" : "border-gray-300"}`} />
      {error && <p id={errorId} className="text-[12px] text-red-500 mt-1 animate-slide-up">{error}</p>}
    </div>
  );
}

// --- Textarea ---
export function Textarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <textarea id={id} {...props} className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all resize-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500" />
    </div>
  );
}

// --- Modal ---
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = "hidden";
    setTimeout(() => modalRef.current?.focus(), 0);

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
      if (previousFocusRef.current instanceof HTMLElement) previousFocusRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={modalRef} tabIndex={-1} className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-gray-200 bg-white p-6 shadow-xl animate-scale-in outline-none dark:bg-gray-800 dark:border-gray-700`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --- Copy Button ---
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-[11px] text-gray-500 hover:text-violet-600 font-medium transition-colors">
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// --- Dot ---
export function Dot({ ok }: { ok: boolean }) {
  return <div className={`w-2 h-2 rounded-full transition-colors ${ok ? "bg-emerald-500" : "bg-gray-300"}`} />;
}

// --- Skeleton Loading ---
export function Skeleton({ className = "h-10 w-full" }: { className?: string }) {
  return <div className={`rounded-xl animate-shimmer ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-3 dark:bg-gray-800 dark:border-gray-700">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

// --- Confirm Dialog ---
export function ConfirmDialog({ open, onClose, onConfirm, title = "Are you sure?", message = "This action cannot be undone.", confirmLabel = "Confirm", variant = "danger" }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title?: string; message?: string; confirmLabel?: string; variant?: "danger" | "primary";
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl animate-scale-in dark:bg-gray-800 dark:border-gray-700">
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant={variant} size="sm" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// --- useConfirmDialog Hook ---
export function useConfirmDialog() {
  const [state, setState] = useState<{ open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void }>({
    open: false, title: "", message: "", confirmLabel: "Confirm", onConfirm: () => {},
  });

  const confirm = useCallback((opts: { title: string; message: string; confirmLabel?: string; onConfirm: () => void }) => {
    setState({ open: true, title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel || "Confirm", onConfirm: opts.onConfirm });
  }, []);

  const dialog = (
    <ConfirmDialog
      open={state.open}
      onClose={() => setState((s) => ({ ...s, open: false }))}
      onConfirm={state.onConfirm}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
    />
  );

  return { confirm, dialog };
}

// --- Select ---
export function Select({ label, children, ...props }: { label: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <select id={id} {...props} className="w-full h-10 px-3.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all appearance-none cursor-pointer dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
        {children}
      </select>
    </div>
  );
}
