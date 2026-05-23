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

  return (
    <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-400">{label}</div>
          </div>
          {loading ? (
            <div className="mt-2 h-8 w-24 rounded animate-shimmer" />
          ) : (
            <div className="mt-1.5 text-2xl font-semibold text-paper tabular-nums">{value}</div>
          )}
          {hint && !loading && <div className="text-xs text-ink-500 mt-0.5">{hint}</div>}
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-md bg-ink-900 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-ink-400" />
          </div>
        )}
      </div>
    </div>
  );
}
