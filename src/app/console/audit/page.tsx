"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SkeletonRow } from "@/components/skeleton";
import { listAudit } from "@/lib/api";
import { fmtAbsolute, truncId } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

type ActorFilter = "ALL" | "operator" | "tenant" | "system";

const ACTOR_STYLES: Record<
  AuditEntry["actorType"],
  { bg: string; text: string }
> = {
  operator: { bg: "bg-sky-500/15", text: "text-sky-400" },
  tenant: { bg: "bg-signal-500/15", text: "text-signal-500" },
  system: { bg: "bg-ink-700", text: "text-ink-300" },
};

export default function AuditPage() {
  const [actorFilter, setActorFilter] = useState<ActorFilter>("ALL");
  const [resourceType, setResourceType] = useState("");
  const [debouncedResource, setDebouncedResource] = useState("");
  const [actionSearch, setActionSearch] = useState("");
  const [debouncedAction, setDebouncedAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Debounce text inputs.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedResource(resourceType.trim()), 300);
    return () => clearTimeout(id);
  }, [resourceType]);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedAction(actionSearch.trim()), 300);
    return () => clearTimeout(id);
  }, [actionSearch]);

  // Reset pagination when server-side filters change.
  useEffect(() => {
    setCursor(undefined);
    setPages([]);
  }, [actorFilter, debouncedResource]);

  const apiFilters = useMemo(() => {
    const f: { actorType?: string; resourceType?: string; after?: string; limit?: number } = {
      limit: 50,
    };
    if (actorFilter !== "ALL") f.actorType = actorFilter;
    if (debouncedResource) f.resourceType = debouncedResource;
    if (cursor) f.after = cursor;
    return f;
  }, [actorFilter, debouncedResource, cursor]);

  const auditQ = useQuery({
    queryKey: ["audit", apiFilters],
    queryFn: () => listAudit(apiFilters),
  });

  // Accumulate paginated pages.
  useEffect(() => {
    if (!auditQ.data) return;
    setPages((prev) => {
      const incoming = auditQ.data?.data ?? [];
      if (!cursor) return incoming;
      // Avoid duplicates by id.
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...incoming.filter((e) => !seen.has(e.id))];
    });
  }, [auditQ.data, cursor]);

  // Client-side filtering for action substring + date range.
  const filtered = useMemo(() => {
    return pages.filter((e) => {
      if (
        debouncedAction &&
        !e.action.toLowerCase().includes(debouncedAction.toLowerCase())
      )
        return false;
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (new Date(e.createdAt).getTime() < from) return false;
      }
      if (dateTo) {
        // include the entire end day.
        const to = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
        if (new Date(e.createdAt).getTime() > to) return false;
      }
      return true;
    });
  }, [pages, debouncedAction, dateFrom, dateTo]);

  const nextCursor = auditQ.data?.pagination?.after ?? null;

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every privileged action across the platform"
      />

      {/* Filter bar */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterGroup label="Actor">
            {(["ALL", "operator", "tenant", "system"] as const).map((a) => (
              <FilterPill
                key={a}
                active={actorFilter === a}
                onClick={() => setActorFilter(a)}
              >
                {a === "ALL" ? "All" : a}
              </FilterPill>
            ))}
          </FilterGroup>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <LabeledInput label="Resource type">
            <input
              type="text"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              placeholder="e.g. tenant, session"
              className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
            />
          </LabeledInput>
          <LabeledInput label="Action contains">
            <input
              type="text"
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              placeholder="e.g. login, update"
              className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
            />
          </LabeledInput>
          <LabeledInput label="From">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
            />
          </LabeledInput>
          <LabeledInput label="To">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 px-3 bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-full"
            />
          </LabeledInput>
        </div>
      </div>

      {/* Table */}
      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Resource</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {auditQ.isLoading && pages.length === 0 ? (
                <>
                  <SkeletonRow cols={5} />
                  <SkeletonRow cols={5} />
                  <SkeletonRow cols={5} />
                </>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 border-t border-ink-700 text-center text-sm text-ink-500"
                  >
                    No audit entries match the filters.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const isOpen = expanded.has(e.id);
                  const actor = ACTOR_STYLES[e.actorType];
                  return (
                    <>
                      <tr
                        key={e.id}
                        className="hover:bg-ink-900/60 transition-colors"
                      >
                        <Td className="text-ink-400">
                          {fmtAbsolute(e.createdAt)}
                        </Td>
                        <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center self-start ${actor.bg} ${actor.text} px-2 py-0.5 rounded-md font-mono text-[10px] uppercase tracking-wider font-medium`}
                            >
                              {e.actorType}
                            </span>
                            <span className="font-mono text-[11px] text-ink-500">
                              {truncId(e.actorId)}
                            </span>
                          </div>
                        </td>
                        <Td className="font-mono lowercase">{e.action}</Td>
                        <Td className="font-mono text-ink-300">
                          {e.resourceType}
                          {e.resourceId ? `:${truncId(e.resourceId)}` : ""}
                        </Td>
                        <td className="px-4 py-3 border-t border-ink-700">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(e.id)}
                            className="bg-ink-800 border border-ink-700 text-ink-300 px-2 h-7 rounded-md hover:bg-ink-700 hover:text-paper text-[11px] transition-colors flex items-center gap-1"
                          >
                            {isOpen ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            view JSON
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${e.id}-detail`}>
                          <td
                            colSpan={5}
                            className="px-4 py-3 border-t border-ink-700 bg-ink-900/40"
                          >
                            <div className="bg-ink-900 border border-ink-700 rounded-md p-3 font-mono text-[11px] text-ink-300 overflow-x-auto whitespace-pre">
                              {JSON.stringify(
                                {
                                  id: e.id,
                                  actorType: e.actorType,
                                  actorId: e.actorId,
                                  action: e.action,
                                  resourceType: e.resourceType,
                                  resourceId: e.resourceId,
                                  ip: e.ip,
                                  createdAt: e.createdAt,
                                  metadata: e.metadata ?? {},
                                },
                                null,
                                2,
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {nextCursor && (
          <div className="border-t border-ink-700 p-3 flex justify-center">
            <button
              type="button"
              onClick={() => setCursor(nextCursor)}
              disabled={auditQ.isFetching}
              className="bg-ink-800 border border-ink-700 text-paper px-3 h-9 rounded-md hover:bg-ink-700 text-sm transition-colors disabled:opacity-50"
            >
              {auditQ.isFetching ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 ${className}`}
    >
      {children}
    </td>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 h-7 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors ${
        active
          ? "bg-signal-500/15 text-signal-500 border border-signal-500/30"
          : "bg-ink-900 text-ink-400 border border-ink-700 hover:text-paper hover:border-ink-500"
      }`}
    >
      {children}
    </button>
  );
}

function LabeledInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
        {label}
      </span>
      {children}
    </label>
  );
}
