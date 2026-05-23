"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SkeletonRow } from "@/components/skeleton";
import { StatePill } from "@/components/state-pill";
import { listTenants } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import type { Tenant, Tier } from "@/lib/types";

type SortKey = "name" | "billingEmail" | "createdAt";
type SortDir = "asc" | "desc";

const TIER_OPTIONS: Array<Tier | "ALL"> = ["ALL", "STARTER", "GROWTH", "ENTERPRISE"];

export default function TenantsListPage() {
  const router = useRouter();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<Tier | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const tierParam: Tier | undefined = tierFilter === "ALL" ? undefined : tierFilter;

  const query = useInfiniteQuery({
    queryKey: ["tenants", { tier: tierParam }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listTenants({ tier: tierParam, limit: 25, after: pageParam }),
    getNextPageParam: (last) => last.pagination?.after ?? undefined,
  });

  const allTenants: Tenant[] = useMemo(
    () => query.data?.pages.flatMap((p) => p.data ?? []) ?? [],
    [query.data],
  );

  const filtered = useMemo(() => {
    let rows = allTenants;
    if (debouncedSearch) {
      rows = rows.filter((t) => t.name.toLowerCase().includes(debouncedSearch));
    }
    const sorted = [...rows].sort((a, b) => {
      let av: string;
      let bv: string;
      if (sortKey === "name") {
        av = a.name ?? "";
        bv = b.name ?? "";
      } else if (sortKey === "billingEmail") {
        av = a.billingEmail ?? "";
        bv = b.billingEmail ?? "";
      } else {
        av = a.createdAt ?? "";
        bv = b.createdAt ?? "";
      }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [allTenants, debouncedSearch, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <>
      <PageHeader title="Tenants" description="All workspaces on the platform" />

      {/* Filter bar */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-ink-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by tenant name…"
              className="w-full h-9 pl-8 pr-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {TIER_OPTIONS.map((opt) => {
              const active = tierFilter === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTierFilter(opt)}
                  className={`px-3 h-8 rounded-md font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    active
                      ? "bg-signal-500 text-ink-900 font-medium"
                      : "bg-ink-900 border border-ink-700 text-ink-300 hover:bg-ink-700"
                  }`}
                >
                  {opt === "ALL" ? "All" : opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <SortableHeader
                  label="Name"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => toggleSort("name")}
                />
                <SortableHeader
                  label="Email"
                  active={sortKey === "billingEmail"}
                  dir={sortDir}
                  onClick={() => toggleSort("billingEmail")}
                />
                <PlainHeader label="Tier" />
                <PlainHeader label="Active Sessions" />
                <PlainHeader label="Calls (mo)" />
                <PlainHeader label="SMS" />
                <SortableHeader
                  label="Created"
                  active={sortKey === "createdAt"}
                  dir={sortDir}
                  onClick={() => toggleSort("createdAt")}
                />
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <>
                  <SkeletonRow cols={7} />
                  <SkeletonRow cols={7} />
                  <SkeletonRow cols={7} />
                  <SkeletonRow cols={7} />
                </>
              ) : filtered.length ? (
                filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/console/tenants/${t.id}`)}
                    className="hover:bg-ink-900/60 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-paper font-semibold">
                      {t.name}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200">
                      {t.billingEmail ?? "—"}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700">
                      <TierPill tier={t.tier} />
                      {t.status && t.status !== "ACTIVE" && (
                        <span className="ml-2 inline-block align-middle">
                          <StatePill state={t.status} size="sm" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-400 font-mono tabular-nums">
                      —
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-400 font-mono tabular-nums">
                      —
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-400 font-mono tabular-nums">
                      —
                    </td>
                    <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-400">
                      {fmtRelative(t.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-16 border-t border-ink-700">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-md bg-ink-900 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-ink-500" />
                      </div>
                      <div className="text-sm text-ink-300 font-medium">No tenants yet</div>
                      <p className="text-xs text-ink-500 max-w-sm">
                        {debouncedSearch || tierFilter !== "ALL"
                          ? "No tenants match the current filters."
                          : "Once workspaces sign up, they will appear here."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {query.hasNextPage && (
          <div className="px-4 py-3 border-t border-ink-700 flex items-center justify-center">
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="bg-ink-900 border border-ink-700 text-paper px-4 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors disabled:opacity-60"
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function PlainHeader({ label }: { label: string }) {
  return (
    <th className="bg-ink-900 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left px-4 py-2">
      {label}
    </th>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="bg-ink-900 text-left px-4 py-2">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider transition-colors ${
          active ? "text-paper" : "text-ink-500 hover:text-ink-300"
        }`}
      >
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
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
      className={`inline-flex items-center ${cfg} px-2 py-1 rounded-md font-mono text-[10px] uppercase tracking-wider font-medium`}
    >
      {tier}
    </span>
  );
}
