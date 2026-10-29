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

const TIERS: Tier[] = ["STARTER", "GROWTH", "SCALE", "ENTERPRISE"];

const TIER_META: Record<
  Tier,
  { subtitle: string; accentDot: string }
> = {
  STARTER: {
    subtitle: "Onboarding plan · 100 included sessions",
    accentDot: "bg-ink-500",
  },
  GROWTH: {
    subtitle: "Production-ready · 1,000 sessions",
    accentDot: "bg-sky-500",
  },
  SCALE: {
    subtitle: "High-volume · 4,000 sessions",
    accentDot: "bg-violet-500",
  },
  ENTERPRISE: {
    subtitle: "High-volume · 10,000 sessions",
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
      SCALE: [],
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
      payloads: Array<{
        id: string;
        unitPrice?: number;
        includedQuantity?: number;
        overagePrice?: number | null;
      }>,
    ) => {
      const results = await Promise.allSettled(
        payloads.map(({ id, ...patch }) => patchPricing(id, patch)),
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
    const payloads: Array<{
      id: string;
      unitPrice?: number;
      includedQuantity?: number;
      overagePrice?: number | null;
    }> = [];
    tierRows.forEach((row) => {
      const draft = drafts[rowKey(tier, row.metric)];
      if (!draft) return;
      const dirty: { unitPrice?: number; includedQuantity?: number; overagePrice?: number | null } = {};
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
        payloads.push({ id: row.id, ...dirty });
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

      <div className="space-y-[var(--gap)]">
        {TIERS.map((tier) => {
          const meta = TIER_META[tier];
          const tierRows = byTier[tier];
          return (
            <section
              key={tier}
              className="card overflow-hidden"
            >
              <header className="card-head pb-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.accentDot}`}
                    />
                    <h2 className="text-[clamp(1.375rem,1.2rem+0.7vw,1.75rem)] text-fg font-normal tracking-[-0.03em] leading-none">{tier}</h2>
                  </div>
                  <p className="text-[13px] text-fg-2 mt-2">{meta.subtitle}</p>
                </div>
              </header>

              <div className="table-scroll">
                <table className="data-table">
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
                          className="py-8 text-center text-sm text-fg-3"
                        >
                          No pricing rows configured for this tier.
                        </td>
                      </tr>
                    ) : (
                      tierRows.map((row) => (
                        <tr key={row.metric}>
                          <td className="font-mono uppercase">
                            <div className="flex flex-col">
                              <span className="whitespace-nowrap">{row.metric}</span>
                              <span className="text-[12px] text-fg-3 normal-case font-sans mt-0.5 whitespace-nowrap">
                                {humanMetric(row.metric)}
                              </span>
                            </div>
                          </td>
                          <td>
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
                              <span className="text-[13px] text-fg tabular-nums">
                                {row.unitPrice}
                              </span>
                            )}
                          </td>
                          <td>
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
                              <span className="text-[13px] text-fg tabular-nums">
                                {row.includedQuantity}
                              </span>
                            )}
                          </td>
                          <td>
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
                              <span className="text-[13px] text-fg tabular-nums">
                                {row.overagePrice ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="text-fg-3 font-mono">
                            NGN
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {canEdit && tierRows.length > 0 && (
                <div className="flex justify-end px-[var(--card-pad)] py-4 border-t border-line bg-sunken/50">
                  <button
                    type="button"
                    onClick={() => saveTier(tier)}
                    disabled={savingTier === tier}
                    className="btn btn-accent"
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
  return <th>{children}</th>;
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
        className={`field ${suffix ? "pr-12" : ""} w-36 tabular-nums`}
      />
      {suffix && (
        <span className="absolute right-3 text-[11px] font-mono text-fg-3 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
