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
  admitNumber,
  approveNumberRequest,
  declineNumberRequest,
  getFleet,
  quarantineNumber,
  registerNumber,
  releaseNumber,
  retireNumber,
  startNumberVerification,
} from "@/lib/api";
import { useAdminAuth } from "@/lib/auth-store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { fmtRelative, fmtNumber } from "@/lib/format";
import type {
  ProxyNumber,
  PoolStatus,
  NumberVerification,
  NumberHealth,
} from "@/lib/types";
import type { NumberHolding, NumberQuotaRequest } from "@/lib/api";

type StatusFilter =
  | "ALL"
  | "PENDING_VERIFICATION"
  | "AVAILABLE"
  | "IN_USE"
  | "COOLDOWN"
  | "QUARANTINED"
  | "RETIRED";
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

/**
 * Where a number is in the register / verify / admit flow.
 *
 * This replaced the Health Check column, which was always empty: nothing has
 * ever written proxy_numbers.health_check_at. Verification is the signal that
 * actually says whether a number has been proven to reach us.
 *
 * For a pending number it names the half that has not arrived, because that is
 * the actionable sentence. The inbound callback proves the carrier's Callback
 * URL points at us; the terminal event proves its Events URL does. A missing
 * terminal event is the fault that left 26 calls stuck for four months, and it
 * is invisible from the call itself, which connects and sounds perfect.
 */
/**
 * What real traffic says about this number.
 *
 * Where the Health Check column used to be. That one read
 * proxy_numbers.health_check_at, which nothing has ever written, so every
 * number showed a blank and the blank read as missing data rather than as a
 * check that did not exist.
 *
 * This counts calls on this number that connected and never closed, over the
 * window the relavoi-number-health alarms watch. Zero is the healthy answer
 * and it is shown as a word rather than a figure, because "0" in a column of
 * figures invites the reader to wonder what it is zero of.
 */
function HealthCell({ h }: { h: NumberHealth | null | undefined }): React.ReactElement {
  if (!h) return <span className="text-fg-3 text-xs">Unknown</span>;
  if (h.noFinalEventCalls === 0) {
    return (
      <span className="text-fg-2 text-xs whitespace-nowrap">
        No failed calls in {h.windowHours}h
      </span>
    );
  }
  return (
    <span className="text-rose-500 text-xs whitespace-nowrap">
      {h.noFinalEventCalls} call{h.noFinalEventCalls === 1 ? "" : "s"} never
      closed in {h.windowHours}h
    </span>
  );
}

function VerificationCell({ v }: { v: NumberVerification | undefined }): React.ReactElement {
  if (!v) return <span className="text-fg-3 text-xs">Unknown</span>;
  if (v.state === "verified") {
    return (
      <span className="text-signal-500 text-xs whitespace-nowrap">
        Verified {fmtRelative(v.verifiedAt)}
      </span>
    );
  }
  if (v.state === "grandfathered") {
    return (
      <span className="text-amber-500 text-xs whitespace-nowrap">
        Never verified (grandfathered)
      </span>
    );
  }
  if (v.state === "unverified") {
    return <span className="text-fg-3 text-xs whitespace-nowrap">Not verified</span>;
  }
  if (v.expired) {
    return (
      <span className="text-rose-500 text-xs whitespace-nowrap">
        Window expired{v.missing ? `, no ${v.missing}` : ", no call arrived"}
      </span>
    );
  }
  if (v.callbackSeen && v.terminalSeen) {
    // Both halves and still not verified means the call reached us and did not
    // work. This said "Both received" until 6 November 2026, when seven calls
    // in a row arrived, played nothing, and were ended by the carrier a quarter
    // of a second after our response. Reading that as success is how two of
    // them marked the number verified.
    const t = v.terminal;
    const detail = [
      t?.status,
      t?.hangupCause,
      typeof t?.durationSeconds === "number" ? `${t.durationSeconds}s` : null,
    ].filter(Boolean);
    return (
      <span className="text-rose-500 text-xs whitespace-nowrap">
        Call did not complete{detail.length ? ` (${detail.join(", ")})` : ""}
      </span>
    );
  }
  if (v.missing) {
    return (
      <span className="text-amber-500 text-xs whitespace-nowrap">
        Waiting for the {v.missing}
      </span>
    );
  }
  return (
    <span className="text-fg-2 text-xs whitespace-nowrap">
      Waiting for the call, until {fmtRelative(v.deadlineAt)}
    </span>
  );
}

