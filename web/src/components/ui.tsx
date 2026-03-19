import { useState, type ReactNode } from "react";

export function Badge({ children, variant = "default" }: { children: string; variant?: "success" | "warning" | "error" | "default" }) {
  const s = { success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/10", warning: "bg-amber-500/10 text-amber-400 border-amber-500/10", error: "bg-red-500/10 text-red-400 border-red-500/10", default: "bg-zinc-500/10 text-zinc-400 border-zinc-500/10" };
  return <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${s[variant]}`}>{children}</span>;
}

export function statusVariant(s: string): "success" | "warning" | "error" | "default" {
  if (["sent", "delivered", "verified"].includes(s)) return "success";
  if (["queued", "sending", "pending"].includes(s)) return "warning";
  if (["failed", "bounced", "complained"].includes(s)) return "error";
  return "default";
}

export function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border border-white/[0.06] rounded-2xl bg-white/[0.01]">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" /></svg>
      </div>
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      <p className="text-[13px] text-zinc-600 mt-1">{desc}</p>
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-white/[0.06]">{headers.map((h) => <th key={h} className="text-left px-4 py-3 text-[12px] font-medium text-zinc-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-white/[0.04]">{children}</tbody>
      </table>
    </div>
  );
}

export function PageHeader({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div><h1 className="text-xl font-semibold text-white tracking-tight">{title}</h1><p className="text-sm text-zinc-500 mt-1">{desc}</p></div>
      {action}
    </div>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  const s = { primary: "bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/20", secondary: "border border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]", danger: "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/10" };
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium rounded-xl transition-all disabled:opacity-50 ${s[variant]}`}>{children}</button>;
}

export function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{label}</label>
      <input {...props} className="w-full h-10 px-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all" />
    </div>
  );
}

export function Textarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{label}</label>
      <textarea {...props} className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all resize-none" />
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#111113] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-[11px] text-zinc-500 hover:text-white transition-colors">
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function Dot({ ok }: { ok: boolean }) {
  return <div className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-400" : "bg-zinc-700"}`} />;
}
