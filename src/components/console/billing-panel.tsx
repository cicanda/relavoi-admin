"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";

import {
  clearBillingBypass,
  creditTenant,
  debitTenant,
  endContractTerms,
  getContractTerms,
  getTenantBilling,
  getTenantLedger,
  putContractTerms,
  reverseLedgerEntry,
  setBillingBypass,
  setCreditLimit,
  setPaymentsMode,
  setTenantInternal,
} from "@/lib/api";
import { useAdminAuth } from "@/lib/auth-store";
import { fmtAbsolute, truncId } from "@/lib/format";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import type { AdminLedgerEntry, ContractTerms, ContractTermsView } from "@/lib/types";

/**
 * The money controls for one workspace.
 *
 * Every write here needs a reason and is recorded against the operator who
 * made it. Nothing can edit or delete a ledger entry: a mistake is undone by
 * posting a reversal, so both the error and the correction stay visible. That
 * is why there is a reverse button on each row and no edit button anywhere.
 *
 * Amounts are taken in whole naira. An operator typing a figure into a console
 * should not have to multiply by a hundred, and a slip of two digits is
 * exactly the kind of mistake that is easy to make and expensive to find.
 *
 * ROOT writes, SRE reads. Hiding a form here is a courtesy; the rule is the
 * one the API enforces.
 */

function errText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail ?? fallback;
}

const LEDGER_TONE: Record<string, string> = {
  TOPUP: "text-signal-700",
  ADJUSTMENT: "text-signal-700",
  REFUND: "text-amber-700",
  REVERSAL: "text-amber-700",
};

