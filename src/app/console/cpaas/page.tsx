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
            className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${cpaasQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {cpaasQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-8 text-center">
          <div className="w-12 h-12 rounded-md bg-ink-900 flex items-center justify-center mx-auto mb-3">
            <Radio className="w-5 h-5 text-ink-500" />
          </div>
          <div className="text-sm text-ink-300">No providers configured</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        <div className="fixed inset-0 z-50 bg-ink-900/70 flex items-center justify-center p-4">
          <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-paper mb-1">
              Force circuit {confirm.state}
            </h2>
            <p className="text-sm text-ink-400 mb-4">
              This will override the automated breaker state for{" "}
              <span className="font-mono text-paper uppercase">{confirm.provider}</span>. New
              sessions will{" "}
              {confirm.state === "OPEN"
                ? "stop routing through this provider"
                : "resume routing through this provider"}
              .
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm"
              >
                Cancel
              </button>
              {confirm.state === "OPEN" ? (
                <button
                  onClick={handleForce}
                  disabled={busy}
                  className="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-4 h-9 rounded-md hover:bg-rose-500/25 text-sm disabled:opacity-50"
                >
                  {busy ? "Forcing…" : "Confirm Force Open"}
                </button>
              ) : (
                <button
                  onClick={handleForce}
                  disabled={busy}
                  className="bg-signal-500 text-ink-900 px-4 h-9 rounded-md font-medium hover:bg-signal-600 text-sm disabled:opacity-50"
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
    <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="text-lg font-semibold text-paper font-mono uppercase tracking-wider">
          {cb.provider}
        </div>
        <span
          className={`w-6 h-6 rounded-full ${dotColor} ${cb.state === "OPEN" ? "animate-pulse" : ""}`}
          aria-label={cb.state}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatBlock label="State">
          <StatePill state={cb.state} />
        </StatBlock>
        <StatBlock label="Opened">
          <div className="text-[13px] text-ink-200">
            {cb.state === "CLOSED" ? "—" : fmtRelative(cb.openedAt)}
          </div>
        </StatBlock>
        <StatBlock label="Failures">
          <div className="text-[13px] text-paper font-mono tabular-nums">
            {fmtNumber(cb.failureCount ?? 0)}
          </div>
        </StatBlock>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatBlock label="Numbers in pool">
          <div className="text-[13px] text-paper font-mono tabular-nums">
            {fmtNumber(poolCount)}
          </div>
        </StatBlock>
        <StatBlock label="Active sessions">
          <div className="text-[13px] text-ink-500">—</div>
        </StatBlock>
        <StatBlock label="Calls today">
          <div className="text-[13px] text-ink-500">—</div>
        </StatBlock>
      </div>

      {cb.lastError && (
        <div className="bg-ink-900 border border-rose-500/30 rounded-md p-3 font-mono text-[12px] text-rose-400 mb-4 break-words">
          {cb.lastError}
        </div>
      )}

      {isRoot && (
        <div className="flex items-center gap-2 pt-2 border-t border-ink-700">
          <button
            onClick={() => onForce("OPEN")}
            className="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-4 h-9 rounded-md hover:bg-rose-500/25 text-sm"
          >
            Force Open
          </button>
          <button
            onClick={() => onForce("CLOSED")}
            className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm"
          >
            Force Close
          </button>
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}
