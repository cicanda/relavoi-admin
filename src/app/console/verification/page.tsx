"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { listKybQueue, type KybStatus } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeleton";

/**
 * The business-verification review queue.
 *
 * PENDING by default and oldest first, because an application that has waited
 * longest is the one to look at. The other states are reachable from the filter
 * so a past decision can be found without digging through the audit log.
 */

const STATUSES: Array<{ value: KybStatus; label: string }> = [
  { value: "PENDING", label: "Pending review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "NOT_SUBMITTED", label: "Not submitted" },
];

const REGISTRATION_LABELS: Record<string, string> = {
  COMPANY: "RC",
  BUSINESS_NAME: "BN",
  OTHER: "Other",
};

function waitingFor(submittedAt: string | null): string {
  if (!submittedAt) return "None";
  const ms = Date.now() - new Date(submittedAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function VerificationPage() {
  const router = useRouter();
  const [status, setStatus] = useState<KybStatus>("PENDING");

  const q = useQuery({
    queryKey: ["kyb-queue", status],
    queryFn: () => listKybQueue(status),
    refetchInterval: status === "PENDING" ? 60_000 : false,
  });

  const rows = q.data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Verification"
        description="Businesses awaiting manual review before they can go live."
      />

      {/* A tab bar: on a narrow screen it scrolls inside itself, never the page. */}
      <div className="mb-[var(--gap)] -mx-[var(--gutter)] px-[var(--gutter)] py-1.5 flex gap-2 overflow-x-auto [scrollbar-width:none] sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatus(s.value)}
            aria-pressed={status === s.value}
            data-active={status === s.value}
            className="chip chip-plain h-10 px-4 flex-shrink-0"
          >
            {s.label}
          </button>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="card-head card-head-ruled justify-start">
          <span className="icon-tile w-9 h-9">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <h2 className="card-title">
            {STATUSES.find((s) => s.value === status)?.label}
            {!q.isLoading && ` (${rows.length})`}
          </h2>
        </div>

        {/* Horizontal scroll only inside the table, so the page itself never
            scrolls sideways on a narrow screen. */}
        <div className="table-scroll">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                {["Workspace", "Registered name", "Registration", "Docs", "Submitted", "Waiting"].map(
                  (h) => (
                    <th key={h}>{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {q.isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j}>
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!q.isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-sm text-fg-3"
                  >
                    {status === "PENDING"
                      ? "Nothing waiting for review."
                      : "No businesses in this state."}
                  </td>
                </tr>
              )}

              {rows.map((r) => (
                <tr
                  key={r.tenantId}
                  onClick={() => router.push(`/console/tenants/${r.tenantId}`)}
                  className="row-link"
                >
                  <td className="font-medium text-[14px] tracking-[-0.01em]">
                    {r.workspaceName}
                    <div className="text-[12px] font-normal text-fg-3 mt-0.5">
                      {r.tier} · {r.mode}
                    </div>
                  </td>
                  <td>
                    {r.legalName ?? "Not set"}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.registrationNumber ?? "Not set"}
                    {r.registrationType && (
                      <span className="text-[12px] text-fg-3">
                        {" "}
                        {REGISTRATION_LABELS[r.registrationType]}
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums">
                    {r.documentCount}
                  </td>
                  <td className="text-fg-2 whitespace-nowrap">
                    {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "Not set"}
                  </td>
                  <td className="text-fg-2 whitespace-nowrap">
                    {waitingFor(r.submittedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
