"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Confirmation for an operator action that someone else will feel.
 *
 * Every action behind this dialog changes a tenant's standing: suspending a
 * workspace cuts its live traffic, approving one lets it place real calls. The
 * dialog exists so none of those is one stray click away.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  disabled = false,
  busy = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Confirm stays unavailable, e.g. a required reason is still too short. */
  disabled?: boolean;
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus lands inside the dialog rather than behind it.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="bg-ink-800 border border-ink-700 w-full sm:max-w-md rounded-t-[12px] sm:rounded-[10px] shadow-card max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-start gap-3 min-w-0">
            {danger && <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
            <h2 id="confirm-title" className="text-base font-semibold text-paper min-w-0">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="shrink-0 p-1 rounded text-ink-400 hover:text-paper transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {description && <div className="text-[13px] text-ink-300">{description}</div>}
          {children && <div className="mt-3">{children}</div>}

          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="bg-ink-900 border border-ink-700 text-ink-200 px-4 h-10 rounded-md text-sm hover:bg-ink-700 transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              disabled={disabled || busy}
              className={`px-4 h-10 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                danger
                  ? "bg-red-600 text-paper hover:bg-red-500"
                  : "bg-paper text-ink-900 hover:bg-ink-200"
              }`}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
