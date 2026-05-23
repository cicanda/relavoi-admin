"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { PageHeader } from "@/components/page-header";
import { SkeletonRow } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAdminAuth } from "@/lib/auth-store";
import { getAdminPricing, patchPricing } from "@/lib/api";
import type { PricingRow, Tier } from "@/lib/types";

const TIERS: Tier[] = ["STARTER", "GROWTH", "ENTERPRISE"];

const TIER_META: Record<
  Tier,
  { subtitle: string; accentBorder: string; accentDot: string }
> = {
  STARTER: {
    subtitle: "Onboarding plan · 100 included sessions",
    accentBorder: "border-l-ink-500",
    accentDot: "bg-ink-500",
  },
  GROWTH: {
    subtitle: "Production-ready · 1,000 sessions",
    accentBorder: "border-l-sky-500",
    accentDot: "bg-sky-500",
  },
  ENTERPRISE: {
    subtitle: "High-volume · 10,000 sessions",
    accentBorder: "border-l-signal-500",
    accentDot: "bg-signal-500",
  },
};

const METRIC_LABELS: Record<string, string> = {
  session_created: "Sessions created",
  call_minute: "Call minutes",
  sms_sent: "SMS sent",
  number_rental: "Number rentals",
  recording_storage: "Recording storage (GB)",
};

function humanMetric(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}

type DraftRow = Partial<PricingRow>;
type DraftMap = Record<string, DraftRow>; // key = `${tier}::${metric}`

