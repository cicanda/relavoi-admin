"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { RefreshCw, Radio } from "lucide-react";

import { getCpaasStatus, getFleet, forceCircuitState } from "@/lib/api";
import { useAdminAuth } from "@/lib/auth-store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { Skeleton } from "@/components/skeleton";
import { fmtRelative, fmtNumber } from "@/lib/format";
import type { CircuitBreakerStatus, ProxyNumber } from "@/lib/types";

function is404(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

export default function CpaasPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const role = useAdminAuth((s) => s.operator?.role);
  const isRoot = role === "ROOT";

  const cpaasQ = useQuery({
    queryKey: ["cpaas"],
    queryFn: getCpaasStatus,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const fleetQ = useQuery({
    queryKey: ["fleet"],
    queryFn: getFleet,
    staleTime: 30_000,
  });

  const [confirm, setConfirm] = useState<
    | { provider: string; state: "OPEN" | "CLOSED" }
    | null
  >(null);
  const [busy, setBusy] = useState(false);

  const providers = cpaasQ.data ?? [];
  const numbers: ProxyNumber[] = fleetQ.data?.numbers ?? [];

  function poolCountFor(provider: string): number {
    return numbers.filter((n) => n.provider === provider).length;
  }

  async function handleForce(): Promise<void> {
    if (!confirm) return;
    setBusy(true);
    try {
      await forceCircuitState(confirm.provider, confirm.state);
      toast.success(
        `Circuit forced ${confirm.state}`,
        `${confirm.provider} breaker updated.`,
      );
      await qc.invalidateQueries({ queryKey: ["cpaas"] });
      setConfirm(null);
    } catch (err: unknown) {
      if (is404(err)) {
        toast.info(
          "Endpoint coming soon",
          "Circuit override is not yet implemented on the backend.",
        );
        setConfirm(null);
      } else {
        toast.error("Force failed", (err as Error).message ?? "Unknown error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="CPaaS"
        description="Voice/SMS provider health and circuit breakers"
        actions={
          <button
            onClick={() => cpaasQ.refetch()}
            disabled={cpaasQ.isFetching}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${cpaasQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {cpaasQ.isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--gap)]">
          <Skeleton className="h-72 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      ) : providers.length === 0 ? (
        <div className="card card-pad py-14 text-center">
          <div className="empty-icon mx-auto mb-3">
            <Radio className="w-5 h-5 text-fg-3" />
          </div>
          <div className="text-[15px] text-fg">No providers configured</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--gap)]">
          {providers.map((cb) => (
            <ProviderCard
              key={cb.provider}
              cb={cb}
              poolCount={poolCountFor(cb.provider)}
              isRoot={isRoot}
              onForce={(state) => setConfirm({ provider: cb.provider, state })}
            />
          ))}
        </div>
      )}

      {confirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="force-circuit-title">
          <div className="modal">
            <h2 id="force-circuit-title" className="modal-title">
              Force circuit {confirm.state}
            </h2>
            <p className="text-sm text-fg-2 mt-2 mb-6 leading-relaxed">
              This will override the automated breaker state for{" "}
              <span className="font-mono text-fg uppercase">{confirm.provider}</span>. New
              sessions will{" "}
              {confirm.state === "OPEN"
                ? "stop routing through this provider"
                : "resume routing through this provider"}
              .
            </p>
            <div className="modal-actions">
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              {confirm.state === "OPEN" ? (
                <button
                  onClick={handleForce}
                  disabled={busy}
                  className="btn btn-danger-soft"
                >
                  {busy ? "Forcing…" : "Confirm Force Open"}
                </button>
              ) : (
                <button
                  onClick={handleForce}
                  disabled={busy}
                  className="btn btn-accent"
                >
                  {busy ? "Forcing…" : "Confirm Force Close"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  cb,
  poolCount,
  isRoot,
  onForce,
}: {
  cb: CircuitBreakerStatus;
  poolCount: number;
  isRoot: boolean;
  onForce: (state: "OPEN" | "CLOSED") => void;
}) {
  const dotColor =
    cb.state === "CLOSED"
      ? "bg-signal-500"
      : cb.state === "HALF_OPEN"
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <section className="card card-pad card-lift flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="text-[clamp(1.25rem,1.1rem+0.6vw,1.625rem)] font-normal text-fg uppercase tracking-[-0.02em] leading-tight break-all">
          {cb.provider}
        </div>
        <span
          className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ring-[6px] ring-current/15 ${dotColor} ${dotColor.replace("bg-", "text-")} ${cb.state === "OPEN" ? "animate-pulse" : ""}`}
          aria-label={cb.state}
        />
      </div>

      {/* One tile grid: two columns on phones so badges never overflow. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        <StatBlock label="State">
          <StatePill state={cb.state} />
        </StatBlock>
        <StatBlock label="Opened">
          <div className="text-[13px] text-fg">
            {cb.state === "CLOSED" ? "None" : fmtRelative(cb.openedAt)}
          </div>
        </StatBlock>
        <StatBlock label="Failures">
          <div className="text-[13px] text-fg font-mono tabular-nums">
            {fmtNumber(cb.failureCount ?? 0)}
          </div>
        </StatBlock>
        <StatBlock label="Numbers in pool">
          <div className="text-[13px] text-fg font-mono tabular-nums">
            {fmtNumber(poolCount)}
          </div>
        </StatBlock>
        <StatBlock label="Active sessions">
          <div className="text-[13px] text-fg-3">Not set</div>
        </StatBlock>
        <StatBlock label="Calls today">
          <div className="text-[13px] text-fg-3">Not set</div>
        </StatBlock>
      </div>

      {cb.lastError && (
        <div className="callout border-rose-500/25 bg-rose-500/[0.06] font-mono text-[12px] text-rose-700 mb-5 break-words">
          {cb.lastError}
        </div>
      )}

      {isRoot && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-5 border-t border-line">
          <button
            onClick={() => onForce("OPEN")}
            className="btn btn-danger-soft"
          >
            Force Open
          </button>
          <button
            onClick={() => onForce("CLOSED")}
            className="btn btn-secondary"
          >
            Force Close
          </button>
        </div>
      )}
    </section>
  );
}

function StatBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-sunken border border-line rounded-[14px] p-3 min-w-0">
      <div className="eyebrow text-fg-3 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