/**
 * The backend's own words, not "Request failed with status code 409".
 *
 * These routes refuse things for reasons an operator can act on: a number that
 * is not verified and which half never arrived, a country that is described
 * but not enabled, live sessions still holding a number. All of it is in the
 * RFC 7807 `detail`, and throwing that away would leave the operator with
 * nothing to go on.
 */
function apiMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string" && detail.trim() !== "") return detail;
  }
  return (err as Error)?.message ?? "Unknown error";
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
    | { kind: "verify"; number: string }
    | { kind: "admit"; number: string }
    | { kind: "retire"; number: string }
    | null
  >(null);
  // Registering a number Kay has already bought from the carrier. Nothing here
  // buys one.
  const [registering, setRegistering] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newCountry, setNewCountry] = useState("NG");
  // What the operator is told to do after a window opens. Held in state so it
  // stays on screen while they walk to a phone.
  const [callInstruction, setCallInstruction] = useState<string | null>(null);
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
    // Faster while a verification is open, because an operator is standing
    // next to a phone waiting for this page to change. Back to 30s otherwise.
    refetchInterval: (q) =>
      (q.state.data?.numbers ?? []).some(
        (n: ProxyNumber) => n.status === "PENDING_VERIFICATION",
      )
        ? 5_000
        : 30_000,
    staleTime: 5_000,
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
      await releaseNumber(confirmAction.number, reason || undefined);
      toast.success(
        "Sent back for verification",
        "It has to be called again before it can carry a call.",
      );
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      setConfirmAction(null);
    } catch (err: unknown) {
      toast.error("Release failed", (err as Error).message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(): Promise<void> {
    setBusy(true);
    try {
      await registerNumber({
        number: newNumber.trim(),
        countryCode: newCountry.trim().toUpperCase(),
        reason,
      });
      toast.success("Number registered", "It cannot carry a call until it is verified.");
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      setRegistering(false);
      setNewNumber("");
      setReason("");
    } catch (err: unknown) {
      toast.error("Registration failed", apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(): Promise<void> {
    if (confirmAction?.kind !== "verify") return;
    setBusy(true);
    try {
      const res = await startNumberVerification(confirmAction.number, reason);
      setCallInstruction(res.instruction);
      toast.success("Verification window open", `Call ${confirmAction.number} now.`);
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      setConfirmAction(null);
      setReason("");
    } catch (err: unknown) {
      toast.error("Could not open the window", apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdmit(): Promise<void> {
    if (confirmAction?.kind !== "admit") return;
    setBusy(true);
    try {
      await admitNumber(confirmAction.number, reason);
      toast.success("Number admitted", "It is in the pool and can carry calls.");
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      setConfirmAction(null);
      setReason("");
    } catch (err: unknown) {
      // The useful case: the backend refuses an unverified number and says
      // which half never came. Surfacing its words beats a generic failure.
      toast.error("Not admitted", apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRetire(): Promise<void> {
    if (confirmAction?.kind !== "retire") return;
    setBusy(true);
    try {
      await retireNumber(confirmAction.number, reason);
      toast.success("Number retired", confirmAction.number);
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      setConfirmAction(null);
      setReason("");
    } catch (err: unknown) {
      toast.error("Could not retire it", apiMessage(err));
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
          <>
            {canManage && (
              <button
                onClick={() => {
                  setRegistering(true);
                  setNewNumber("");
                  setNewCountry("NG");
                  setReason("");
                }}
                className="btn btn-accent"
              >
                <Hash className="w-4 h-4" />
                Register a number
              </button>
            )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          </>
        }
      />

      {/* What to do next, kept on screen while the operator walks to a phone.
          The window is short and the page polls every five seconds while
          anything is pending, so this and the Verification column together are
          the whole of the waiting experience. */}
      {callInstruction && (
        <div className="card card-pad mb-[var(--gap)] border-l-2 border-l-accent">
          <div className="flex items-start gap-3">
            <Radio className="w-4 h-4 text-accent mt-[2px] shrink-0" />
            <div className="min-w-0">
              <div className="text-[15px] text-fg mb-1">Call the number now</div>
              <p className="text-sm text-fg-2">{callInstruction}</p>
              <p className="text-sm text-fg-3 mt-2">
                Verified means two things arrived: the call itself, which proves the
                carrier&apos;s Callback URL points at us, and the event that ends it, which
                proves its Events URL does. A number with only the first is the fault that
                left 26 calls stuck for four months, so it stays pending.
              </p>
              <button
                onClick={() => setCallInstruction(null)}
                className="btn btn-secondary btn-sm mt-3"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

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
            { value: "PENDING_VERIFICATION", label: "PENDING_VERIFICATION" },
            { value: "AVAILABLE", label: "AVAILABLE" },
            { value: "IN_USE", label: "IN_USE" },
            { value: "COOLDOWN", label: "COOLDOWN" },
            { value: "QUARANTINED", label: "QUARANTINED" },
            { value: "RETIRED", label: "RETIRED" },
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
                <th>Verification</th>
                <th>Health</th>
                {canManage && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} cols={canManage ? 8 : 7} />
                ))
              ) : filteredNumbers.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="py-12">
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
                  const pending = n.status === "PENDING_VERIFICATION";
                  // Admit is offered only once both halves are in. Offering it
                  // earlier would invite an operator to press a button that
                  // cannot work, and the database would refuse it anyway.
                  const canAdmit = pending && n.verification?.state === "verified";
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
                      <td>
                        <VerificationCell v={n.verification} />
                      </td>
                      <td>
                        <HealthCell h={n.health} />
                      </td>
                      {canManage && (
                        <td className="text-right whitespace-nowrap">
                          {pending ? (
                            <>
                              {canAdmit ? (
                                <button
                                  onClick={() => {
                                    setConfirmAction({ kind: "admit", number: n.number });
                                    setReason("");
                                  }}
                                  className="btn btn-accent btn-sm"
                                >
                                  Admit to pool
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setConfirmAction({ kind: "verify", number: n.number });
                                    setReason("");
                                  }}
                                  className="btn btn-secondary btn-sm"
                                >
                                  <Radio className="w-3 h-3" />
                                  Verify by call
                                </button>
                              )}{" "}
                              <button
                                onClick={() => {
                                  setConfirmAction({ kind: "retire", number: n.number });
                                  setReason("");
                                }}
                                className="btn btn-secondary btn-sm"
                              >
                                Retire
                              </button>
                            </>
                          ) : canQuarantine ? (
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
                className={decision.kind === "approve" ? "btn btn-accent" : "btn btn-danger-solid"}
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

      {/* Register a number we already own. */}
      {registering && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="number-register-title"
        >
          <div className="modal">
            <h2 id="number-register-title" className="modal-title">
              Register a number
            </h2>
            <p className="text-sm text-fg-2 mt-1 mb-5">
              For a DID that has already been bought from the carrier and had both of its
              voice fields pointed at us. This does not buy a number, and it does not put
              it in the pool: it lands pending, and a real call has to prove it first.
            </p>
            <div className="mb-4">
              <label className="field-label eyebrow" htmlFor="reg-number">
                Number
              </label>
              <input
                id="reg-number"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="+2349000000100"
                className="field w-full font-mono"
              />
            </div>
            <div className="mb-4">
              <label className="field-label eyebrow" htmlFor="reg-country">
                Country
              </label>
              <input
                id="reg-country"
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="NG"
                className="field w-full font-mono uppercase"
              />
              <p className="text-xs text-fg-3 mt-1">
                The region is taken from the country rather than typed, because a typo in a
                region makes a number unallocatable and invisible in the counts.
              </p>
            </div>
            <div className="mb-5">
              <label className="field-label eyebrow" htmlFor="reg-reason">
                Reason
              </label>
              <textarea
                id="reg-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. second Lagos DID bought to raise pool capacity"
                className="field w-full"
              />
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setRegistering(false)}
                disabled={busy}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleRegister}
                disabled={busy || newNumber.trim() === "" || reason.trim().length < 10}
                className="btn btn-accent"
              >
                {busy ? "Registering…" : "Register"}
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
              {confirmAction.kind === "quarantine"
                ? "Quarantine number"
                : confirmAction.kind === "release"
                  ? "Send back for verification"
                  : confirmAction.kind === "verify"
                    ? "Open a verification window"
                    : confirmAction.kind === "admit"
                      ? "Admit to the pool"
                      : "Retire number"}
            </h2>
            <p className="text-sm text-fg-2 mt-1 mb-5">
              <span className="font-mono text-fg">{confirmAction.number}</span>
            </p>
            {confirmAction.kind === "quarantine" && (
              <p className="text-sm text-fg-2 mb-4">
                This also withdraws the number&apos;s verification. A number is quarantined
                because it started misbehaving, and the likeliest cause is that its carrier
                configuration changed underneath us, which is what the verification ruled
                out. Releasing it later will need another call.
              </p>
            )}
            {confirmAction.kind === "release" && (
              <p className="text-sm text-fg-2 mb-4">
                This returns the number to pending, not to the pool. It has to be called
                again before it can carry anything.
              </p>
            )}
            {confirmAction.kind === "verify" && (
              <p className="text-sm text-fg-2 mb-4">
                Opens a short window. Dial the number from any phone and you should hear
                &quot;This number is connected to Relavoi&quot;. It is verified once both
                that call and the event that ends it have reached us.
              </p>
            )}
            {confirmAction.kind === "retire" && (
              <p className="text-sm text-fg-2 mb-4">
                For a number the carrier has taken back. It will not return without being
                registered and verified again. To take a number out of rotation while calls
                finish, quarantine it instead.
              </p>
            )}
            <div className="mb-5">
              <label className="field-label eyebrow" htmlFor="action-reason">
                Reason
              </label>
              <textarea
                id="action-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={
                  confirmAction.kind === "quarantine"
                    ? "e.g. abuse report, stuck calls on this number"
                    : confirmAction.kind === "retire"
                      ? "e.g. the carrier released this DID"
                      : "e.g. proving the carrier dashboard is pointed at us"
                }
                className="field w-full"
              />
            </div>
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
                <button onClick={handleQuarantine} disabled={busy} className="btn btn-danger-solid">
                  {busy ? "Quarantining…" : "Confirm Quarantine"}
                </button>
              ) : confirmAction.kind === "retire" ? (
                <button
                  onClick={handleRetire}
                  disabled={busy || reason.trim().length < 10}
                  className="btn btn-danger-solid"
                >
                  {busy ? "Retiring…" : "Confirm Retire"}
                </button>
              ) : confirmAction.kind === "verify" ? (
                <button
                  onClick={handleVerify}
                  disabled={busy || reason.trim().length < 10}
                  className="btn btn-accent"
                >
                  {busy ? "Opening…" : "Open the window"}
                </button>
              ) : confirmAction.kind === "admit" ? (
                <button
                  onClick={handleAdmit}
                  disabled={busy || reason.trim().length < 10}
                  className="btn btn-accent"
                >
                  {busy ? "Admitting…" : "Confirm Admit"}
                </button>
              ) : (
                <button onClick={handleRelease} disabled={busy} className="btn btn-accent">
                  {busy ? "Sending back…" : "Send back for verification"}
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
