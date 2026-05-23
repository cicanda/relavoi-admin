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
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
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

  const accent =
    toast.variant === "success" ? "border-l-signal-500"
    : toast.variant === "error" ? "border-l-rose-500"
    : "border-l-sky-500";
  const Icon = toast.variant === "success" ? CheckCircle2 : toast.variant === "error" ? AlertTriangle : Info;
  const iconColor =
    toast.variant === "success" ? "text-signal-500"
    : toast.variant === "error" ? "text-rose-500"
    : "text-sky-500";

  return (
    <div className={`bg-ink-800 border border-ink-700 ${accent} border-l-4 rounded-lg shadow-card p-3 flex items-start gap-3`}>
      <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-paper">{toast.title}</div>
        {toast.description && <div className="text-xs text-ink-400 mt-0.5">{toast.description}</div>}
      </div>
      <button onClick={onDismiss} className="text-ink-500 hover:text-paper transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
