"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAdminAuth } from "@/lib/auth-store";
import { abandonDlq, listDlq, retryDlq } from "@/lib/api";
import { fmtRelative, truncId } from "@/lib/format";
import type { DlqEntry } from "@/lib/types";

type StatusFilter = "ALL" | "PENDING" | "RETRYING" | "RESOLVED" | "ABANDONED";
type ProviderFilter = "ALL" | string;

interface ConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export default function DlqPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const role = useAdminAuth((s) => s.operator?.role);
  const canMutate = role === "ROOT" || role === "SRE";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const apiFilters = useMemo(() => {
    const f: { status?: string; provider?: string } = {};
    if (statusFilter !== "ALL") f.status = statusFilter;
    if (providerFilter !== "ALL") f.provider = providerFilter;
    return f;
  }, [statusFilter, providerFilter]);

  const dlqQ = useQuery({
    queryKey: ["dlq", apiFilters],
    queryFn: () => listDlq(apiFilters),
    refetchInterval: 15_000,
  });

  function explainError(err: unknown, fallback: string): string {
    if (isAxiosError(err) && err.response?.status === 404) {
      return "Endpoint not yet implemented";
    }
    if (err instanceof Error) return err.message;
    return fallback;
  }

  const retryM = useMutation({
    mutationFn: (ids: string[]) => retryDlq(ids),
    onSuccess: (res) => {
      toast.success("Retry queued", `${res.retrying ?? 0} event(s) re-enqueued`);
      qc.invalidateQueries({ queryKey: ["dlq"] });
    },
    onError: (err) => {
      const msg = explainError(err, "Retry failed");
      if (msg === "Endpoint not yet implemented") {
        toast.info("Endpoint coming soon", msg);
      } else {
        toast.error("Retry failed", msg);
      }
    },
  });

  const abandonM = useMutation({
    mutationFn: (id: string) => abandonDlq(id),
    onSuccess: () => {
      toast.success("Event abandoned");
      qc.invalidateQueries({ queryKey: ["dlq"] });
    },
    onError: (err) => {
      const msg = explainError(err, "Abandon failed");
      if (msg === "Endpoint not yet implemented") {
        toast.info("Endpoint coming soon", msg);
      } else {
        toast.error("Abandon failed", msg);
      }
    },
  });

  const rows: DlqEntry[] = dlqQ.data?.data ?? [];
  const count = dlqQ.data?.pagination?.count ?? rows.length;

  // Derive available providers from data, plus the two well-known ones.
  const providers = useMemo(() => {
    const set = new Set<string>(["AFRICASTALKING", "TWILIO"]);
    rows.forEach((r) => r.provider && set.add(r.provider.toUpperCase()));
    return Array.from(set).sort();
  }, [rows]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function askRetryAll() {
    setConfirm({
      title: "Retry all PENDING events?",
      description:
        "This re-enqueues every PENDING event in the dead letter queue. Already-RETRYING entries are skipped by the backend.",
      confirmLabel: "Retry all",
      onConfirm: async () => {
        await retryM.mutateAsync([]);
      },
    });
  }

  function askAbandon(entry: DlqEntry) {
    setConfirm({
      title: "Abandon this event?",
      description: `Event ${truncId(entry.eventId)} from ${entry.provider} will be marked ABANDONED and won't be retried.`,
      confirmLabel: "Abandon",
      danger: true,
      onConfirm: async () => {
        await abandonM.mutateAsync(entry.id);
      },
    });
  }

  const colCount = canMutate ? 8 : 7;

  return (
    <>
      <PageHeader
        title="Dead Letter Queue"
        description="Webhook events that failed processing and need attention"
        actions={
          <button
            type="button"
            onClick={() => dlqQ.refetch()}
            disabled={dlqQ.isFetching}
            className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${dlqQ.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        }
      />

      {/* Depth banner */}
      {dlqQ.isLoading ? (
        <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-5 mb-4 h-[88px] animate-shimmer" />
      ) : count === 0 ? (
        <div className="bg-signal-500/10 border border-signal-500/30 text-signal-500 rounded-[10px] shadow-card p-5 mb-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
          <div>
            <div className="text-lg font-semibold">DLQ is empty</div>
            <div className="text-xs text-signal-500/80 mt-0.5">
              All webhook events have been processed successfully.
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-[10px] shadow-card p-5 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-lg font-bold">
              {count} event{count === 1 ? "" : "s"} pending retry
            </div>
            <div className="text-xs text-rose-400/80 mt-1">
              These webhooks failed delivery and are queued for retry.
              Investigate any RETRYING entries that have hit their max retry
              count.
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <FilterGroup label="Status">
            {(["ALL", "PENDING", "RETRYING", "RESOLVED", "ABANDONED"] as const).map(
              (s) => (
                <FilterPill
                  key={s}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "ALL" ? "All" : s}
                </FilterPill>
              ),
            )}
          </FilterGroup>
          <FilterGroup label="Provider">
            <FilterPill
              active={providerFilter === "ALL"}
              onClick={() => setProviderFilter("ALL")}
            >
              All
            </FilterPill>
            {providers.map((p) => (
              <FilterPill
                key={p}
                active={providerFilter === p}
                onClick={() => setProviderFilter(p)}
              >
                {p}
              </FilterPill>
            ))}
          </FilterGroup>
          <div className="flex-1" />
          {canMutate && (
            <button
              type="button"
              onClick={askRetryAll}
              disabled={count === 0 || retryM.isPending}
              className="bg-signal-500 text-ink-900 px-4 h-10 rounded-md font-medium hover:bg-signal-600 text-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry all PENDING
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Event ID</Th>
                <Th>Provider</Th>
                <Th>Error</Th>
                <Th>Retries</Th>
                <Th>Status</Th>
                <Th>First Received</Th>
                <Th>Last Retry</Th>
                {canMutate && <Th>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {dlqQ.isLoading ? (
                <>
                  <SkeletonRow cols={colCount} />
                  <SkeletonRow cols={colCount} />
                  <SkeletonRow cols={colCount} />
                </>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-4 py-8 border-t border-ink-700 text-center text-sm text-ink-500"
                  >
                    No entries match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((e) => {
                  const isOpen = expanded.has(e.id);
                  const errStr = e.errorMessage ?? "—";
                  const errTrunc =
                    errStr.length > 50 ? `${errStr.slice(0, 50)}…` : errStr;
                  return (
                    <>
                      <tr
                        key={e.id}
                        className="hover:bg-ink-900/60 transition-colors"
                      >
                        <Td className="font-mono">{truncId(e.eventId)}</Td>
                        <Td className="font-mono uppercase">{e.provider}</Td>
                        <td
                          className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 cursor-pointer max-w-[320px]"
                          title={errStr}
                          onClick={() => toggleExpanded(e.id)}
                        >
                          <div className="flex items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-ink-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-ink-500 flex-shrink-0" />
                            )}
                            <span className="truncate">{errTrunc}</span>
                          </div>
                        </td>
                        <Td className="tabular-nums">
                          {(e.retryCount ?? 0)}/{e.maxRetries ?? 3}
                        </Td>
                        <td className="px-4 py-3 border-t border-ink-700">
                          <StatePill state={e.status} size="sm" />
                        </td>
                        <Td className="text-ink-400">
                          {fmtRelative(e.firstReceivedAt)}
                        </Td>
                        <Td className="text-ink-400">
                          {fmtRelative(e.lastRetryAt)}
                        </Td>
                        {canMutate && (
                          <td className="px-4 py-3 border-t border-ink-700">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => retryM.mutate([e.id])}
                                disabled={retryM.isPending}
                                className="bg-ink-800 border border-ink-700 text-paper px-2 h-7 rounded-md hover:bg-ink-700 text-[11px] transition-colors flex items-center gap-1 disabled:opacity-50"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Retry
                              </button>
                              <button
                                type="button"
                                onClick={() => askAbandon(e)}
                                disabled={abandonM.isPending}
                                className="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 h-7 rounded-md hover:bg-rose-500/25 text-[11px] transition-colors flex items-center gap-1 disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                                Abandon
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr key={`${e.id}-detail`}>
                          <td
                            colSpan={colCount}
                            className="px-4 py-3 border-t border-ink-700 bg-ink-900/40"
                          >
                            <div className="bg-ink-900 border border-ink-700 rounded-md p-3 font-mono text-[12px] text-rose-400 whitespace-pre-wrap break-words">
                              {errStr}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          action={confirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 ${className}`}
    >
      {children}
    </td>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 h-7 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors ${
        active
          ? "bg-signal-500/15 text-signal-500 border border-signal-500/30"
          : "bg-ink-900 text-ink-400 border border-ink-700 hover:text-paper hover:border-ink-500"
      }`}
    >
      {children}
    </button>
  );
}

function ConfirmModal({
  action,
  onClose,
}: {
  action: ConfirmAction;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await action.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-6 max-w-md w-full">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-semibold text-paper">{action.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-500 hover:text-paper transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-ink-300 mb-5">{action.description}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className={
              action.danger
                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30 px-4 h-10 rounded-md hover:bg-rose-500/25 text-sm transition-colors disabled:opacity-50"
                : "bg-signal-500 text-ink-900 px-4 h-10 rounded-md font-medium hover:bg-signal-600 text-sm transition-colors disabled:opacity-50"
            }
          >
            {busy ? "Working…" : action.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
