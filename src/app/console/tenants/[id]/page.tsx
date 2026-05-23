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
import { StatePill } from "@/components/state-pill";
import { Skeleton, SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import {
  getTenant,
  listAdminSessions,
  listAudit,
  updateTenantTier,
} from "@/lib/api";
import { fmtAbsolute, fmtRelative, truncId } from "@/lib/format";
import { useAdminAuth } from "@/lib/auth-store";
import type { AuditEntry, Session, Tenant, Tier } from "@/lib/types";

const TIERS: Tier[] = ["STARTER", "GROWTH", "ENTERPRISE"];
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

  async function onSave() {
    if (!tenant) return;
    try {
      const tierChanged = form.tier !== tenant.tier;
      if (tierChanged) {
        await tierMutation.mutateAsync(form.tier);
        toast.success("Tier updated", `Tenant moved to ${form.tier}.`);
      }
      toast.info(
        "Bulk tenant config update endpoint coming soon — only tier was applied.",
      );
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
        <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-6">
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
        <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-6 text-sm text-ink-400">
          We couldn&apos;t load this tenant. It may have been deleted or your session may have
          expired.
          <div className="mt-4">
            <button
              type="button"
              onClick={() => router.push("/console/tenants")}
              className="bg-ink-900 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors"
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
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-6 mb-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-md bg-ink-900 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-ink-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-paper tracking-tight truncate">
              {tenant.name}
            </h1>
            <div className="mt-2 flex items-center flex-wrap gap-2">
              <TierPill tier={tenant.tier} />
              {tenant.status && <StatePill state={tenant.status} size="sm" />}
              {tenant.billingEmail && (
                <span className="text-xs text-ink-400">{tenant.billingEmail}</span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-ink-500">
              <span>id: {id}</span>
              <button
                type="button"
                onClick={copyId}
                className="text-ink-400 hover:text-paper p-1 rounded transition-colors"
                aria-label="Copy tenant ID"
                title="Copy tenant ID"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2x2 grid of cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1 — Configuration */}
        <SectionCard
          title="Configuration"
          subtitle={canEdit ? "Editable" : "Read-only (insufficient role)"}
          right={
            !canEdit && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-ink-500">
                <Lock className="w-3 h-3" />
                Locked
              </span>
            )
          }
        >
          <fieldset disabled={!canEdit} className={!canEdit ? "opacity-60" : ""}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tier">
                <select
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value as Tier })}
                  className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
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
                  className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
                  placeholder="https://example.com/webhooks/relavoi"
                />
              </Field>

              <Field label="Support phone">
                <input
                  type="tel"
                  value={form.supportPhone}
                  onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                  className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors font-mono"
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
                  className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors tabular-nums"
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
                  className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
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
                  className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
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
                  className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
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
                  className="w-full h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-sm focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
                  placeholder="Tap to view details"
                />
              </Field>
            </div>

            {/* Toggles */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onSave}
                disabled={tierMutation.isPending}
                className="bg-signal-500 text-ink-900 px-4 h-10 rounded-md font-medium hover:bg-signal-600 transition-colors text-sm disabled:opacity-60"
              >
                {tierMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </SectionCard>

        {/* Card 2 — Usage Summary */}
        <SectionCard title="Usage Summary" subtitle="Last 30 days">
          <div className="grid grid-cols-2 gap-3">
            <UsageStat label="Active sessions" value="—" />
            <UsageStat label="Calls (30d)" value="—" />
            <UsageStat label="SMS (30d)" value="—" />
            <UsageStat label="Numbers in use" value="—" />
          </div>
          <p className="mt-4 text-xs text-ink-500">
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
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card mt-4">
        <div className="px-5 py-3 border-b border-ink-700">
          <h2 className="text-sm font-semibold text-paper">Recent Sessions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
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
                  <tr key={s.id} className="hover:bg-ink-900/60 transition-colors">
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 font-mono">
                      {truncId(s.id)}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 font-mono">
                      {s.proxyNumber}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700">
                      <StatePill state={s.state} size="sm" />
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 tabular-nums">
                      {s.callCount ?? 0}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-400">
                      {fmtRelative(s.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 border-t border-ink-700 text-center text-sm text-ink-500"
                  >
                    No recent sessions for this tenant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function BackLink() {
  return (
    <div className="mb-4">
      <Link
        href="/console/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-paper transition-colors"
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
    <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-paper">{title}</h2>
          {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-mono uppercase tracking-wider text-ink-400 mb-1.5">
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
      className={`flex items-center justify-between w-full px-3 h-10 bg-ink-900 border border-ink-700 rounded-md transition-colors ${
        disabled ? "" : "hover:border-ink-600"
      }`}
    >
      <span className="text-[13px] text-ink-200">{label}</span>
      <span
        className={`w-9 h-5 rounded-full relative transition-colors ${
          value ? "bg-signal-500" : "bg-ink-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-paper shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-900 border border-ink-700 rounded-md px-3 py-3">
      <div className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-paper tabular-nums">{value}</div>
    </div>
  );
}

function PlainHeader({ label }: { label: string }) {
  return (
    <th className="bg-ink-900 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
      {label}
    </th>
  );
}

function TierPill({ tier }: { tier: Tier }) {
  const cfg =
    tier === "ENTERPRISE"
      ? "bg-signal-500/15 text-signal-500"
      : tier === "GROWTH"
        ? "bg-sky-500/15 text-sky-400"
        : "bg-ink-700 text-ink-300";
  return (
    <span
      className={`inline-flex items-center ${cfg} px-2 py-1 rounded-md font-mono text-[11px] uppercase tracking-wider font-medium`}
    >
      {tier}
    </span>
  );
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
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
            {it.label}
          </dt>
          <dd className="mt-0.5 text-[13px] text-ink-200 break-words">{it.value}</dd>
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
            className="h-10 rounded-md bg-ink-900 border border-ink-700 animate-shimmer"
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
            className="flex items-center gap-3 px-3 py-2.5 bg-ink-900 border border-ink-700 rounded-md"
          >
            {accepted ? (
              <CheckCircle2 className="w-4 h-4 text-signal-500 flex-shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-ink-500 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-paper font-medium">{doc.label}</div>
            </div>
            <div className="text-[12px] text-ink-400 font-mono">
              {entry ? fmtAbsolute(entry.createdAt) : "—"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
