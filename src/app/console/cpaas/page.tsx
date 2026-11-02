"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Radio } from "lucide-react";

import { getCpaasStatus, getFleet } from "@/lib/api";
import { useAdminAuth } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { Skeleton } from "@/components/skeleton";
import { fmtRelative, fmtNumber } from "@/lib/format";
import type { CircuitBreakerStatus, ProxyNumber } from "@/lib/types";

export default function CpaasPage() {
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

  const providers = cpaasQ.data ?? [];
  const numbers: ProxyNumber[] = fleetQ.data?.numbers ?? [];

  function poolCountFor(provider: string): number {
    return numbers.filter((n) => n.provider === provider).length;
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
            />
          ))}
        </div>
      )}

    </div>
  );
}

function ProviderCard({
  cb,
  poolCount,
  isRoot,
}: {
  cb: CircuitBreakerStatus;
  poolCount: number;
  isRoot: boolean;
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

      {/*
        There were Force Open and Force Close buttons here. No endpoint has ever
        existed behind them, so the only thing they did was raise a toast saying
        the feature was coming. A control that cannot act on an outage is worse
        than none during one.

        The breaker is driven by the health checks and the failures it counts.
        If it needs overriding by hand, that is a deploy, not a button.
      */}
      {isRoot && (
        <div className="mt-auto pt-5 border-t border-line">
          <p className="text-[12px] text-fg-3">
            This state is set by the health checks and the call failures the breaker counts.
            There is no manual override.
          </p>
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
