"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  PhoneCall,
  Hash,
  AlertTriangle,
  Radio,
  RefreshCw,
  ArrowUpRight,
  Building2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatePill, TierPill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import {
  getOverview,
  listAdminSessions,
  listTenants,
} from "@/lib/api";
import { truncId, fmtRelative } from "@/lib/format";
import type { Session, Tenant } from "@/lib/types";

export default function OverviewPage() {
  const router = useRouter();

  const overviewQ = useQuery({
    queryKey: ["overview"],
    queryFn: getOverview,
    refetchInterval: 30_000,
  });

  const sessionsQ = useQuery({
    queryKey: ["overview", "active-sessions"],
    queryFn: () => listAdminSessions({ state: "ACTIVE", limit: 10 }),
    refetchInterval: 30_000,
  });

  const tenantsQ = useQuery({
    queryKey: ["overview", "tenants-top"],
    queryFn: () => listTenants({ limit: 100 }),
    refetchInterval: 60_000,
  });

  const overview = overviewQ.data;
  const infra = overview?.infra;
  const atBreaker = infra?.circuitBreakers?.find(
    (c) => c.provider.toLowerCase() === "africastalking",
  );
  const twilioBreaker = infra?.circuitBreakers?.find(
    (c) => c.provider.toLowerCase() === "twilio",
  );

  const atState = atBreaker?.state ?? "CLOSED";
  const atAccent: "rose" | "amber" | "signal" =
    atState === "OPEN" ? "rose" : atState === "HALF_OPEN" ? "amber" : "signal";

  const dlqDepth = overview?.dlqDepth ?? 0;

  function refreshAll() {
    overviewQ.refetch();
    sessionsQ.refetch();
    tenantsQ.refetch();
  }

  const refreshing =
    overviewQ.isFetching || sessionsQ.isFetching || tenantsQ.isFetching;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Platform-wide operator dashboard"
        actions={
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshing}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="bento">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
          <StatCard
            label="Active Sessions"
            value={overview?.activeSessions ?? 0}
            accent="signal"
            icon={Activity}
            loading={overviewQ.isLoading}
          />
          <StatCard
            label="Calls Today"
            value="—"
            accent="sky"
            icon={PhoneCall}
            loading={false}
          />
          <StatCard
            label="Pool Utilization"
            value={`${overview?.poolUtilization ?? 0}%`}
            accent="sky"
            icon={Hash}
            loading={overviewQ.isLoading}
          />
          <StatCard
            label="DLQ Depth"
            value={dlqDepth}
            accent={dlqDepth > 0 ? "rose" : "ink"}
            icon={AlertTriangle}
            loading={overviewQ.isLoading}
          />
          <StatCard
            label="Circuit State"
            value={atState}
            accent={atAccent}
            icon={Radio}
            loading={overviewQ.isLoading}
          />
        </div>
      </div>

      {/* ── Active sessions + Tenants by activity ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-[var(--gap)] mt-[var(--gap)]">
        {/* Active Sessions */}
        <section className="lg:col-span-3 card overflow-hidden min-w-0">
          <div className="card-head">
            <h2 className="card-title">Active Sessions</h2>
            <button
              type="button"
              onClick={() => router.push("/console/sessions")}
              className="link-action eyebrow"
            >
              View all
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Tenant</th>
                  <th>Proxy</th>
                  <th>Status</th>
                  <th>Calls</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {sessionsQ.isLoading ? (
                  <>
                    <SkeletonRow cols={6} />
                    <SkeletonRow cols={6} />
                    <SkeletonRow cols={6} />
                  </>
                ) : sessionsQ.data?.data?.length ? (
                  sessionsQ.data.data.map((s: Session) => (
                    <tr
                      key={s.id}
                      onClick={() =>
                        router.push(`/console/sessions?focus=${encodeURIComponent(s.id)}`)
                      }
                      className="row-link"
                    >
                      <td className="font-mono whitespace-nowrap">
                        {truncId(s.id)}
                      </td>
                      <td>
                        {s.tenantName ? (
                          <span className="text-fg">{s.tenantName}</span>
                        ) : (
                          <span className="font-mono text-fg-2">{truncId(s.tenantId)}</span>
                        )}
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
                      colSpan={6}
                      className="py-10 text-center text-sm text-fg-3"
                    >
                      No active sessions right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tenants by activity */}
        <section className="lg:col-span-2 card min-w-0">
          <div className="card-head">
            <h2 className="card-title">Tenants by activity</h2>
            <button
              type="button"
              onClick={() => router.push("/console/tenants")}
              className="link-action eyebrow"
            >
              All tenants
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-[calc(var(--card-pad)-0.5rem)] pb-[calc(var(--card-pad)-0.5rem)]">
            {tenantsQ.isLoading ? (
              <div className="space-y-2 px-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-[14px] animate-shimmer"
                  />
                ))}
              </div>
            ) : tenantsQ.data?.data?.length ? (
              <ul className="space-y-1">
                {tenantsQ.data.data.slice(0, 5).map((t: Tenant) => (
                  <li
                    key={t.id}
                    onClick={() => router.push(`/console/tenants/${t.id}`)}
                    className="group flex items-center justify-between gap-3 px-3 py-2.5 min-h-[56px] rounded-[14px] hover:bg-sunken cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-9 h-9 rounded-full bg-mute text-fg-2 flex items-center justify-center flex-shrink-0 transition-colors group-hover:bg-ink-900 group-hover:text-white">
                        <Building2 className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] text-fg font-medium truncate tracking-[-0.01em]">{t.name}</div>
                        <div className="text-[12px] text-fg-3 mt-0.5">active sessions: —</div>
                      </div>
                    </div>
                    <TierPill tier={t.tier} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-fg-3 text-center py-10">No tenants yet.</div>
            )}
          </div>
        </section>
      </div>

      {/* ── System health strip ────────────────────────────────────────── */}
      <section className="card card-pad mt-[var(--gap)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="card-title">System Health</h2>
          <span className="eyebrow text-fg-3">
            auto-refresh 30s
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <HealthDot
            label="Redis"
            color={
              infra?.checks?.redis === "ok"
                ? "signal"
                : infra?.checks?.redis === "down"
                  ? "rose"
                  : "ink"
            }
          />
          <HealthDot
            label="PostgreSQL"
            color={
              infra?.checks?.postgres === "ok"
                ? "signal"
                : infra?.checks?.postgres === "down"
                  ? "rose"
                  : "ink"
            }
          />
          <HealthDot
            label={`AT Circuit · ${atState}`}
            color={atAccent}
          />
          {twilioBreaker ? (
            <HealthDot
              label={`Twilio Circuit · ${twilioBreaker.state}`}
              color={
                twilioBreaker.state === "OPEN"
                  ? "rose"
                  : twilioBreaker.state === "HALF_OPEN"
                    ? "amber"
                    : "signal"
              }
            />
          ) : (
            <HealthDot label="Twilio Circuit · not configured" color="ink" />
          )}
        </div>
      </section>
    </>
  );
}

function HealthDot({
  label,
  color,
}: {
  label: string;
  color: "signal" | "rose" | "amber" | "sky" | "ink";
}) {
  const dot =
    color === "signal"
      ? "bg-signal-500"
      : color === "rose"
        ? "bg-rose-500"
        : color === "amber"
          ? "bg-amber-500"
          : color === "sky"
            ? "bg-sky-500"
            : "bg-ink-500";

  return (
    <div className="bg-sunken border border-line rounded-full pl-3 pr-4 py-2 flex items-center gap-2 min-w-0">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      <span className="text-[12px] text-fg font-mono break-all">{label}</span>
    </div>
  );
}
