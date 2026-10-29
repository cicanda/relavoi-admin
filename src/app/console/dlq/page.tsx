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
            className="btn btn-secondary"
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
        <div className="rounded-card mb-[var(--gap)] h-[96px] animate-shimmer" />
      ) : count === 0 ? (
        <div className="bg-signal-500/10 border border-signal-500/30 text-signal-800 rounded-card card-pad mb-[var(--gap)] flex items-center gap-4">
          <span className="w-11 h-11 rounded-full bg-signal-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[clamp(1.125rem,1rem+0.4vw,1.375rem)] font-medium tracking-[-0.025em]">DLQ is empty</div>
            <div className="text-[13px] text-signal-800/80 mt-0.5">
              All webhook events have been processed successfully.
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-rose-500/[0.08] border border-rose-500/25 text-rose-700 rounded-card card-pad mb-[var(--gap)] flex items-start gap-4">
          <span className="w-11 h-11 rounded-full bg-rose-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[clamp(1.125rem,1rem+0.4vw,1.375rem)] font-medium tracking-[-0.025em]">
              {count} event{count === 1 ? "" : "s"} pending retry
            </div>
            <div className="text-[13px] text-rose-700/80 mt-1 max-w-2xl">
              These webhooks failed delivery and are queued for retry.
              Investigate any RETRYING entries that have hit their max retry
              count.
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="card card-pad mb-[var(--gap)]">
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-4">
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
          <div className="hidden lg:block flex-1" />
          {canMutate && (
            <button
              type="button"
              onClick={askRetryAll}
              disabled={count === 0 || retryM.isPending}
              className="btn btn-accent self-start lg:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry all PENDING
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
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
                    className="py-10 text-center text-sm text-fg-3"
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
                      <tr key={e.id}>
                        <Td className="font-mono whitespace-nowrap">{truncId(e.eventId)}</Td>
                        <Td className="font-mono uppercase">{e.provider}</Td>
                        <td
                          className="cursor-pointer max-w-[320px] min-w-[200px] hover:text-fg-2"
                          title={errStr}
                          onClick={() => toggleExpanded(e.id)}
                        >
                          <div className="flex items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-fg-3 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-fg-3 flex-shrink-0" />
                            )}
                            <span className="truncate">{errTrunc}</span>
                          </div>
                        </td>
                        <Td className="tabular-nums">
                          {(e.retryCount ?? 0)}/{e.maxRetries ?? 3}
                        </Td>
                        <td>
                          <StatePill state={e.status} size="sm" />
                        </td>
                        <Td className="text-fg-2 whitespace-nowrap">
                          {fmtRelative(e.firstReceivedAt)}
                        </Td>
                        <Td className="text-fg-2 whitespace-nowrap">
                          {fmtRelative(e.lastRetryAt)}
                        </Td>
                        {canMutate && (
                          <td>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => retryM.mutate([e.id])}
                                disabled={retryM.isPending}
                                className="btn btn-secondary btn-sm"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Retry
                              </button>
                              <button
                                type="button"
                                onClick={() => askAbandon(e)}
                                disabled={abandonM.isPending}
                                className="btn btn-danger-soft btn-sm"
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
                            className="bg-sunken/60"
                          >
                            <div className="code-block text-rose-300 whitespace-pre-wrap [overflow-wrap:anywhere]">
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
  return <th>{children}</th>;
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={className}>
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0">
      <span className="eyebrow text-fg-3 flex-shrink-0">
        {label}
      </span>
      <div className="chip-row">{children}</div>
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
      aria-pressed={active}
      data-active={active}
      className="chip"
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dlq-confirm-title">
      <div className="modal">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 id="dlq-confirm-title" className="modal-title">{action.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-xs -mr-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-fg-2 mb-6 leading-relaxed">{action.description}</p>
        <div className="modal-actions">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className={action.danger ? "btn btn-danger-soft" : "btn btn-accent"}
          >
            {busy ? "Working…" : action.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
