"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Hash,
  RefreshCw,
  Radio,
  Server,
  Activity,
  Lock,
  AlertTriangle,
} from "lucide-react";

import { getFleet, quarantineNumber, releaseNumber } from "@/lib/api";
import { useAdminAuth } from "@/lib/auth-store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { fmtRelative, fmtNumber } from "@/lib/format";
import type { ProxyNumber, PoolStatus } from "@/lib/types";

type StatusFilter = "ALL" | "AVAILABLE" | "IN_USE" | "COOLDOWN" | "QUARANTINED";
type ProviderFilter = "ALL" | "AFRICASTALKING" | "TWILIO" | "PLIVO";

interface Totals {
  total: number;
  available: number;
  inUse: number;
  cooldown: number;
  quarantined: number;
}

function deriveTotals(
  totals: Partial<Totals> | undefined,
  pool: PoolStatus[] | undefined,
  numbers: ProxyNumber[] | undefined,
): Totals {
  if (totals && totals.total != null) {
    return {
      total: totals.total ?? 0,
      available: totals.available ?? 0,
      inUse: totals.inUse ?? 0,
      cooldown: totals.cooldown ?? 0,
      quarantined: totals.quarantined ?? 0,
    };
  }
  if (pool && pool.length > 0) {
    return pool.reduce<Totals>(
      (acc, p) => ({
        total: acc.total + (p.total ?? 0),
        available: acc.available + (p.available ?? 0),
        inUse: acc.inUse + (p.inUse ?? 0),
        cooldown: acc.cooldown + (p.cooldown ?? 0),
        quarantined: acc.quarantined + (p.quarantined ?? 0),
      }),
      { total: 0, available: 0, inUse: 0, cooldown: 0, quarantined: 0 },
    );
  }
  if (numbers && numbers.length > 0) {
    return numbers.reduce<Totals>(
      (acc, n) => ({
        total: acc.total + 1,
        available: acc.available + (n.status === "AVAILABLE" ? 1 : 0),
        inUse: acc.inUse + (n.status === "IN_USE" ? 1 : 0),
        cooldown: acc.cooldown + (n.status === "COOLDOWN" ? 1 : 0),
        quarantined: acc.quarantined + (n.status === "QUARANTINED" ? 1 : 0),
      }),
      { total: 0, available: 0, inUse: 0, cooldown: 0, quarantined: 0 },
    );
  }
  return { total: 0, available: 0, inUse: 0, cooldown: 0, quarantined: 0 };
}

