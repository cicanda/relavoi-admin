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
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="modal">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {danger && (
              <span className="w-9 h-9 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
            )}
            <h2 id="confirm-title" className={`modal-title min-w-0 ${danger ? "pt-1" : ""}`}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="icon-btn-xs -mr-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3">
          {description && <div className="text-sm text-fg-2 leading-relaxed">{description}</div>}
          {children && <div className="mt-4">{children}</div>}

          <div className="modal-actions mt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="btn btn-secondary"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              disabled={disabled || busy}
              className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
