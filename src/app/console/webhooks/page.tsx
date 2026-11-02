"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SkeletonRow } from "@/components/skeleton";
import { listInternalWebhooks, type InternalWebhookDelivery } from "@/lib/api";
import { fmtRelative, truncId } from "@/lib/format";

/**
 * Deliveries our own webhook sink received.
 *
 * Why this screen exists: the internal workspace's webhook pointed at a path
 * on the marketing site, which has no such route, so every delivery it ever
 * sent came back 404. The delivery pipeline had therefore never been proven
 * against a destination that answers, and the signature we tell integrators
 * to verify had never been verified by anything. The sink is that destination,
 * and this is what it caught.
 *
 * The number that matters is the pair at the top. Arrived tells you deliveries
 * are leaving the platform; verified tells you we are signing them the way we
 * document.
 */
export default function WebhookSinkPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["internal-webhooks"],
    queryFn: () => listInternalWebhooks(50),
    refetchInterval: 20_000,
  });

  const rows: InternalWebhookDelivery[] = q.data?.data ?? [];
  const failed = (q.data?.total ?? 0) - (q.data?.verified ?? 0);

  return (
    <div>
      <PageHeader
        title="Webhook Sink"
        description="Tenant webhooks delivered back to us, and whether they verified"
        actions={
          <button
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {q.data && !q.data.configured && (
        <div className="callout border-amber-500/30 bg-amber-500/10 text-amber-900 mb-4">
          The sink has no token configured in this environment, so nothing can reach it. Set
          INTERNAL_WEBHOOK_SINK_TOKEN and point a workspace webhook at the token path.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="card card-pad">
          <div className="eyebrow text-fg-3">Arrived</div>
          <div className="text-[28px] text-fg mt-1 tabular-nums">{q.data?.total ?? 0}</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow text-fg-3">Verified</div>
          <div className="text-[28px] text-fg mt-1 tabular-nums">{q.data?.verified ?? 0}</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow text-fg-3">Did not verify</div>
          <div
            className={`text-[28px] mt-1 tabular-nums ${failed > 0 ? "text-rose-700" : "text-fg"}`}
          >
            {failed > 0 ? failed : 0}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Recent deliveries</h2>
          <p className="text-[13px] text-fg-3 mt-0.5">
            Kept for {q.data?.retentionDays ?? 30} days. These are diagnostics, not records.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Event</th>
                <th className="th">Workspace</th>
                <th className="th">Signature</th>
                <th className="th">Round trip</th>
                <th className="th">Received</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <>
                  <SkeletonRow cols={6} />
                  <SkeletonRow cols={6} />
                </>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="td text-[13px] text-fg-3 py-8 text-center">
                    Nothing has arrived yet. Point a workspace webhook at the sink and end a
                    session to produce one.
                  </td>
                </tr>
              ) : (
                rows.map((d) => (
                  <Fragment key={d.id}>
                    <tr
                      onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                      className="cursor-pointer hover:bg-mute/50 transition-colors"
                    >
                      <td className="td font-mono text-[12px] text-fg">{d.event ?? "unknown"}</td>
                      <td className="td text-[13px] text-fg-2">
                        {d.workspaceName ?? (d.tenantId ? truncId(d.tenantId) : "unattributed")}
                      </td>
                      <td className="td">
                        {d.signatureValid ? (
                          <span className="inline-flex items-center gap-1.5 text-[13px] text-signal-800">
                            <CheckCircle2 className="w-3.5 h-3.5" /> verified
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 text-[13px] text-rose-700"
                            title={d.signatureDetail ?? undefined}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {d.signatureDetail ?? "did not verify"}
                          </span>
                        )}
                      </td>
                      <td className="td text-[13px] text-fg-2 tabular-nums">
                        {d.latencyMs === null ? "not set" : `${d.latencyMs} ms`}
                      </td>
                      <td className="td text-[13px] text-fg-2">{fmtRelative(d.receivedAt)}</td>
                      <td className="td text-fg-3">
                        {expanded === d.id ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </td>
                    </tr>
                    {expanded === d.id && (
                      <tr>
                        <td colSpan={6} className="td bg-mute/40">
                          <pre className="text-[12px] font-mono text-fg-2 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(d.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
