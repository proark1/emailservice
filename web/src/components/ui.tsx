import { useState, useEffect, useCallback, useRef, useContext, createContext, type ReactNode } from "react";

// --- Badge ---
export function Badge({ children, variant = "default" }: { children: ReactNode; variant?: "success" | "warning" | "error" | "default" | "info" }) {
  const s: Record<string, string> = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700",
    warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
    error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
    info: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700",
    default: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${s[variant]}`}>{children}</span>;
}

export function statusVariant(s: string): "success" | "warning" | "error" | "default" {
  if (["sent", "delivered", "verified", "active", "completed"].includes(s)) return "success";
  if (["queued", "sending", "pending", "paused", "scheduled"].includes(s)) return "warning";
  if (["failed", "bounced", "complained", "cancelled"].includes(s)) return "error";
  return "default";
}

// --- Empty State ---
// `action` is the primary CTA ("Add domain", "Create webhook", ...). Pages
// SHOULD provide one when the empty state has a meaningful next step — never
// leave the user looking at a blank page with no path forward.
export function EmptyState({ title, desc, action, icon }: { title: string; desc: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-900 animate-fade-in">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center mb-4">
        {icon ?? (
          <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" /></svg>
        )}
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1 max-w-md">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --- Table ---
export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden animate-fade-in">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">{headers.map((h) => <th key={h} className="text-left px-4 py-3 text-[12px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{children}</tbody>
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
export function Button({ children, onClick, variant = "primary", disabled, type = "button", size = "md", loading, title }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger"; disabled?: boolean; type?: "button" | "submit"; size?: "sm" | "md" | "lg"; loading?: boolean; title?: string;
}) {
  const variants: Record<string, string> = {
    primary: "bg-[#1f2542] hover:bg-[#161a31] text-white shadow-sm active:scale-[0.98]",
    secondary: "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600",
    danger: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800",
  };
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-[12px]",
    md: "px-4 py-2 text-[13px]",
    lg: "px-6 py-2.5 text-[14px]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} title={title}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${variants[variant]} ${sizes[size]}`}>
      {loading && (
        <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
          <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

// --- Input ---
//
// `validate` runs on blur AND on every change after the field has been blurred
// once, so the user gets real-time feedback after they've moved away from the
// field but isn't bombarded while they're still typing. Returning a string sets
// the error and flips `aria-invalid`; returning null clears it.
//
// Pages can still drive errors imperatively via `error` (e.g. a submit-time
// 400 from the API). When BOTH sources are present, the explicit `error` wins.
let inputIdSeq = 0;
function nextInputId() { return `i${++inputIdSeq}`; }

export function Input({ label, error, validate, hint, id: idProp, onBlur, onChange, ...props }: {
  label: string;
  error?: string;
  /** Called on blur and on subsequent changes; return an error string or null. */
  validate?: (value: string) => string | null;
  /** Helper text below the input when there is no error. */
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const idRef = useRef(idProp || nextInputId());
  const [touched, setTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched(true);
    if (validate) setLocalError(validate(e.target.value));
    onBlur?.(e);
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (touched && validate) setLocalError(validate(e.target.value));
    onChange?.(e);
  };

  const shownError = error ?? localError ?? undefined;
  const describedBy = shownError ? `${idRef.current}-err` : hint ? `${idRef.current}-hint` : undefined;

  return (
    <div>
      <label htmlFor={idRef.current} className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <input
        id={idRef.current}
        aria-invalid={!!shownError}
        aria-describedby={describedBy}
        onBlur={handleBlur}
        onChange={handleChange}
        {...props}
        className={`w-full h-10 px-3.5 bg-white dark:bg-gray-800 border rounded-xl text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all ${shownError ? "border-red-400 ring-1 ring-red-200" : "border-gray-300 dark:border-gray-600"}`}
      />
      {shownError ? (
        <p id={`${idRef.current}-err`} role="alert" className="text-[12px] text-red-500 mt-1 animate-slide-up">{shownError}</p>
      ) : hint ? (
        <p id={`${idRef.current}-hint`} className="text-[12px] text-gray-400 dark:text-gray-500 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

// --- Textarea ---
export function Textarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <textarea {...props} className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all resize-none" />
    </div>
  );
}

// --- Modal ---
export function Modal({ open, onClose, title, children, wide, size }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  const sizeClass = size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-3xl" : wide || size === "md" ? "max-w-2xl" : "max-w-md";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${sizeClass} max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl animate-scale-in`}>
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}

// --- Copy Button ---
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      aria-label={label ? `Copy ${label}` : "Copy"}
      className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-violet-600 font-medium transition-colors px-1.5 py-0.5 rounded-md hover:bg-violet-50 dark:hover:bg-violet-900/20">
      {copied ? (
        <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>Copied</>
      ) : (
        <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>Copy</>
      )}
    </button>
  );
}

// --- Dot ---
export function Dot({ ok }: { ok: boolean }) {
  return <div className={`w-2 h-2 rounded-full transition-colors ${ok ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} />;
}

// --- Skeleton Loading ---
export function Skeleton({ className = "h-10 w-full" }: { className?: string }) {
  return <div className={`rounded-xl animate-shimmer ${className}`} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

/**
 * Render N skeleton table rows that match a real Table's column count.
 * Use this in place of `<p>Loading...</p>` so users don't see CLS when data
 * arrives, and so screen readers see a `role="status"` live region.
 */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden" role="status" aria-label="Loading…">
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-3 ${c === 0 ? "w-1/4" : c === cols - 1 ? "w-16 ml-auto" : "w-1/3"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Confirm Dialog ---
//
// `requireText` turns the confirm into a type-to-confirm flow — the confirm
// button stays disabled until the user types the exact string (case-sensitive).
// Use for high-risk actions: deleting a domain with live emails, revoking an
// API key, deleting an account, permanent-delete of inbox mail.
export function ConfirmDialog({ open, onClose, onConfirm, title = "Are you sure?", message = "This action cannot be undone.", confirmLabel = "Confirm", variant = "danger", requireText }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title?: string; message?: string; confirmLabel?: string; variant?: "danger" | "primary"; requireText?: string;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);
  if (!open) return null;
  const guarded = !!requireText;
  const canConfirm = !guarded || typed === requireText;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl animate-scale-in">
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-4 whitespace-pre-line">{message}</p>
        {guarded && (
          <div className="mb-4">
            <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1.5">
              Type <code className="text-[12px] font-mono px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">{requireText}</code> to confirm
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full h-9 px-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
            />
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant={variant} size="sm" disabled={!canConfirm} onClick={() => { if (canConfirm) { onConfirm(); onClose(); } }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// --- useConfirmDialog Hook ---
export function useConfirmDialog() {
  const [state, setState] = useState<{ open: boolean; title: string; message: string; confirmLabel: string; requireText?: string; onConfirm: () => void }>({
    open: false, title: "", message: "", confirmLabel: "Confirm", onConfirm: () => {},
  });

  const confirm = useCallback((opts: { title: string; message: string; confirmLabel?: string; requireText?: string; onConfirm: () => void }) => {
    setState({ open: true, title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel || "Confirm", requireText: opts.requireText, onConfirm: opts.onConfirm });
  }, []);

  const dialog = (
    <ConfirmDialog
      open={state.open}
      onClose={() => setState((s) => ({ ...s, open: false }))}
      onConfirm={state.onConfirm}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      requireText={state.requireText}
    />
  );

  return { confirm, dialog };
}

// --- Toast — context-based, single viewport mounted at the layout ---
//
// Two callsite shapes are supported (one canonical, one back-compat):
//   • const { showError, showSuccess } = useToast();   showError("Boom");
//   • const { toast } = useToast();                     toast("Boom", "error");
// `toast` (the JSX element) is also returned so existing pages that render
// `{toast}` keep compiling — it's null when ToastProvider is mounted at the
// root, so the rendering is harmless.
type ToastVariant = "success" | "error" | "info";
type ToastItem = { id: number; message: string; variant: ToastVariant };

interface ToastApi {
  show: (message: string, variant?: ToastVariant) => void;
}
const ToastContext = createContext<ToastApi | null>(null);

// Module-level escape hatch so non-React code (api.ts) can fire toasts. Set
// when ToastProvider mounts; cleared on unmount. Falls back to no-op so tests
// without a provider don't crash.
let externalToast: (message: string, variant?: ToastVariant) => void = () => {};
export function fireToast(message: string, variant: ToastVariant = "error") {
  externalToast(message, variant);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    externalToast = show;
    return () => { externalToast = () => {}; };
  }, [show]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 pointer-events-none" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const isSuccess = t.variant === "success";
        const isError = t.variant === "error";
        const cls = isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          : isError
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200"
          : "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
        return (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg max-w-sm animate-slide-up ${cls}`} role="status">
            <p className="text-[13px] flex-1">{t.message}</p>
            <button onClick={() => onClose(t.id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Hook used by every page. When ToastProvider is mounted (it is, at the root
 * in App.tsx), `toast` is null and notifications go through the global viewport.
 * The shape preserves the legacy per-page `{toast}` rendering so we didn't have
 * to touch every page on consolidation.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  const showError = useCallback((msg: string) => ctx?.show(msg, "error"), [ctx]);
  const showSuccess = useCallback((msg: string) => ctx?.show(msg, "success"), [ctx]);
  // Legacy: `toast(message, type?)` — used by pages that called the old
  // Toast.tsx hook. Routes through the same context.
  const toastFn = useCallback((message: string, type: ToastVariant = "success") => ctx?.show(message, type), [ctx]);
  // Returned as an element for pages that still render `{toast}` in their JSX —
  // null because the provider's viewport handles rendering.
  const toast = null;
  return { showError, showSuccess, toast, toastFn };
}

// --- Tooltip ---
//
// Pure-CSS-controlled tiny tooltip. Wrap any inline element with a small
// info icon to give users a one-sentence explanation of jargon (e.g.
// "company-scoped key", "domain mode") without drowning the layout.
export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group ml-1 align-middle">
      <button type="button" tabIndex={0} aria-label={text} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-full">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
      </button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-2 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] leading-snug shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50">
        {text}
      </span>
    </span>
  );
}

// --- Select ---
export function Select({ label, children, ...props }: { label: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <select {...props} className="w-full h-10 px-3.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all appearance-none cursor-pointer">
        {children}
      </select>
    </div>
  );
}