export default function PricingPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const role = useAdminAuth((s) => s.operator?.role);
  const canEdit = role === "ROOT";

  const pricingQ = useQuery({
    queryKey: ["pricing"],
    queryFn: getAdminPricing,
  });

  const rows: PricingRow[] = pricingQ.data ?? [];

  const byTier = useMemo(() => {
    const map: Record<Tier, PricingRow[]> = {
      STARTER: [],
      GROWTH: [],
      ENTERPRISE: [],
    };
    rows.forEach((r) => {
      if (TIERS.includes(r.tier)) map[r.tier].push(r);
    });
    return map;
  }, [rows]);

  const [drafts, setDrafts] = useState<DraftMap>({});
  const [savingTier, setSavingTier] = useState<Tier | null>(null);

  const saveM = useMutation({
    mutationFn: async (
      payloads: Array<Partial<PricingRow> & { tier: Tier; metric: string }>,
    ) => {
      const results = await Promise.allSettled(
        payloads.map((p) => patchPricing(p)),
      );
      return results;
    },
    onSuccess: (results, vars) => {
      const failed = results.filter((r) => r.status === "rejected");
      const cameSoon = failed.some(
        (r) =>
          r.status === "rejected" &&
          isAxiosError(r.reason) &&
          r.reason.response?.status === 404,
      );
      if (cameSoon) {
        toast.info(
          "Endpoint coming soon",
          "Pricing patch endpoint is not yet wired on the backend.",
        );
      } else if (failed.length > 0) {
        toast.error(
          "Some rows failed",
          `${failed.length} of ${results.length} updates rejected.`,
        );
      } else {
        toast.success(
          "Pricing saved",
          `${vars.length} row${vars.length === 1 ? "" : "s"} updated.`,
        );
      }
      qc.invalidateQueries({ queryKey: ["pricing"] });
    },
    onError: (err) => {
      if (isAxiosError(err) && err.response?.status === 404) {
        toast.info(
          "Endpoint coming soon",
          "Pricing patch endpoint is not yet wired on the backend.",
        );
      } else {
        toast.error("Save failed", err instanceof Error ? err.message : "Unknown error");
      }
    },
  });

  function rowKey(tier: Tier, metric: string) {
    return `${tier}::${metric}`;
  }

  function updateDraft(tier: Tier, metric: string, patch: DraftRow) {
    setDrafts((prev) => {
      const key = rowKey(tier, metric);
      return { ...prev, [key]: { ...(prev[key] ?? {}), ...patch } };
    });
  }

  async function saveTier(tier: Tier) {
    const tierRows = byTier[tier];
    const payloads: Array<Partial<PricingRow> & { tier: Tier; metric: string }> =
      [];
    tierRows.forEach((row) => {
      const draft = drafts[rowKey(tier, row.metric)];
      if (!draft) return;
      const dirty: Partial<PricingRow> = {};
      if (
        draft.unitPrice !== undefined &&
        draft.unitPrice !== row.unitPrice
      ) {
        dirty.unitPrice = draft.unitPrice;
      }
      if (
        draft.includedQuantity !== undefined &&
        draft.includedQuantity !== row.includedQuantity
      ) {
        dirty.includedQuantity = draft.includedQuantity;
      }
      if (
        draft.overagePrice !== undefined &&
        draft.overagePrice !== row.overagePrice
      ) {
        dirty.overagePrice = draft.overagePrice;
      }
      if (Object.keys(dirty).length > 0) {
        payloads.push({ tier, metric: row.metric, ...dirty });
      }
    });

    if (payloads.length === 0) {
      toast.info("No changes", "Nothing to save for this tier.");
      return;
    }

    setSavingTier(tier);
    try {
      await saveM.mutateAsync(payloads);
      // Clear drafts for this tier on success.
      setDrafts((prev) => {
        const next = { ...prev };
        tierRows.forEach((r) => delete next[rowKey(tier, r.metric)]);
        return next;
      });
    } finally {
      setSavingTier(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Per-tier pricing for billable usage metrics"
      />

      <div className="space-y-4">
        {TIERS.map((tier) => {
          const meta = TIER_META[tier];
          const tierRows = byTier[tier];
          return (
            <section
              key={tier}
              className={`bg-ink-800 border border-ink-700 ${meta.accentBorder} border-l-4 rounded-[10px] shadow-card p-5`}
            >
              <header className="flex items-center justify-between mb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${meta.accentDot}`}
                    />
                    <h2 className="text-xl text-paper font-semibold">{tier}</h2>
                  </div>
                  <p className="text-xs text-ink-400 mt-1">{meta.subtitle}</p>
                </div>
              </header>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Metric</Th>
                      <Th>Unit Price</Th>
                      <Th>Included Quantity</Th>
                      <Th>Overage Price</Th>
                      <Th>Currency</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingQ.isLoading ? (
                      <>
                        <SkeletonRow cols={5} />
                        <SkeletonRow cols={5} />
                      </>
                    ) : tierRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 border-t border-ink-700 text-center text-sm text-ink-500"
                        >
                          No pricing rows configured for this tier.
                        </td>
                      </tr>
                    ) : (
                      tierRows.map((row) => (
                        <tr
                          key={row.metric}
                          className="hover:bg-ink-900/40 transition-colors"
                        >
                          <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-200 font-mono uppercase">
                            <div className="flex flex-col">
                              <span>{row.metric}</span>
                              <span className="text-[11px] text-ink-500 normal-case font-sans mt-0.5">
                                {humanMetric(row.metric)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 border-t border-ink-700">
                            {canEdit ? (
                              <PriceInput
                                defaultValue={row.unitPrice}
                                suffix="NGN"
                                onChange={(v) =>
                                  updateDraft(tier, row.metric, {
                                    unitPrice: v,
                                  })
                                }
                              />
                            ) : (
                              <span className="text-[13px] text-ink-200 tabular-nums">
                                {row.unitPrice}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 border-t border-ink-700">
                            {canEdit ? (
                              <PriceInput
                                defaultValue={row.includedQuantity}
                                onChange={(v) =>
                                  updateDraft(tier, row.metric, {
                                    includedQuantity: v,
                                  })
                                }
                              />
                            ) : (
                              <span className="text-[13px] text-ink-200 tabular-nums">
                                {row.includedQuantity}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 border-t border-ink-700">
                            {canEdit ? (
                              <PriceInput
                                defaultValue={row.overagePrice ?? 0}
                                suffix="NGN"
                                onChange={(v) =>
                                  updateDraft(tier, row.metric, {
                                    overagePrice: v,
                                  })
                                }
                              />
                            ) : (
                              <span className="text-[13px] text-ink-200 tabular-nums">
                                {row.overagePrice ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 border-t border-ink-700 text-[13px] text-ink-400 font-mono">
                            NGN
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {canEdit && tierRows.length > 0 && (
                <div className="flex justify-end mt-4">
                  <button
                    type="button"
                    onClick={() => saveTier(tier)}
                    disabled={savingTier === tier}
                    className="bg-signal-500 text-ink-900 px-4 h-10 rounded-md font-medium hover:bg-signal-600 text-sm transition-colors disabled:opacity-50"
                  >
                    {savingTier === tier ? "Saving…" : `Save ${tier}`}
                  </button>
                </div>
              )}
            </section>
          );
        })}
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

function PriceInput({
  defaultValue,
  suffix,
  onChange,
}: {
  defaultValue: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="relative inline-flex items-center">
      <input
        type="number"
        step="0.01"
        defaultValue={defaultValue}
        onChange={(e) => {
          const v = Number.parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className={`h-9 px-3 ${suffix ? "pr-12" : ""} bg-ink-900 border border-ink-700 text-paper rounded-md text-[13px] focus:outline-none focus:border-signal-500 focus:ring-1 focus:ring-signal-500/30 w-32 tabular-nums`}
      />
      {suffix && (
        <span className="absolute right-2 text-[11px] font-mono text-ink-500 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
