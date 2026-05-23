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
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import {
  getOverview,
  listAdminSessions,
  listTenants,
} from "@/lib/api";
import { truncId, fmtRelative } from "@/lib/format";
import type { Session, Tenant, Tier } from "@/lib/types";

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
            className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

      {/* ── Active sessions + Tenants by activity ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
        {/* Active Sessions */}
        <div className="lg:col-span-3 bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-paper">Active Sessions</h2>
            <button
              type="button"
              onClick={() => router.push("/console/sessions")}
              className="text-[11px] font-mono uppercase tracking-wider text-ink-400 hover:text-paper transition-colors"
            >
              View all
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="bg-ink-900 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                    Session ID
                  </th>
                  <th className="bg-ink-900 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                    Tenant
                  </th>
                  <th className="bg-ink-900 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                    Proxy
                  </th>
                  <th className="bg-ink-900 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                    Status
                  </th>
                  <th className="bg-ink-900 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                    Calls
                  </th>
                  <th className="bg-ink-900 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
                    Created
                  </th>
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
                      className="hover:bg-ink-900/60 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 font-mono">
                        {truncId(s.id)}
                      </td>
                      <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200">
                        {s.tenantName ? (
                          <span className="text-ink-200">{s.tenantName}</span>
                        ) : (
                          <span className="font-mono text-ink-300">{truncId(s.tenantId)}</span>
                        )}
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
                      colSpan={6}
                      className="px-4 py-8 border-t border-ink-700 text-center text-sm text-ink-500"
                    >
                      No active sessions right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tenants by activity */}
        <div className="lg:col-span-2 bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-paper">Tenants by activity</h2>
            <button
              type="button"
              onClick={() => router.push("/console/tenants")}
              className="text-[11px] font-mono uppercase tracking-wider text-ink-400 hover:text-paper transition-colors"
            >
              All tenants
            </button>
          </div>

          {tenantsQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-md bg-ink-900 border border-ink-700 animate-shimmer"
                />
              ))}
            </div>
          ) : tenantsQ.data?.data?.length ? (
            <ul className="space-y-1.5">
              {tenantsQ.data.data.slice(0, 5).map((t: Tenant) => (
                <li
                  key={t.id}
                  onClick={() => router.push(`/console/tenants/${t.id}`)}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-ink-900/60 border border-transparent hover:border-ink-700 cursor-pointer transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-paper font-medium truncate">{t.name}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5">active sessions: —</div>
                  </div>
                  <TierPill tier={t.tier} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-ink-500 text-center py-8">No tenants yet.</div>
          )}
        </div>
      </div>

      {/* ── System health strip ────────────────────────────────────────── */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-paper">System Health</h2>
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
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
      </div>
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
    <div className="bg-ink-900 border border-ink-700 rounded-md px-3 py-2 flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="text-[12px] text-ink-200 font-mono">{label}</span>
    </div>
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
      className={`inline-flex items-center ${cfg} px-2 py-1 rounded-md font-mono text-[10px] uppercase tracking-wider font-medium flex-shrink-0`}
    >
      {tier}
    </span>
  );
}
