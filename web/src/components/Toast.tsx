import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; message: string; type: ToastType };

const ToastContext = createContext<{ toast: (message: string, type?: ToastType) => void }>({ toast: () => {} });

export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let nextId = 0;

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const colors = { success: "bg-emerald-600", error: "bg-red-600", info: "bg-violet-600" };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`${colors[t.type]} text-white px-4 py-3 rounded-xl shadow-lg text-[13px] font-medium max-w-sm animate-[slideUp_0.3s_ease-out]`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
