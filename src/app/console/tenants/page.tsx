"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SkeletonRow } from "@/components/skeleton";
import { StatePill, TierPill } from "@/components/state-pill";
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
      <div className="card card-pad mb-[var(--gap)]">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1 min-w-0 md:max-w-md">
            <Search className="w-4 h-4 text-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by tenant name…"
              className="field w-full pl-10 pr-3 rounded-full"
            />
          </div>

          <div className="chip-row">
            {TIER_OPTIONS.map((opt) => {
              const active = tierFilter === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTierFilter(opt)}
                  aria-pressed={active}
                  data-active={active}
                  className="chip"
                >
                  {opt === "ALL" ? "All" : opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
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
                    className="row-link"
                  >
                    <td className="font-medium text-[14px] tracking-[-0.01em] whitespace-nowrap">
                      {t.name}
                    </td>
                    <td className="text-fg-2">
                      {t.billingEmail ?? "—"}
                    </td>
                    <td className="whitespace-nowrap">
                      <TierPill tier={t.tier} />
                      {t.status && t.status !== "ACTIVE" && (
                        <span className="ml-2 inline-block align-middle">
                          <StatePill state={t.status} size="sm" />
                        </span>
                      )}
                    </td>
                    <td className="text-fg-3 font-mono tabular-nums">
                      —
                    </td>
                    <td className="text-fg-3 font-mono tabular-nums">
                      —
                    </td>
                    <td className="text-fg-3 font-mono tabular-nums">
                      —
                    </td>
                    <td className="text-fg-2 whitespace-nowrap">
                      {fmtRelative(t.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-16">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="empty-icon">
                        <Building2 className="w-5 h-5 text-fg-3" />
                      </div>
                      <div className="text-[15px] text-fg font-medium">No tenants yet</div>
                      <p className="text-xs text-fg-3 max-w-sm">
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
          <div className="px-4 py-3 border-t border-line flex items-center justify-center">
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="btn btn-secondary"
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
  return <th>{label}</th>;
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
    <th>
      <button
        type="button"
        onClick={onClick}
        className={`relative inline-flex items-center gap-1 eyebrow transition-colors after:absolute after:-inset-3 after:content-[''] ${
          active ? "text-fg" : "text-fg-3 hover:text-fg"
        }`}
      >
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
