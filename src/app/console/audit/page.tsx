"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
  operator: { bg: "bg-sky-500/12", text: "text-sky-800" },
  tenant: { bg: "bg-signal-500/15", text: "text-signal-800" },
  system: { bg: "bg-mute", text: "text-fg-2" },
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
      <div className="card card-pad mb-[var(--gap)] space-y-5">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-4 pt-5 border-t border-line">
          <LabeledInput label="Resource type">
            <input
              type="text"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              placeholder="e.g. tenant, session"
              className="field w-full"
            />
          </LabeledInput>
          <LabeledInput label="Action contains">
            <input
              type="text"
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              placeholder="e.g. login, update"
              className="field w-full"
            />
          </LabeledInput>
          <LabeledInput label="From">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="field w-full"
            />
          </LabeledInput>
          <LabeledInput label="To">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="field w-full"
            />
          </LabeledInput>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
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
                    className="py-10 text-center text-sm text-fg-3"
                  >
                    No audit entries match the filters.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const isOpen = expanded.has(e.id);
                  const actor = ACTOR_STYLES[e.actorType];
                  return (
                    <Fragment key={e.id}>
                      <tr>
                        <Td className="text-fg-2 whitespace-nowrap">
                          {fmtAbsolute(e.createdAt)}
                        </Td>
                        <td>
                          <div className="flex flex-col gap-1">
                            <span
                              className={`badge badge-sm self-start ${actor.bg} ${actor.text}`}
                            >
                              {e.actorType}
                            </span>
                            <span className="font-mono text-[11px] text-fg-3">
                              {truncId(e.actorId)}
                            </span>
                          </div>
                        </td>
                        <Td className="font-mono lowercase whitespace-nowrap">{e.action}</Td>
                        <Td className="font-mono text-fg-2 whitespace-nowrap">
                          {e.resourceType}
                          {e.resourceId ? `:${truncId(e.resourceId)}` : ""}
                        </Td>
                        <td>
                          <button
                            type="button"
                            onClick={() => toggleExpanded(e.id)}
                            className="btn btn-secondary btn-sm"
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
                        <tr>
                          <td
                            colSpan={5}
                            className="bg-sunken/60"
                          >
                            <div className="code-block text-[11px] whitespace-pre">
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
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {nextCursor && (
          <div className="border-t border-line px-4 py-3 flex justify-center">
            <button
              type="button"
              onClick={() => setCursor(nextCursor)}
              disabled={auditQ.isFetching}
              className="btn btn-secondary"
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
  return <th>{children}</th>;
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={className}>
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0">
      <span className="eyebrow text-fg-3 flex-shrink-0">
        {label}
      </span>
      <div className="chip-row">{children}</div>
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
      aria-pressed={active}
      data-active={active}
      className="chip"
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
    <label className="flex flex-col min-w-0">
      <span className="field-label eyebrow">
        {label}
      </span>
      {children}
    </label>
  );
}
