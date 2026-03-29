import { useState, createContext, useContext, useCallback, useRef, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; message: string; type: ToastType };

const ToastContext = createContext<{ toast: (message: string, type?: ToastType) => void }>({ toast: () => {} });

export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    const duration = type === "error" ? 8000 : 4000;
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const colors = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
    info: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  };

  const icons = {
    success: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
    info: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[100] space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg text-[13px] font-medium max-w-sm animate-[slideUp_0.3s_ease-out] ${colors[t.type]}`}>
            {icons[t.type]}
            <p className="flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="ml-1 opacity-60 hover:opacity-100 transition-opacity">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
