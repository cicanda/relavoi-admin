import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** Optional colored dot (e.g. "signal" green for active sessions, "rose" for DLQ depth). */
  accent?: "signal" | "rose" | "amber" | "sky" | "ink";
  loading?: boolean;
}) {
  const dotColor =
    accent === "signal" ? "bg-signal-500"
    : accent === "rose"   ? "bg-rose-500"
    : accent === "amber"  ? "bg-amber-500"
    : accent === "sky"    ? "bg-sky-500"
    : null;

  // After the reference's stat tiles: label up top, a large light figure
  // anchored to the bottom, and room to breathe in between.
  return (
    <div className="card card-lift card-pad min-w-0 h-full flex flex-col gap-6 sm:min-h-[148px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {dotColor && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />}
          <div className="eyebrow text-fg-2">{label}</div>
        </div>
        {Icon && (
          <div className="icon-tile w-9 h-9">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="mt-auto">
        {loading ? (
          <div className="h-9 w-24 rounded-md animate-shimmer" />
        ) : (
          <div className="text-[length:var(--text-stat)] font-light text-fg tabular-nums tracking-[-0.04em] leading-none break-words">{value}</div>
        )}
        {hint && !loading && <div className="text-xs text-fg-3 mt-2">{hint}</div>}
      </div>
    </div>
  );
}
