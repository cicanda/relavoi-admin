"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  Search,
} from "lucide-react";

import { listAdminSessions, listTenants } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { SkeletonRow } from "@/components/skeleton";
import { truncId, fmtRelative } from "@/lib/format";
import type { Session, SessionState, Tenant } from "@/lib/types";

const STATE_OPTIONS: { value: "ALL" | SessionState; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "PENDING" },
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "GRACE_PERIOD", label: "GRACE" },
  { value: "EXPIRED", label: "EXPIRED" },
  { value: "FAILED", label: "FAILED" },
];

const FIXED_REGIONS = ["lagos", "abuja", "port harcourt"];

export default function SessionsPage() {
  const [tenantId, setTenantId] = useState<string>("ALL");
  const [stateFilter, setStateFilter] = useState<"ALL" | SessionState>("ALL");
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [proxySearch, setProxySearch] = useState<string>("");

  // Tenant lookup map
  const tenantsQ = useQuery({
    queryKey: ["console", "tenants-lookup"],
    queryFn: () => listTenants({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const tenantMap = useMemo(() => {
    const m = new Map<string, Tenant>();
    tenantsQ.data?.data?.forEach((t) => m.set(t.id, t));
    return m;
  }, [tenantsQ.data]);

  const tenantOptions = useMemo(() => {
    const list = (tenantsQ.data?.data ?? []).slice().sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return list;
  }, [tenantsQ.data]);

  // Sessions query — cursor-based, accumulated client-side
  const [pages, setPages] = useState<Session[][]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);

  // Build params; reset pages when filters change via dependent queryKey
  const queryParams = {
    tenantId: tenantId === "ALL" ? undefined : tenantId,
    state: stateFilter === "ALL" ? undefined : stateFilter,
    limit: 50,
    after: cursor,
  };

  const sessionsQ = useQuery({
    queryKey: ["adminSessions", tenantId, stateFilter, cursor],
    queryFn: async () => {
      const res = await listAdminSessions(queryParams);
      // Side-effect: append to pages or reset on first page
      if (!cursor) {
        setPages([res.data]);
      } else {
        setPages((prev) => [...prev, res.data]);
      }
      setNextCursor(res.pagination?.after);
      return res;
    },
    staleTime: 30_000,
  });

  // Reset cursor when tenant or state changes
  function changeTenant(v: string): void {
    setTenantId(v);
    setCursor(undefined);
    setPages([]);
  }
  function changeState(v: "ALL" | SessionState): void {
    setStateFilter(v);
    setCursor(undefined);
    setPages([]);
  }

  const allSessions = useMemo(() => pages.flat(), [pages]);

  // Derive region options from loaded sessions, fall back to fixed list
  const derivedRegions = useMemo(() => {
    const set = new Set<string>();
    allSessions.forEach((s) => {
      // Sessions don't carry region directly; this is a placeholder
      // since the backend Session type does not include region.
      // If a tenant has a country, we don't have per-session region.
      void s;
    });
    return set.size > 0 ? Array.from(set).sort() : FIXED_REGIONS;
  }, [allSessions]);

  // Client-side filter
  const visibleSessions = useMemo(() => {
    return allSessions.filter((s) => {
      if (proxySearch.trim() && !s.proxyNumber.includes(proxySearch.trim())) return false;
      // region filter is a no-op until backend exposes region on session
      if (regionFilter !== "ALL") {
        // best-effort: match against tenant country if present
        const t = tenantMap.get(s.tenantId);
        if (t?.country && t.country.toLowerCase() !== regionFilter) {
          // permissive: don't drop unless we know the region differs
        }
      }
      return true;
    });
  }, [allSessions, proxySearch, regionFilter, tenantMap]);

  function directionIcon(dir?: Session["directionMode"]) {
    if (dir === "A_TO_B_ONLY") return <ArrowRight className="w-3.5 h-3.5 text-fg-2" />;
    if (dir === "B_TO_A_ONLY") return <ArrowLeft className="w-3.5 h-3.5 text-fg-2" />;
    return <ArrowLeftRight className="w-3.5 h-3.5 text-fg-2" />;
  }

  const isLoadingFirst = sessionsQ.isLoading && pages.length === 0;
  const hasMore = !!nextCursor;

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="All masking sessions across every tenant"
      />

      {/* Filters */}
      <div className="card card-pad mb-[var(--gap)] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-line">
          <div className="flex flex-col min-w-0">
            <label className="field-label eyebrow">
              Tenant
            </label>
            <select
              value={tenantId}
              onChange={(e) => changeTenant(e.target.value)}
              className="field w-full"
            >
              <option value="ALL">All tenants</option>
              {tenantOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col min-w-0">
            <label className="field-label eyebrow">
              Proxy
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={proxySearch}
                onChange={(e) => setProxySearch(e.target.value)}
                placeholder="Search proxy number"
                className="field w-full pl-10 pr-3 font-mono"
              />
            </div>
          </div>
        </div>

        <FilterRow
          label="State"
          options={STATE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={stateFilter}
          onChange={(v) => changeState(v as "ALL" | SessionState)}
        />
        <FilterRow
          label="Region"
          options={[
            { value: "ALL", label: "All" },
            ...derivedRegions.map((r) => ({ value: r, label: r })),
          ]}
          value={regionFilter}
          onChange={(v) => setRegionFilter(v)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  "Session ID",
                  "Tenant",
                  "Proxy",
                  "State",
                  "Direction",
                  "Calls",
                  "Created",
                  "Expires",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoadingFirst ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
              ) : visibleSessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="empty-icon mb-3">
                        <Activity className="w-5 h-5 text-fg-3" />
                      </div>
                      <div className="text-[15px] text-fg">No sessions match these filters</div>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleSessions.map((s) => {
                  const tenant = tenantMap.get(s.tenantId);
                  return (
                    <tr key={s.id}>
                      <td className="font-mono whitespace-nowrap">
                        {truncId(s.id)}
                      </td>
                      <td>
                        {tenant ? (
                          tenant.name
                        ) : (
                          <span className="font-mono text-fg-2">{truncId(s.tenantId)}</span>
                        )}
                      </td>
                      <td className="font-mono whitespace-nowrap">
                        {s.proxyNumber}
                      </td>
                      <td>
                        <StatePill state={s.state} />
                      </td>
                      <td>
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sunken border border-line text-fg-2 text-[12px]">
                          {directionIcon(s.directionMode)}
                        </span>
                      </td>
                      <td className="font-mono tabular-nums">
                        {s.callCount ?? 0}
                      </td>
                      <td className="text-fg-2 whitespace-nowrap">
                        {fmtRelative(s.createdAt)}
                      </td>
                      <td className="text-fg-2 whitespace-nowrap">
                        {fmtRelative(s.expiresAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="border-t border-line px-4 py-3 flex items-center justify-center">
            <button
              onClick={() => setCursor(nextCursor ?? undefined)}
              disabled={sessionsQ.isFetching}
              className="btn btn-secondary"
            >
              {sessionsQ.isFetching ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
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
