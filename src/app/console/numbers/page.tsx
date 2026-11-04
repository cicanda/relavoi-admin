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

import {
  approveNumberRequest,
  declineNumberRequest,
  getFleet,
  quarantineNumber,
  releaseNumber,
} from "@/lib/api";
import { useAdminAuth } from "@/lib/auth-store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { fmtRelative, fmtNumber } from "@/lib/format";
import type { ProxyNumber, PoolStatus } from "@/lib/types";
import type { NumberHolding, NumberQuotaRequest } from "@/lib/api";

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

  // Deciding a number request. `granted` is blank for "as asked".
  const [decision, setDecision] = useState<
    { kind: "approve" | "decline"; request: NumberQuotaRequest } | null
  >(null);
  const [granted, setGranted] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fleet"],
    queryFn: getFleet,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const pool = data?.pools ?? [];
  const numbers = data?.numbers ?? [];
  const holdings: NumberHolding[] = data?.holdings ?? [];
  const requests: NumberQuotaRequest[] = data?.pendingNumberRequests ?? [];
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
      toast.error("Quarantine failed", (err as Error).message ?? "Unknown error");
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
      toast.error("Release failed", (err as Error).message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecision(): Promise<void> {
    if (!decision) return;
    setBusy(true);
    try {
      if (decision.kind === "approve") {
        const total = granted.trim() === "" ? undefined : Number(granted);
        await approveNumberRequest(decision.request.id, {
          grantedTotal: total,
          note: decisionNote.trim() || undefined,
        });
        toast.success(
          "Request approved",
          `${decision.request.workspace} may now hold ${total ?? decision.request.requestedTotal}.`,
        );
      } else {
        await declineNumberRequest(decision.request.id, decisionNote.trim());
        toast.success("Request declined", decision.request.workspace);
      }
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      setDecision(null);
      setGranted("");
      setDecisionNote("");
    } catch (err: unknown) {
      // The backend refuses a note carrying a phone number or a supplier's
      // name, because the note is emailed to the workspace as written. Its
      // detail says which, so show it rather than inventing wording.
      const detail = axios.isAxiosError(err)
        ? ((err.response?.data as { detail?: string } | undefined)?.detail ?? err.message)
        : (err as Error).message;
      toast.error(
        decision.kind === "approve" ? "Approve failed" : "Decline failed",
        detail ?? "Unknown error",
      );
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

      {/* Requests waiting on a person.
          A workspace cannot provision a number itself: one is bought from the
          carrier, whitelisted and loaded by hand. Approving writes a plan
          override, which raises its cap with no deploy. */}
      {requests.length > 0 && (
        <div className="card overflow-hidden mb-[var(--gap)]">
          <div className="card-head">
            <h2 className="card-title">
              Number requests waiting ({requests.length})
            </h2>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Plan</th>
                  <th>Asked</th>
                  <th>Wants</th>
                  <th>Limit now</th>
                  <th>Region</th>
                  <th>Why</th>
                  {canManage && <th className="text-right">Decision</th>}
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{r.workspace}</td>
                    <td className="font-mono uppercase text-fg-2">{r.tier}</td>
                    <td className="text-fg-2 whitespace-nowrap">{fmtRelative(r.createdAt)}</td>
                    <td className="font-mono tabular-nums">{fmtNumber(r.requestedTotal)}</td>
                    <td className="font-mono tabular-nums text-fg-2">
                      {fmtNumber(r.quotaAtRequest)}
                    </td>
                    <td className="lowercase">{r.region}</td>
                    <td className="text-fg-2 max-w-[22rem]">{r.note ?? "No reason given"}</td>
                    {canManage && (
                      <td className="text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setDecision({ kind: "approve", request: r });
                            setGranted("");
                            setDecisionNote("");
                          }}
                          className="btn btn-accent btn-sm"
                        >
                          Approve
                        </button>{" "}
                        <button
                          onClick={() => {
                            setDecision({ kind: "decline", request: r });
                            setGranted("");
                            setDecisionNote("");
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Decline
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Who is holding what.
          The pool is shared and proxy_numbers has no tenant column, so this is
          read from the live footprints the allocator keeps, which is also what
          the per-plan cap is enforced against. */}
      <div className="card overflow-hidden mb-[var(--gap)]">
        <div className="card-head">
          <h2 className="card-title">Held by workspace</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Plan</th>
                <th>Holding</th>
                <th>Limit</th>
                <th>Numbers</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              ) : holdings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="empty-icon mb-3">
                        <Hash className="w-5 h-5 text-fg-3" />
                      </div>
                      <div className="text-[15px] text-fg">No workspace is holding a number</div>
                    </div>
                  </td>
                </tr>
              ) : (
                holdings.map((h) => (
                  <tr key={h.tenantId}>
                    <td className="whitespace-nowrap">{h.workspace}</td>
                    <td className="font-mono uppercase text-fg-2">{h.tier}</td>
                    <td className="font-mono tabular-nums">
                      {fmtNumber(h.held)}
                      {h.held >= h.quota && (
                        <span className="text-amber-500 ml-2 text-xs">at limit</span>
                      )}
                    </td>
                    <td className="font-mono tabular-nums text-fg-2">{fmtNumber(h.quota)}</td>
                    <td className="font-mono text-fg-2">{h.numbers.join(", ")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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

      {/* Decide a number request */}
      {decision && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="number-request-title"
        >
          <div className="modal">
            <h2 id="number-request-title" className="modal-title">
              {decision.kind === "approve" ? "Approve request" : "Decline request"}
            </h2>
            <p className="text-sm text-fg-2 mt-1 mb-5">
              {decision.request.workspace} asked to hold{" "}
              <span className="font-mono text-fg tabular-nums">
                {decision.request.requestedTotal}
              </span>{" "}
              numbers at once, up from{" "}
              <span className="font-mono text-fg tabular-nums">
                {decision.request.quotaAtRequest}
              </span>
              .
            </p>

            {decision.kind === "approve" && (
              <div className="mb-5">
                <label className="field-label eyebrow" htmlFor="granted-total">
                  Grant
                </label>
                <input
                  id="granted-total"
                  type="number"
                  min={1}
                  value={granted}
                  onChange={(e) => setGranted(e.target.value)}
                  placeholder={`As asked (${decision.request.requestedTotal})`}
                  className="field w-full tabular-nums"
                />
                <p className="text-xs text-fg-3 mt-2">
                  Leave blank to grant what was asked for. A lower figure is a part-approval.
                  Approving raises the cap at once; buy and load the numbers first.
                </p>
              </div>
            )}

            <div className="mb-5">
              <label className="field-label eyebrow" htmlFor="decision-note">
                {decision.kind === "approve" ? "Note (optional)" : "Reason"}
              </label>
              <textarea
                id="decision-note"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                rows={3}
                placeholder={
                  decision.kind === "approve"
                    ? "e.g. two more bought and loaded"
                    : "e.g. more than the pool holds; tell us about your overlap"
                }
                className="field w-full"
              />
              <p className="text-xs text-fg-3 mt-2">
                Sent to the workspace as written. No phone numbers, and do not name a carrier.
              </p>
            </div>

            <div className="modal-actions">
              <button
                onClick={() => {
                  setDecision(null);
                  setGranted("");
                  setDecisionNote("");
                }}
                disabled={busy}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDecision}
                disabled={busy || (decision.kind === "decline" && decisionNote.trim() === "")}
                className={decision.kind === "approve" ? "btn btn-accent" : "btn btn-danger-soft"}
              >
                {busy
                  ? "Saving…"
                  : decision.kind === "approve"
                    ? "Confirm approval"
                    : "Confirm decline"}
              </button>
            </div>
          </div>
        </div>
      )}

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
