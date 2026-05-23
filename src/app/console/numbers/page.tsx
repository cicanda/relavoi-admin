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

  const pool = data?.pool ?? [];
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
            className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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

      {/* Utilization */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
            Pool Utilization
          </div>
          <div className="text-sm font-mono text-paper tabular-nums">{utilPct}%</div>
        </div>
        <div className="bg-ink-700 h-3 rounded-full overflow-hidden">
          <div
            className={`h-full ${fillColor} transition-all`}
            style={{ width: `${Math.min(utilPct, 100)}%` }}
          />
        </div>
        <div className="mt-3 flex flex-col gap-0.5">
          <div className="text-sm text-ink-200">
            <span className="font-mono tabular-nums">{fmtNumber(totals.inUse)}</span> of{" "}
            <span className="font-mono tabular-nums">{fmtNumber(totals.total)}</span> numbers in
            use ({utilPct}%)
          </div>
          <div className="text-xs text-ink-500">
            <span className="font-mono tabular-nums">{fmtNumber(totals.available)}</span> available,{" "}
            <span className="font-mono tabular-nums">{fmtNumber(totals.cooldown)}</span> in cooldown
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4 mb-6 space-y-3">
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
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                  Number
                </th>
                <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                  Region
                </th>
                <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                  Provider
                </th>
                <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                  Status
                </th>
                <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                  Last Used
                </th>
                <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
                  Health Check
                </th>
                {canManage && (
                  <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} cols={canManage ? 7 : 6} />
                ))
              ) : filteredNumbers.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="px-4 py-12 border-t border-ink-700">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="w-12 h-12 rounded-md bg-ink-900 flex items-center justify-center mb-3">
                        <Hash className="w-5 h-5 text-ink-500" />
                      </div>
                      <div className="text-sm text-ink-300">No numbers provisioned yet</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredNumbers.map((n) => {
                  const canQuarantine = n.status === "AVAILABLE" || n.status === "IN_USE";
                  const canRelease = n.status === "COOLDOWN" || n.status === "QUARANTINED";
                  return (
                    <tr key={n.number} className="hover:bg-ink-900/60">
                      <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-paper font-mono">
                        {n.number}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 lowercase">
                        {n.region ?? "—"}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 font-mono uppercase">
                        {n.provider}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-700 text-[13px]">
                        <StatePill state={n.status} />
                      </td>
                      <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200">
                        {fmtRelative(n.lastUsedAt)}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200">
                        {fmtRelative(n.healthCheckAt)}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 border-t border-ink-700 text-right">
                          {canQuarantine ? (
                            <button
                              onClick={() => {
                                setConfirmAction({ kind: "quarantine", number: n.number });
                                setReason("");
                              }}
                              className="bg-ink-800 border border-ink-700 text-paper px-3 h-8 rounded-md hover:bg-ink-700 text-xs inline-flex items-center gap-1.5"
                            >
                              <Lock className="w-3 h-3" />
                              Quarantine
                            </button>
                          ) : canRelease ? (
                            <button
                              onClick={() => {
                                setConfirmAction({ kind: "release", number: n.number });
                              }}
                              className="bg-ink-800 border border-ink-700 text-paper px-3 h-8 rounded-md hover:bg-ink-700 text-xs inline-flex items-center gap-1.5"
                            >
                              Release
                            </button>
                          ) : (
                            <span className="text-ink-500 text-xs">—</span>
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
        <div className="fixed inset-0 z-50 bg-ink-900/70 flex items-center justify-center p-4">
          <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-paper mb-1">
              {confirmAction.kind === "quarantine" ? "Quarantine number" : "Release number"}
            </h2>
            <p className="text-sm text-ink-400 mb-4">
              <span className="font-mono text-ink-200">{confirmAction.number}</span>
            </p>
            {confirmAction.kind === "quarantine" && (
              <div className="mb-4">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-400 mb-1.5">
                  Reason
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. abuse report, health check failures"
                  className="w-full px-3 py-2 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30"
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setConfirmAction(null);
                  setReason("");
                }}
                disabled={busy}
                className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm"
              >
                Cancel
              </button>
              {confirmAction.kind === "quarantine" ? (
                <button
                  onClick={handleQuarantine}
                  disabled={busy}
                  className="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-4 h-9 rounded-md hover:bg-rose-500/25 text-sm disabled:opacity-50"
                >
                  {busy ? "Quarantining…" : "Confirm Quarantine"}
                </button>
              ) : (
                <button
                  onClick={handleRelease}
                  disabled={busy}
                  className="bg-signal-500 text-ink-900 px-4 h-9 rounded-md font-medium hover:bg-signal-600 text-sm disabled:opacity-50"
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
    <div className="flex items-center gap-3">
      <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500 w-20 flex-shrink-0">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`px-2.5 h-7 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors ${
                active
                  ? "bg-signal-500 text-ink-900 font-medium"
                  : "bg-ink-900 border border-ink-700 text-ink-300 hover:bg-ink-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
