"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatePill, TierPill } from "@/components/state-pill";
import { Skeleton, SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { KybPanel } from "@/components/console/kyb-panel";
import {
  getTenant,
  listAdminSessions,
  listAudit,
  updateTenantStatus,
  updateTenantTier,
} from "@/lib/api";
import { fmtAbsolute, fmtRelative, truncId } from "@/lib/format";
import { useAdminAuth } from "@/lib/auth-store";
import type { AuditEntry, Session, Tenant, Tier } from "@/lib/types";

const TIERS: Tier[] = ["STARTER", "GROWTH", "SCALE", "ENTERPRISE"];
type TenantStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";
const STATUSES: TenantStatus[] = ["ACTIVE", "SUSPENDED", "CANCELLED"];
// What each one actually does to the tenant, shown in the confirm dialog so
// the consequence is on screen at the moment of deciding.
const STATUS_EFFECT: Record<TenantStatus, string> = {
  ACTIVE: "Restores API access. Existing keys and tokens work again immediately.",
  SUSPENDED:
    "Refuses every API request and token exchange within about a minute. Calls already bridged stay up; no new session can be created.",
  CANCELLED:
    "Refuses every API request, the same as suspended, and marks the workspace closed. Use this when the customer has left.",
};
const CONSENT_MODES = ["DEFAULT", "CUSTOM", "NONE"] as const;
const EXPIRED_BEHAVIORS = ["DEAD_LINE", "REDIRECT_SUPPORT", "PLAY_MESSAGE"] as const;

interface TenantFormState {
  tier: Tier;
  webhookUrl: string;
  supportPhone: string;
  recordingEnabled: boolean;
  recordingConsentMode: (typeof CONSENT_MODES)[number];
  expiredCallBehavior: (typeof EXPIRED_BEHAVIORS)[number];
  defaultGracePeriod: number;
  pushEnabled: boolean;
  pushTitleTemplate: string;
  pushBodyTemplate: string;
  smsAutoReplyOnExpired: boolean;
}

function initialForm(t?: Tenant): TenantFormState {
  return {
    tier: t?.tier ?? "STARTER",
    webhookUrl: t?.webhookUrl ?? "",
    supportPhone: t?.supportPhone ?? "",
    recordingEnabled: t?.recordingEnabled ?? false,
    recordingConsentMode: (t?.recordingConsentMode ?? "DEFAULT"),
    expiredCallBehavior: (t?.expiredCallBehavior ?? "DEAD_LINE"),
    defaultGracePeriod: t?.defaultGracePeriod ?? 15,
    pushEnabled: t?.pushEnabled ?? false,
    pushTitleTemplate: t?.pushTitleTemplate ?? "",
    pushBodyTemplate: t?.pushBodyTemplate ?? "",
    smsAutoReplyOnExpired: t?.smsAutoReplyOnExpired ?? false,
  };
}

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const role = useAdminAuth((s) => s.operator?.role);
  const canEdit = role === "ROOT" || role === "SRE";

  const tenantQ = useQuery({
    queryKey: ["tenant", id],
    queryFn: () => getTenant(id),
  });

  const recentSessionsQ = useQuery({
    queryKey: ["tenant", id, "sessions"],
    queryFn: () => listAdminSessions({ tenantId: id, limit: 10 }),
  });

  const auditQ = useQuery({
    queryKey: ["tenant", id, "audit"],
    queryFn: () => listAudit({ resourceType: "tenant" }),
  });

  const tenant = tenantQ.data;

  const [form, setForm] = useState<TenantFormState>(() => initialForm());
  const [copied, setCopied] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TenantStatus | null>(null);

  // Hydrate form once the tenant lands.
  useEffect(() => {
    if (tenant) setForm(initialForm(tenant));
  }, [tenant]);

  const tierMutation = useMutation({
    mutationFn: (tier: Tier) => updateTenantTier(id, tier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant", id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: TenantStatus) => updateTenantStatus(id, status),
    onSuccess: (_data, status) => {
      toast.success("Status updated", `Workspace is now ${status}.`);
      setPendingStatus(null);
      void queryClient.invalidateQueries({ queryKey: ["tenant", id] });
      void queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      toast.error("Could not change status", detail ?? "Try again.");
    },
  });

  async function onSave() {
    if (!tenant) return;
    try {
      const tierChanged = form.tier !== tenant.tier;
      if (!tierChanged) {
        toast.info("Nothing to save", "Tier is the only field this console can change.");
        return;
      }
      await tierMutation.mutateAsync(form.tier);
      toast.success("Tier updated", `Tenant moved to ${form.tier}.`);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to update tenant configuration.";
      toast.error("Save failed", message);
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — Safari can refuse clipboard on insecure contexts
    }
  }

  if (tenantQ.isLoading) {
    return (
      <>
        <BackLink />
        <div className="card card-pad">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40 mt-3" />
        </div>
      </>
    );
  }

  if (tenantQ.isError || !tenant) {
    return (
      <>
        <BackLink />
        <PageHeader title="Tenant not found" />
        <div className="card card-pad text-sm text-fg-2">
          We couldn&apos;t load this tenant. It may have been deleted or your session may have
          expired.
          <div className="mt-4">
            <button
              type="button"
              onClick={() => router.push("/console/tenants")}
              className="btn btn-secondary"
            >
              Back to tenants
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <BackLink />

      {/* Header card */}
      <div className="card card-pad mb-[var(--gap)]">
        <div className="flex items-start gap-4">
          <div className="icon-tile w-12 h-12 hidden sm:flex">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[length:var(--text-display)] font-normal text-fg tracking-[-0.035em] leading-[1.1] break-words">
              {tenant.name}
            </h1>
            <div className="mt-3 flex items-center flex-wrap gap-2">
              <TierPill tier={tenant.tier} />
              {/* Status is a control, not a label: suspending a workspace is an
                  operator action that belongs where the status is read. */}
              {canEdit ? (
                <select
                  value={(tenant.status ?? "ACTIVE") as TenantStatus}
                  disabled={statusMutation.isPending}
                  onChange={(e) => {
                    const next = e.target.value as TenantStatus;
                    if (next !== (tenant.status ?? "ACTIVE")) setPendingStatus(next);
                  }}
                  aria-label="Workspace status"
                  className="field rounded-full min-h-[var(--control-sm-h)] pl-3.5 pr-8 disabled:opacity-50"
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              ) : (
                tenant.status && <StatePill state={tenant.status} size="sm" />
              )}
              {tenant.billingEmail && (
                <span className="text-[13px] text-fg-2 break-all">{tenant.billingEmail}</span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-fg-3 min-w-0">
              <span className="break-all">id: {id}</span>
              <button
                type="button"
                onClick={copyId}
                className="icon-btn-xs flex-shrink-0"
                aria-label="Copy tenant ID"
                title="Copy tenant ID"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Business verification: the gate on live mode, and dense enough to want
          the full width, so it sits above the card grid rather than in it. */}
      <KybPanel tenantId={id} canDecide={canEdit} />

      {/* 2x2 grid of cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--gap)]">
        {/* Card 1 — Configuration */}
        <SectionCard
          title="Configuration"
          subtitle={canEdit ? "Editable" : "Read-only (insufficient role)"}
          right={
            !canEdit && (
              <span className="inline-flex items-center gap-1 eyebrow text-fg-3">
                <Lock className="w-3 h-3" />
                Locked
              </span>
            )
          }
        >
          <fieldset disabled={!canEdit} className={!canEdit ? "opacity-60" : ""}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4">
              <Field label="Tier">
                <select
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value as Tier })}
                  className="field w-full"
                >
                  {TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Webhook URL">
                <input
                  type="url"
                  value={form.webhookUrl}
                  onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                  className="field w-full"
                  placeholder="https://example.com/webhooks/relavoi"
                />
              </Field>

              <Field label="Support phone">
                <input
                  type="tel"
                  value={form.supportPhone}
                  onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                  className="field w-full font-mono"
                  placeholder="+234XXXXXXXXXX"
                />
              </Field>

              <Field label="Default grace period (min)">
                <input
                  type="number"
                  min={0}
                  value={form.defaultGracePeriod}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultGracePeriod: Number(e.target.value) || 0,
                    })
                  }
                  className="field w-full tabular-nums"
                />
              </Field>

              <Field label="Recording consent mode">
                <select
                  value={form.recordingConsentMode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      recordingConsentMode: e.target
                        .value as (typeof CONSENT_MODES)[number],
                    })
                  }
                  className="field w-full"
                >
                  {CONSENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Expired-call behavior">
                <select
                  value={form.expiredCallBehavior}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      expiredCallBehavior: e.target
                        .value as (typeof EXPIRED_BEHAVIORS)[number],
                    })
                  }
                  className="field w-full"
                >
                  {EXPIRED_BEHAVIORS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Push title template">
                <input
                  type="text"
                  value={form.pushTitleTemplate}
                  onChange={(e) =>
                    setForm({ ...form, pushTitleTemplate: e.target.value })
                  }
                  className="field w-full"
                  placeholder="Your {brand} agent is calling"
                />
              </Field>

              <Field label="Push body template">
                <input
                  type="text"
                  value={form.pushBodyTemplate}
                  onChange={(e) =>
                    setForm({ ...form, pushBodyTemplate: e.target.value })
                  }
                  className="field w-full"
                  placeholder="Tap to view details"
                />
              </Field>
            </div>

            {/* Toggles */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Toggle
                label="Recording enabled"
                value={form.recordingEnabled}
                onChange={(v) => setForm({ ...form, recordingEnabled: v })}
                disabled={!canEdit}
              />
              <Toggle
                label="Push enabled"
                value={form.pushEnabled}
                onChange={(v) => setForm({ ...form, pushEnabled: v })}
                disabled={!canEdit}
              />
              <Toggle
                label="SMS auto-reply on expired"
                value={form.smsAutoReplyOnExpired}
                onChange={(v) => setForm({ ...form, smsAutoReplyOnExpired: v })}
                disabled={!canEdit}
              />
            </div>
          </fieldset>

          {canEdit && (
            <div className="mt-6 pt-5 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={onSave}
                disabled={tierMutation.isPending}
                className="btn btn-accent"
              >
                {tierMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </SectionCard>

        {/* Card 2 — Usage Summary */}
        <SectionCard title="Usage Summary" subtitle="Last 30 days">
          <div className="grid grid-cols-2 gap-2">
            <UsageStat label="Active sessions" value="—" />
            <UsageStat label="Calls (30d)" value="—" />
            <UsageStat label="SMS (30d)" value="—" />
            <UsageStat label="Numbers in use" value="—" />
          </div>
          <p className="mt-4 text-xs text-fg-3">
            Usage details endpoint coming soon.
          </p>
        </SectionCard>

        {/* Card 3 — Onboarding Context */}
        <SectionCard title="Onboarding Context" subtitle="Read-only">
          <OnboardingFields metadata={tenant.onboardingMetadata} />
        </SectionCard>

        {/* Card 4 — Compliance */}
        <SectionCard title="Compliance" subtitle="Tenant consent & acceptance">
          <ComplianceRows audit={auditQ.data?.data ?? []} loading={auditQ.isLoading} />
        </SectionCard>
      </div>

      {/* Recent Sessions */}
      <section className="card overflow-hidden mt-[var(--gap)]">
        <div className="card-head">
          <h2 className="card-title">Recent Sessions</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <PlainHeader label="Session ID" />
                <PlainHeader label="Proxy" />
                <PlainHeader label="State" />
                <PlainHeader label="Calls" />
                <PlainHeader label="Created" />
              </tr>
            </thead>
            <tbody>
              {recentSessionsQ.isLoading ? (
                <>
                  <SkeletonRow cols={5} />
                  <SkeletonRow cols={5} />
                  <SkeletonRow cols={5} />
                </>
              ) : recentSessionsQ.data?.data?.length ? (
                recentSessionsQ.data.data.map((s: Session) => (
                  <tr key={s.id}>
                    <td className="font-mono whitespace-nowrap">
                      {truncId(s.id)}
                    </td>
                    <td className="font-mono whitespace-nowrap">
                      {s.proxyNumber}
                    </td>
                    <td>
                      <StatePill state={s.state} size="sm" />
                    </td>
                    <td className="tabular-nums">
                      {s.callCount ?? 0}
                    </td>
                    <td className="text-fg-2 whitespace-nowrap">
                      {fmtRelative(s.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="py-10 text-center text-sm text-fg-3"
                  >
                    No recent sessions for this tenant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={pendingStatus !== null}
        title={`Set this workspace to ${pendingStatus ?? ""}?`}
        danger={pendingStatus !== "ACTIVE"}
        description={
          <>
            <span className="text-fg">{tenant.name}</span> is currently{" "}
            {tenant.status ?? "ACTIVE"}.{" "}
            {pendingStatus ? STATUS_EFFECT[pendingStatus] : ""}
          </>
        }
        confirmLabel={pendingStatus === "ACTIVE" ? "Reactivate" : `Set ${pendingStatus ?? ""}`}
        busy={statusMutation.isPending}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => pendingStatus && statusMutation.mutate(pendingStatus)}
      />
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function BackLink() {
  return (
    <div className="mb-[var(--gap)]">
      <Link
        href="/console/tenants"
        className="btn btn-ghost btn-sm -ml-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Tenants
      </Link>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card card-pad min-w-0">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label eyebrow">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
      className={`flex items-center justify-between gap-3 w-full px-4 min-h-[var(--control-h)] py-2 bg-sunken border border-line rounded-[14px] text-left transition-colors ${
        disabled ? "" : "hover:border-line-strong hover:bg-surface"
      }`}
    >
      <span className="text-[13px] text-fg">{label}</span>
      <span
        className={`w-10 h-6 rounded-full relative flex-shrink-0 transition-colors ${
          value ? "bg-signal-500" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-paper shadow-sm transition-transform ${
            value ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-sunken border border-line rounded-[14px] px-4 py-4 min-w-0">
      <div className="eyebrow text-fg-2">
        {label}
      </div>
      <div className="mt-3 text-[28px] font-light text-fg tabular-nums tracking-[-0.04em] leading-none">{value}</div>
    </div>
  );
}

function PlainHeader({ label }: { label: string }) {
  return <th>{label}</th>;
}

function OnboardingFields({
  metadata,
}: {
  metadata?: Record<string, unknown>;
}) {
  const get = (key: string): string => {
    const v = metadata?.[key];
    if (v == null || v === "") return "—";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  const items: Array<{ label: string; value: string }> = [
    { label: "Industry", value: get("industry") },
    { label: "Expected sessions/day", value: get("expectedSessionsPerDay") },
    { label: "Avg session lifespan", value: get("avgSessionLifespan") },
    { label: "Regions", value: get("regions") },
    { label: "Carrier mix", value: get("carrierMix") },
    { label: "Use case detail", value: get("useCaseDetail") },
  ];

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="eyebrow text-fg-3">
            {it.label}
          </dt>
          <dd className="mt-1 text-[14px] text-fg break-words">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface ComplianceDoc {
  label: string;
  match: (e: AuditEntry) => boolean;
}

const COMPLIANCE_DOCS: ComplianceDoc[] = [
  {
    label: "Terms of Service",
    match: (e) =>
      e.action.toLowerCase().includes("consent") &&
      docKey(e) === "terms_of_service",
  },
  {
    label: "NDPR DPA",
    match: (e) =>
      e.action.toLowerCase().includes("consent") && docKey(e) === "ndpr_dpa",
  },
  {
    label: "NCC Type Approval",
    match: (e) =>
      e.action.toLowerCase().includes("consent") && docKey(e) === "ncc_type_approval",
  },
];

function docKey(entry: AuditEntry): string {
  const doc = entry.metadata?.document;
  return typeof doc === "string" ? doc.toLowerCase() : "";
}

function ComplianceRows({
  audit,
  loading,
}: {
  audit: AuditEntry[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {COMPLIANCE_DOCS.map((d) => (
          <div
            key={d.label}
            className="h-12 rounded-[14px] animate-shimmer"
          />
        ))}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {COMPLIANCE_DOCS.map((doc) => {
        const entry = audit.find(doc.match);
        const accepted = Boolean(entry);
        return (
          <li
            key={doc.label}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 bg-sunken border border-line rounded-[14px]"
          >
            {accepted ? (
              <CheckCircle2 className="w-4 h-4 text-signal-700 flex-shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-fg-3 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-fg font-medium">{doc.label}</div>
            </div>
            <div className="text-[12px] text-fg-3 font-mono">
              {entry ? fmtAbsolute(entry.createdAt) : "—"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