function is404(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

export default function NumbersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const role = useAdminAuth((s) => s.operator?.role);
  const canManage = role === "ROOT" || role === "SRE";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("ALL");

  const [confirmAction, setConfirmAction] = useState<
    | { kind: "quarantine"; number: string }
    | { kind: "release"; number: string }
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fleet"],
    queryFn: getFleet,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const pool = data?.pools ?? [];
  const numbers = data?.numbers ?? [];
  const totals = deriveTotals(data?.totals, pool, numbers);

  const utilPct = totals.total > 0 ? Math.round((totals.inUse / totals.total) * 100) : 0;
  const fillColor =
    utilPct < 60 ? "bg-signal-500" : utilPct < 80 ? "bg-amber-500" : "bg-rose-500";

  const regions = useMemo(() => {
    const set = new Set<string>();
    numbers.forEach((n) => {
      if (n.region) set.add(n.region);
    });
    return Array.from(set).sort();
  }, [numbers]);

  const filteredNumbers = useMemo(() => {
    return numbers.filter((n) => {
      if (statusFilter !== "ALL" && n.status !== statusFilter) return false;
      if (regionFilter !== "ALL" && n.region !== regionFilter) return false;
      if (providerFilter !== "ALL" && n.provider !== providerFilter) return false;
      return true;
    });
  }, [numbers, statusFilter, regionFilter, providerFilter]);

  async function handleQuarantine(): Promise<void> {
    if (!confirmAction || confirmAction.kind !== "quarantine") return;
    setBusy(true);
    try {
      await quarantineNumber(confirmAction.number, reason);
      toast.success("Number quarantined", confirmAction.number);
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      setConfirmAction(null);
      setReason("");
    } catch (err: unknown) {
      if (is404(err)) {
        toast.info("Endpoint coming soon", "Quarantine API is not yet implemented on the backend.");
        setConfirmAction(null);
        setReason("");
      } else {
        toast.error("Quarantine failed", (err as Error).message ?? "Unknown error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRelease(): Promise<void> {
    if (!confirmAction || confirmAction.kind !== "release") return;
    setBusy(true);
    try {
      await releaseNumber(confirmAction.number);
      toast.success("Number released", confirmAction.number);
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      setConfirmAction(null);
    } catch (err: unknown) {
      if (is404(err)) {
        toast.info("Endpoint coming soon", "Release API is not yet implemented on the backend.");
        setConfirmAction(null);
      } else {
        toast.error("Release failed", (err as Error).message ?? "Unknown error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Number Pool"
        description="Provisioned proxy numbers across the platform"
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* Stat cards */}
      <div className="bento mb-[var(--gap)]">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1.5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        <StatCard label="Total" value={fmtNumber(totals.total)} icon={Hash} loading={isLoading} />
        <StatCard
          label="Available"
          value={fmtNumber(totals.available)}
          icon={Radio}
          accent="signal"
          loading={isLoading}
        />
        <StatCard
          label="In Use"
          value={fmtNumber(totals.inUse)}
          icon={Activity}
          accent="sky"
          loading={isLoading}
        />
        <StatCard
          label="Cooldown"
          value={fmtNumber(totals.cooldown)}
          icon={Server}
          accent="amber"
          loading={isLoading}
        />
        <StatCard
          label="Quarantined"
          value={fmtNumber(totals.quarantined)}
          icon={AlertTriangle}
          accent="rose"
          loading={isLoading}
        />
      </div>
      </div>

      {/* Utilization */}
      <div className="card card-pad mb-[var(--gap)]">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div className="eyebrow text-fg-2">
            Pool Utilization
          </div>
          <div className="text-[length:var(--text-stat)] font-light text-fg tabular-nums tracking-[-0.04em] leading-none">{utilPct}%</div>
        </div>
        <div className="bg-mute h-2.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${fillColor} transition-all duration-700`}
            style={{ width: `${Math.min(utilPct, 100)}%` }}
          />
        </div>
        <div className="mt-4 flex flex-col gap-1">
          <div className="text-sm text-fg">
            <span className="font-mono tabular-nums">{fmtNumber(totals.inUse)}</span> of{" "}
            <span className="font-mono tabular-nums">{fmtNumber(totals.total)}</span> numbers in
            use ({utilPct}%)
          </div>
          <div className="text-xs text-fg-3">
            <span className="font-mono tabular-nums">{fmtNumber(totals.available)}</span> available,{" "}
            <span className="font-mono tabular-nums">{fmtNumber(totals.cooldown)}</span> in cooldown
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card card-pad mb-[var(--gap)] space-y-4">
        <FilterRow
          label="Status"
          options={[
            { value: "ALL", label: "All" },
            { value: "AVAILABLE", label: "AVAILABLE" },
            { value: "IN_USE", label: "IN_USE" },
            { value: "COOLDOWN", label: "COOLDOWN" },
            { value: "QUARANTINED", label: "QUARANTINED" },
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
        <FilterRow
          label="Region"
          options={[
            { value: "ALL", label: "All" },
            ...regions.map((r) => ({ value: r, label: r })),
          ]}
          value={regionFilter}
          onChange={(v) => setRegionFilter(v)}
        />
        <FilterRow
          label="Provider"
          options={[
            { value: "ALL", label: "All" },
            { value: "AFRICASTALKING", label: "AFRICASTALKING" },
            { value: "TWILIO", label: "TWILIO" },
            { value: "PLIVO", label: "PLIVO" },
          ]}
          value={providerFilter}
          onChange={(v) => setProviderFilter(v as ProviderFilter)}
        />
      </div>

      {/* Numbers table */}
      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Region</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Last Used</th>
                <th>Health Check</th>
                {canManage && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} cols={canManage ? 7 : 6} />
                ))
              ) : filteredNumbers.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="empty-icon mb-3">
                        <Hash className="w-5 h-5 text-fg-3" />
                      </div>
                      <div className="text-[15px] text-fg">No numbers provisioned yet</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredNumbers.map((n) => {
                  const canQuarantine = n.status === "AVAILABLE" || n.status === "IN_USE";
                  const canRelease = n.status === "COOLDOWN" || n.status === "QUARANTINED";
                  return (
                    <tr key={n.number}>
                      <td className="font-mono whitespace-nowrap">
                        {n.number}
                      </td>
                      <td className="lowercase whitespace-nowrap">
                        {n.region ?? "Not set"}
                      </td>
                      <td className="font-mono uppercase">
                        {n.provider}
                      </td>
                      <td>
                        <StatePill state={n.status} />
                      </td>
                      <td className="text-fg-2 whitespace-nowrap">
                        {fmtRelative(n.lastUsedAt)}
                      </td>
                      <td className="text-fg-2 whitespace-nowrap">
                        {fmtRelative(n.healthCheckAt)}
                      </td>
                      {canManage && (
                        <td className="text-right">
                          {canQuarantine ? (
                            <button
                              onClick={() => {
                                setConfirmAction({ kind: "quarantine", number: n.number });
                                setReason("");
                              }}
                              className="btn btn-secondary btn-sm"
                            >
                              <Lock className="w-3 h-3" />
                              Quarantine
                            </button>
                          ) : canRelease ? (
                            <button
                              onClick={() => {
                                setConfirmAction({ kind: "release", number: n.number });
                              }}
                              className="btn btn-secondary btn-sm"
                            >
                              Release
                            </button>
                          ) : (
                            <span className="text-fg-3 text-xs">None</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="number-action-title">
          <div className="modal">
            <h2 id="number-action-title" className="modal-title">
              {confirmAction.kind === "quarantine" ? "Quarantine number" : "Release number"}
            </h2>
            <p className="text-sm text-fg-2 mt-1 mb-5">
              <span className="font-mono text-fg">{confirmAction.number}</span>
            </p>
            {confirmAction.kind === "quarantine" && (
              <div className="mb-5">
                <label className="field-label eyebrow">
                  Reason
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. abuse report, health check failures"
                  className="field w-full"
                />
              </div>
            )}
            <div className="modal-actions">
              <button
                onClick={() => {
                  setConfirmAction(null);
                  setReason("");
                }}
                disabled={busy}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              {confirmAction.kind === "quarantine" ? (
                <button
                  onClick={handleQuarantine}
                  disabled={busy}
                  className="btn btn-danger-soft"
                >
                  {busy ? "Quarantining…" : "Confirm Quarantine"}
                </button>
              ) : (
                <button
                  onClick={handleRelease}
                  disabled={busy}
                  className="btn btn-accent"
                >
                  {busy ? "Releasing…" : "Confirm Release"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 min-w-0">
      <div className="eyebrow text-fg-3 sm:w-20 flex-shrink-0">
        {label}
      </div>
      <div className="chip-row">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              data-active={active}
              className="chip"
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