export function BillingPanel({ tenantId }: { tenantId: string }) {
  const { operator } = useAdminAuth();
  const isRoot = operator?.role === "ROOT";
  const qc = useQueryClient();

  const billingQ = useQuery({
    queryKey: ["admin", "billing", tenantId],
    queryFn: () => getTenantBilling(tenantId),
    staleTime: 10_000,
  });
  const ledgerQ = useQuery({
    queryKey: ["admin", "ledger", tenantId],
    queryFn: () => getTenantLedger(tenantId, 50),
    staleTime: 10_000,
  });
  const termsQ = useQuery({
    queryKey: ["admin", "terms", tenantId],
    queryFn: () => getContractTerms(tenantId),
    staleTime: 30_000,
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "billing", tenantId] });
    void qc.invalidateQueries({ queryKey: ["admin", "ledger", tenantId] });
    void qc.invalidateQueries({ queryKey: ["admin", "terms", tenantId] });
  }

  const b = billingQ.data;

  return (
    <div className="mt-[var(--gap)] space-y-[var(--gap)]">
      {/* ─── State ─────────────────────────────────────────────────────── */}
      <section className="card card-pad">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="card-title">Billing</h2>
            <p className="card-sub">Wallet, ledger and the controls that move money</p>
          </div>
        </div>

        {billingQ.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : billingQ.error ? (
          <p className="text-sm text-fg-2">{errText(billingQ.error, "Couldn't load billing.")}</p>
        ) : b ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
              <Fact
                label="Wallet balance"
                value={`NGN ${b.balance}`}
                tone={b.balance.startsWith("-") ? "bad" : undefined}
              />
              <Fact label="Credit limit" value={`NGN ${b.creditLimit}`} />
              <Fact
                label="Plan"
                value={b.plan ? `${b.plan.tier}${b.plan.overridden ? " · contract" : ""}` : "—"}
                hint={
                  b.plan
                    ? `NGN ${b.plan.monthly}/month · ${b.plan.includedMinutes.toLocaleString()} min · NGN ${b.plan.overagePerMinute}/min`
                    : undefined
                }
              />
              <Fact
                label="Live calls"
                value={b.bypassUntil ? "Bypassed" : b.blocked ? "Blocked" : "Running"}
                tone={b.blocked && !b.bypassUntil ? "bad" : b.bypassUntil ? "warn" : undefined}
                hint={
                  b.bypassUntil
                    ? `until ${fmtAbsolute(b.bypassUntil)}`
                    : b.graceUntil
                      ? `grace until ${fmtAbsolute(b.graceUntil)}`
                      : undefined
                }
              />
            </div>
            {b.period ? (
              <p className="mt-5 pt-4 border-t border-line text-xs text-fg-3 tabular-nums">
                Current period {fmtAbsolute(b.period.start)} to {fmtAbsolute(b.period.end)}.{" "}
                {b.period.includedMinutesUsed.toLocaleString()} included minutes used,{" "}
                {b.period.overageMinutes.toLocaleString()} beyond the allowance.
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      {/* ─── Ledger ────────────────────────────────────────────────────── */}
      <Ledger
        entries={ledgerQ.data?.entries ?? []}
        loading={ledgerQ.isLoading}
        isRoot={isRoot}
        tenantId={tenantId}
        onDone={refresh}
      />

      {/* ─── Money in and out ──────────────────────────────────────────── */}
      {isRoot ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--gap)]">
          <MoneyForm
            title="Credit the wallet"
            help="A bank transfer that actually arrived, or money going back to the customer. The reference is the idempotency key: the same one cannot be credited twice, however many times this is submitted."
            kindField
            submitLabel="Credit"
            onSubmit={(v) =>
              creditTenant(tenantId, {
                amountNaira: v.amountNaira,
                reason: v.reason,
                kind: v.kind ?? "ADJUSTMENT",
                sourceKey: v.sourceKey,
              })
            }
            onDone={refresh}
          />
          <MoneyForm
            title="Debit the wallet"
            help="Takes money off the wallet. For correcting a credit that should not have been posted, not for charging usage: usage charges itself as calls complete."
            submitLabel="Debit"
            danger
            onSubmit={(v) =>
              debitTenant(tenantId, {
                amountNaira: v.amountNaira,
                reason: v.reason,
                sourceKey: v.sourceKey,
              })
            }
            onDone={refresh}
          />
        </div>
      ) : null}

      {/* ─── Controls ──────────────────────────────────────────────────── */}
      {isRoot ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--gap)]">
          <Bypass tenantId={tenantId} active={b?.bypassUntil ?? null} onDone={refresh} />
          <CreditLimit tenantId={tenantId} current={b?.creditLimit ?? "0.00"} onDone={refresh} />
        </div>
      ) : null}

      {/* ─── Contract terms ────────────────────────────────────────────── */}
      <ContractPanel
        tenantId={tenantId}
        view={termsQ.data}
        loading={termsQ.isLoading}
        isRoot={isRoot}
        onDone={refresh}
      />

      {/* ─── Payment mode ──────────────────────────────────────────────── */}
      {isRoot ? <PaymentMode tenantId={tenantId} onDone={refresh} /> : null}
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "bad" | "warn";
}) {
  const color = tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-fg";
  return (
    <div className="min-w-0">
      <div className="eyebrow text-fg-3 mb-1.5">{label}</div>
      <div className={`text-[15px] tabular-nums ${color}`}>{value}</div>
      {hint ? <div className="text-xs text-fg-3 mt-1 tabular-nums">{hint}</div> : null}
    </div>
  );
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

function Ledger({
  entries,
  loading,
  isRoot,
  tenantId,
  onDone,
}: {
  entries: AdminLedgerEntry[];
  loading: boolean;
  isRoot: boolean;
  tenantId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reversing, setReversing] = useState<AdminLedgerEntry | null>(null);
  const [reason, setReason] = useState("");

  const reverse = useMutation({
    mutationFn: () => reverseLedgerEntry(tenantId, { entryId: reversing?.id ?? "", reason }),
    onSuccess: () => {
      toast.success("Reversed", "The opposite entry has been posted.");
      setReversing(null);
      setReason("");
      onDone();
    },
    onError: (err) => toast.error("Could not reverse", errText(err, "Try again.")),
  });

  return (
    <section className="card overflow-hidden">
      <div className="card-head">
        <h2 className="card-title">Wallet ledger</h2>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Balance after</th>
              <th>Source</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                {Array.from({ length: 7 }).map((_, j) => (
                  <td key={j}>
                    <Skeleton className="h-3 w-full" />
                  </td>
                ))}
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-fg-3 py-10">
                  No ledger entries. Nothing has been charged or credited on this workspace.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtAbsolute(e.createdAt)}</td>
                  <td>
                    <span className={`font-mono text-xs ${LEDGER_TONE[e.type] ?? "text-fg-2"}`}>
                      {e.type}
                    </span>
                  </td>
                  <td className="text-right tabular-nums whitespace-nowrap">NGN {e.amount}</td>
                  <td className="text-right tabular-nums whitespace-nowrap text-fg-2">
                    NGN {e.balanceAfter}
                  </td>
                  <td className="font-mono text-xs text-fg-3">{truncId(e.sourceKey, 14)}</td>
                  <td className="text-fg-2">
                    {e.reason ?? "—"}
                    {e.operatorId ? (
                      <div className="font-mono text-xs text-fg-3 mt-0.5">
                        by {truncId(e.operatorId)}
                      </div>
                    ) : null}
                  </td>
                  <td className="text-right">
                    {isRoot && e.type !== "REVERSAL" ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setReversing(e)}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reverse
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {reversing ? (
        <div className="card-pad border-t border-line bg-sunken">
          <div className="text-sm text-fg mb-1">
            Reverse {reversing.type} of NGN {reversing.amount}
          </div>
          <p className="text-xs text-fg-3 mb-3">
            This posts the opposite entry. The original stays in the ledger, which is the point:
            the history shows both the mistake and the correction.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[16rem]">
              <label className="field-label eyebrow" htmlFor="reverse-reason">
                Reason
              </label>
              <input
                id="reverse-reason"
                className="field w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this entry is being undone"
              />
            </div>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!reason.trim() || reverse.isPending}
              onClick={() => reverse.mutate()}
            >
              {reverse.isPending ? "Reversing…" : "Confirm reversal"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setReversing(null);
                setReason("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─── Credit and debit ─────────────────────────────────────────────────────────

interface MoneyValues {
  amountNaira: number;
  reason: string;
  sourceKey: string;
  kind?: "ADJUSTMENT" | "REFUND";
}

function MoneyForm({
  title,
  help,
  submitLabel,
  kindField,
  danger,
  onSubmit,
  onDone,
}: {
  title: string;
  help: string;
  submitLabel: string;
  kindField?: boolean;
  danger?: boolean;
  onSubmit: (v: MoneyValues) => Promise<unknown>;
  onDone: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [kind, setKind] = useState<"ADJUSTMENT" | "REFUND">("ADJUSTMENT");

  const amountNaira = useMemo(() => {
    const n = Number(amount.replace(/[^0-9]/g, ""));
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [amount]);

  const run = useMutation({
    mutationFn: () =>
      onSubmit({
        amountNaira: amountNaira ?? 0,
        reason,
        sourceKey,
        ...(kindField ? { kind } : {}),
      }),
    onSuccess: () => {
      toast.success(`${submitLabel} posted`, "The ledger and the wallet are updated.");
      setAmount("");
      setReason("");
      setSourceKey("");
      onDone();
    },
    onError: (err) =>
      toast.error(`Could not ${submitLabel.toLowerCase()}`, errText(err, "Try again.")),
  });

  return (
    <section className="card card-pad">
      <h2 className="card-title">{title}</h2>
      <p className="card-sub mb-5">{help}</p>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="field-label eyebrow">Amount in naira</label>
          <input
            className="field w-full tabular-nums"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50000"
          />
        </div>

        {kindField ? (
          <div>
            <label className="field-label eyebrow">What this is</label>
            <select
              className="field w-full"
              value={kind}
              onChange={(e) => setKind(e.target.value as "ADJUSTMENT" | "REFUND")}
            >
              <option value="ADJUSTMENT">Adjustment, money the customer paid us</option>
              <option value="REFUND">Refund, money going back to the customer</option>
            </select>
          </div>
        ) : null}

        <div>
          <label className="field-label eyebrow">Reference</label>
          <input
            className="field w-full font-mono"
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value)}
            placeholder="Bank reference, or anything stable"
          />
          <p className="text-xs text-fg-3 mt-1.5">
            Submitting the same reference twice changes nothing.
          </p>
        </div>

        <div>
          <label className="field-label eyebrow">Reason</label>
          <input
            className="field w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Recorded against you in the audit log"
          />
        </div>

        <div>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-accent"}`}
            disabled={!amountNaira || !reason.trim() || !sourceKey.trim() || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? "Posting…" : submitLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Bypass ───────────────────────────────────────────────────────────────────

function Bypass({
  tenantId,
  active,
  onDone,
}: {
  tenantId: string;
  active: string | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const [hours, setHours] = useState("72");
  const [reason, setReason] = useState("");

  const set = useMutation({
    mutationFn: () => setBillingBypass(tenantId, { hours: Number(hours), reason }),
    onSuccess: (res) => {
      toast.success("Bypass set", `Enforcement is off until ${fmtAbsolute(res.bypassUntil)}.`);
      setReason("");
      onDone();
    },
    onError: (err) => toast.error("Could not set the bypass", errText(err, "Try again.")),
  });

  const clear = useMutation({
    mutationFn: () => clearBillingBypass(tenantId, reason || "Bypass no longer needed"),
    onSuccess: () => {
      toast.success("Bypass cleared", "Enforcement is back on.");
      setReason("");
      onDone();
    },
    onError: (err) => toast.error("Could not clear the bypass", errText(err, "Try again.")),
  });

  return (
    <section className="card card-pad">
      <h2 className="card-title">Enforcement bypass</h2>
      <p className="card-sub mb-5">
        Lets a workspace keep calling while it cannot pay. It always expires: an unblock at two in
        the morning must not quietly become permanent.
      </p>

      {active ? (
        <div className="flex items-start gap-2 px-4 py-3 bg-sunken border border-line rounded-[14px] mb-4 text-sm text-fg-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
          <span>In force until {fmtAbsolute(active)}.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="field-label eyebrow">Hours, up to 168</label>
          <input
            className="field w-full tabular-nums"
            inputMode="numeric"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label eyebrow">Reason</label>
          <input
            className="field w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why enforcement is being lifted"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-accent"
            disabled={!reason.trim() || !Number(hours) || set.isPending}
            onClick={() => set.mutate()}
          >
            {set.isPending ? "Setting…" : active ? "Replace bypass" : "Set bypass"}
          </button>
          {active ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
            >
              {clear.isPending ? "Clearing…" : "Clear now"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ─── Credit limit ─────────────────────────────────────────────────────────────

function CreditLimit({
  tenantId,
  current,
  onDone,
}: {
  tenantId: string;
  current: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [limit, setLimit] = useState(() => current.split(".")[0]);
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () =>
      setCreditLimit(tenantId, { limitNaira: Number(limit.replace(/[^0-9]/g, "")), reason }),
    onSuccess: (res) => {
      toast.success("Credit limit set", `Now NGN ${res.creditLimit}.`);
      setReason("");
      onDone();
    },
    onError: (err) => toast.error("Could not set the limit", errText(err, "Try again.")),
  });

  return (
    <section className="card card-pad">
      <h2 className="card-title">Credit limit</h2>
      <p className="card-sub mb-5">
        Postpaid headroom, zero for everyone on the prepaid wallet. Where it is set it is a
        contract term with its own invoice and its own chasing, and it sits outside the promise
        that we never carry unpaid usage.
      </p>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="field-label eyebrow">Limit in naira, zero removes it</label>
          <input
            className="field w-full tabular-nums"
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label eyebrow">Reason</label>
          <input
            className="field w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The credit decision behind this"
          />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-accent"
            disabled={!reason.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Set limit"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Contract terms ───────────────────────────────────────────────────────────

const TERM_FIELDS: Array<{ key: keyof ContractTerms; label: string; hint: string }> = [
  { key: "monthlyNaira", label: "Monthly, naira", hint: "What they pay each period" },
  { key: "includedMinutes", label: "Included minutes", hint: "Allowance each period" },
  { key: "overageNairaPerMinute", label: "Overage, naira/min", hint: "Beyond the allowance" },
  { key: "maxConcurrentPerPerson", label: "Concurrent per person", hint: "Sessions one person may hold" },
  { key: "maxConcurrentSessions", label: "Concurrent sessions", hint: "Across the workspace" },
  { key: "maxApiReqPerMin", label: "API requests/min", hint: "Rate limit" },
];

function ContractPanel({
  tenantId,
  view,
  loading,
  isRoot,
  onDone,
}: {
  tenantId: string;
  view: ContractTermsView | undefined;
  loading: boolean;
  isRoot: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () => {
      // Only the fields that were filled in are sent. An empty one is not
      // "zero": it means this term keeps following the tier's plan.
      const terms: Record<string, number> = {};
      for (const f of TERM_FIELDS) {
        const raw = values[f.key as string];
        if (raw === undefined || raw.trim() === "") continue;
        const n = Number(raw.replace(/[^0-9]/g, ""));
        if (Number.isInteger(n)) terms[f.key as string] = n;
      }
      return putContractTerms(tenantId, { ...(terms as ContractTerms), reason });
    },
    onSuccess: () => {
      toast.success("Contract set", "Rating and enforcement read it from now on.");
      setValues({});
      setReason("");
      onDone();
    },
    onError: (err) => toast.error("Could not set the contract", errText(err, "Try again.")),
  });

  const end = useMutation({
    mutationFn: () => endContractTerms(tenantId, reason || "Contract ended"),
    onSuccess: () => {
      toast.success("Contract ended", "The workspace follows its tier's plan again.");
      setReason("");
      onDone();
    },
    onError: (err) => toast.error("Could not end the contract", errText(err, "Try again.")),
  });

  const anySet = TERM_FIELDS.some((f) => (values[f.key as string] ?? "").trim() !== "");

  return (
    <section className="card card-pad">
      <h2 className="card-title">Contract terms</h2>
      <p className="card-sub mb-5">
        Negotiated terms for one workspace, laid over its tier&apos;s plan. Leave a field empty and
        that term keeps following the plan, so a contract that moves only the overage rate says
        only that and does not freeze the rest against a later plan change.
      </p>

      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : view?.effective ? (
        <div className="px-4 py-4 bg-sunken border border-line rounded-[14px] mb-5">
          <div className="eyebrow text-fg-3 mb-3">
            In force {view.overridden ? "· contract" : "· tier plan"}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3 text-sm tabular-nums">
            <Term label="Monthly" value={`NGN ${view.effective.monthly}`} />
            <Term label="Included minutes" value={view.effective.includedMinutes.toLocaleString()} />
            <Term label="Overage per minute" value={`NGN ${view.effective.overagePerMinute}`} />
            <Term
              label="Concurrent per person"
              value={String(view.effective.maxConcurrentPerPerson)}
            />
            <Term
              label="Concurrent sessions"
              value={view.effective.maxConcurrentSessions.toLocaleString()}
            />
            <Term label="API req/min" value={view.effective.maxApiReqPerMin.toLocaleString()} />
          </div>
          {view.current ? (
            <p className="mt-3 pt-3 border-t border-line text-xs text-fg-3">
              From {fmtAbsolute(view.current.effectiveFrom)}
              {view.current.effectiveUntil ? ` to ${fmtAbsolute(view.current.effectiveUntil)}` : ""}.{" "}
              {view.current.reason}
            </p>
          ) : null}
        </div>
      ) : null}

      {isRoot ? (
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-4">
            {TERM_FIELDS.map((f) => (
              <div key={f.key as string}>
                <label className="field-label eyebrow">{f.label}</label>
                <input
                  className="field w-full tabular-nums"
                  inputMode="numeric"
                  value={values[f.key as string] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key as string]: e.target.value }))}
                  placeholder="follows the plan"
                />
                <p className="text-xs text-fg-3 mt-1.5">{f.hint}</p>
              </div>
            ))}
          </div>

          <div>
            <label className="field-label eyebrow">Reason</label>
            <input
              className="field w-full"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="The agreement this reflects"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-accent"
              disabled={!anySet || !reason.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Set contract"}
            </button>
            {view?.overridden ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!reason.trim() || end.isPending}
                onClick={() => end.mutate()}
              >
                {end.isPending ? "Ending…" : "End contract"}
              </button>
            ) : null}
          </div>

          {!anySet ? (
            <p className="text-xs text-fg-3">
              Set at least one term. A contract that overrides nothing is a row that looks like an
              agreement and changes none, and the API refuses it.
            </p>
          ) : null}
        </div>
      ) : null}

      {view && view.history.length > 0 ? (
        <div className="mt-5 pt-4 border-t border-line">
          <div className="eyebrow text-fg-3 mb-2">Previous windows</div>
          <div className="space-y-1.5">
            {view.history.map((h) => (
              <p key={h.id} className="text-xs text-fg-3">
                {fmtAbsolute(h.effectiveFrom)} to{" "}
                {h.effectiveUntil ? fmtAbsolute(h.effectiveUntil) : "open"} · {h.reason}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-fg-3">{label}</div>
      <div className="text-fg">{value}</div>
    </div>
  );
}

// ─── Payment mode ─────────────────────────────────────────────────────────────

function PaymentMode({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");

  const internal = useMutation({
    mutationFn: (on: boolean) => setTenantInternal(tenantId, { internal: on, reason }),
    onSuccess: (res) => {
      toast.success(
        res.internal ? "Marked internal" : "Internal flag cleared",
        "Recorded in the audit log.",
      );
      setReason("");
      onDone();
    },
    onError: (err) => toast.error("Could not change the flag", errText(err, "Try again.")),
  });

  const mode = useMutation({
    mutationFn: (m: "live" | "test") => setPaymentsMode(tenantId, { mode: m, reason }),
    onSuccess: (res) => {
      toast.success(`Payments set to ${res.paymentsMode}`, "Recorded in the audit log.");
      setReason("");
      onDone();
    },
    onError: (err) => toast.error("Could not change the mode", errText(err, "Try again.")),
  });

  return (
    <section className="card card-pad">
      <h2 className="card-title">Payment mode</h2>
      <p className="card-sub mb-5">
        Which payment key this workspace pays with.
      </p>

      <div className="flex items-start gap-2 px-4 py-3 bg-sunken border border-line rounded-[14px] mb-5 text-sm text-fg-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
        <span>
          Test mode exists so our own workspace can rehearse the whole live path without charging a
          real card. It is refused on any workspace that is not flagged internal, by this console,
          by the API, and by a database constraint underneath both. Never set it on a customer.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="field-label eyebrow">Reason</label>
          <input
            className="field w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this workspace is changing"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!reason.trim() || internal.isPending}
            onClick={() => internal.mutate(true)}
          >
            Mark internal
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!reason.trim() || internal.isPending}
            onClick={() => internal.mutate(false)}
          >
            Clear internal
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!reason.trim() || mode.isPending}
            onClick={() => mode.mutate("test")}
          >
            Payments: test
          </button>
          <button
            type="button"
            className="btn btn-accent"
            disabled={!reason.trim() || mode.isPending}
            onClick={() => mode.mutate("live")}
          >
            Payments: live
          </button>
        </div>
      </div>
    </section>
  );
}
