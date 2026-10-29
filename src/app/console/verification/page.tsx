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
  if (!submittedAt) return "—";
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

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatus(s.value)}
            className={`px-3 h-9 rounded-md text-[13px] border transition-colors ${
              status === s.value
                ? "bg-paper text-ink-900 border-paper font-medium"
                : "bg-ink-800 text-ink-300 border-ink-700 hover:bg-ink-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card">
        <div className="px-5 py-4 border-b border-ink-700 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-ink-400" />
          <h2 className="text-sm font-semibold text-paper">
            {STATUSES.find((s) => s.value === status)?.label}
            {!q.isLoading && ` (${rows.length})`}
          </h2>
        </div>

        {/* Horizontal scroll only inside the table, so the page itself never
            scrolls sideways on a narrow screen. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                {["Workspace", "Registered name", "Registration", "Docs", "Submitted", "Waiting"].map(
                  (h) => (
                    <th
                      key={h}
                      className="bg-ink-900 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-500 text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {q.isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3 border-t border-ink-700">
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!q.isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 border-t border-ink-700 text-center text-sm text-ink-500"
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
                  className="cursor-pointer hover:bg-ink-700/40 transition-colors"
                >
                  <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-paper">
                    {r.workspaceName}
                    <div className="text-[11px] text-ink-500">
                      {r.tier} · {r.mode}
                    </div>
                  </td>
                  <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200">
                    {r.legalName ?? "—"}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 whitespace-nowrap">
                    {r.registrationNumber ?? "—"}
                    {r.registrationType && (
                      <span className="text-[11px] text-ink-500">
                        {" "}
                        {REGISTRATION_LABELS[r.registrationType]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 tabular-nums">
                    {r.documentCount}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-300 whitespace-nowrap">
                    {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-300 whitespace-nowrap">
                    {waitingFor(r.submittedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
