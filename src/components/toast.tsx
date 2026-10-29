"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Variant = "success" | "error" | "info";
interface Toast { id: string; variant: Variant; title: string; description?: string; }

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast: missing ToastProvider");
  return v;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((variant: Variant, title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, variant, title, description }]);
  }, []);

  const api: ToastApi = {
    success: (t, d) => push("success", t, d),
    error: (t, d) => push("error", t, d),
    info: (t, d) => push("info", t, d),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setToasts((p) => p.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  const Icon = toast.variant === "success" ? CheckCircle2 : toast.variant === "error" ? AlertTriangle : Info;
  const iconColor =
    toast.variant === "success" ? "text-signal-700 bg-signal-500/15"
    : toast.variant === "error" ? "text-rose-700 bg-rose-500/12"
    : "text-sky-800 bg-sky-500/12";

  return (
    <div className="bg-surface border border-line rounded-[18px] shadow-[var(--shadow-pop)] p-3 pr-2 flex items-start gap-3 animate-rise">
      <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconColor}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0 pt-1">
        <div className="text-sm font-medium text-fg">{toast.title}</div>
        {toast.description && <div className="text-xs text-fg-2 mt-0.5 break-words">{toast.description}</div>}
      </div>
      <button onClick={onDismiss} className="icon-btn-xs" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
