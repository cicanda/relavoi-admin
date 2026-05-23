// State / status pill styled for the dark operator-console chrome.
// Adapts colors to dark backgrounds (subtle tinted bg, brighter text).

const MAP: Record<string, { bg: string; text: string; dot: string; label?: string }> = {
  // Session states
  ACTIVE:       { bg: "bg-signal-500/15", text: "text-signal-500",  dot: "bg-signal-500" },
  PENDING:      { bg: "bg-amber-500/15",  text: "text-amber-400",   dot: "bg-amber-500" },
  GRACE_PERIOD: { bg: "bg-sky-500/15",    text: "text-sky-400",     dot: "bg-sky-500", label: "GRACE" },
  EXPIRED:      { bg: "bg-ink-700",       text: "text-ink-400",     dot: "bg-ink-500" },
  FAILED:       { bg: "bg-rose-500/15",   text: "text-rose-400",    dot: "bg-rose-500" },

  // Call states
  RINGING:      { bg: "bg-amber-500/15",  text: "text-amber-400",   dot: "bg-amber-500" },
  ANSWERED:     { bg: "bg-signal-500/15", text: "text-signal-500",  dot: "bg-signal-500" },
  COMPLETED:    { bg: "bg-ink-700",       text: "text-ink-300",     dot: "bg-ink-500" },
  MISSED:       { bg: "bg-amber-500/15",  text: "text-amber-400",   dot: "bg-amber-500" },

  // Number / pool states
  AVAILABLE:    { bg: "bg-signal-500/15", text: "text-signal-500",  dot: "bg-signal-500" },
  IN_USE:       { bg: "bg-sky-500/15",    text: "text-sky-400",     dot: "bg-sky-500" },
  COOLDOWN:     { bg: "bg-amber-500/15",  text: "text-amber-400",   dot: "bg-amber-500" },
  QUARANTINED:  { bg: "bg-rose-500/15",   text: "text-rose-400",    dot: "bg-rose-500" },

  // Circuit breaker
  CLOSED:       { bg: "bg-signal-500/15", text: "text-signal-500",  dot: "bg-signal-500" },
  OPEN:         { bg: "bg-rose-500/15",   text: "text-rose-400",    dot: "bg-rose-500" },
  HALF_OPEN:    { bg: "bg-amber-500/15",  text: "text-amber-400",   dot: "bg-amber-500", label: "HALF-OPEN" },

  // DLQ
  RETRYING:     { bg: "bg-amber-500/15",  text: "text-amber-400",   dot: "bg-amber-500" },
  RESOLVED:     { bg: "bg-signal-500/15", text: "text-signal-500",  dot: "bg-signal-500" },
  ABANDONED:    { bg: "bg-rose-500/15",   text: "text-rose-400",    dot: "bg-rose-500" },

  // Tenant status
  SUSPENDED:    { bg: "bg-amber-500/15",  text: "text-amber-400",   dot: "bg-amber-500" },
  CANCELLED:    { bg: "bg-rose-500/15",   text: "text-rose-400",    dot: "bg-rose-500" },

  // Health checks
  ok:           { bg: "bg-signal-500/15", text: "text-signal-500",  dot: "bg-signal-500", label: "OK" },
  down:         { bg: "bg-rose-500/15",   text: "text-rose-400",    dot: "bg-rose-500", label: "DOWN" },
  healthy:      { bg: "bg-signal-500/15", text: "text-signal-500",  dot: "bg-signal-500", label: "HEALTHY" },
  degraded:     { bg: "bg-amber-500/15",  text: "text-amber-400",   dot: "bg-amber-500", label: "DEGRADED" },
};

export function StatePill({ state, size = "md" }: { state: string; size?: "sm" | "md" }) {
  const cfg = MAP[state] ?? { bg: "bg-ink-700", text: "text-ink-300", dot: "bg-ink-500" };
  const label = cfg.label ?? state;
  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1.5 ${cfg.bg} ${cfg.text} ${padding} rounded-md font-mono uppercase tracking-wider font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${state === "ACTIVE" ? "animate-pulse-dot" : ""}`} />
      {label}
    </span>
  );
}

const ROLE_MAP: Record<string, { bg: string; text: string }> = {
  ROOT:    { bg: "bg-rose-500/15",   text: "text-rose-400" },
  SRE:     { bg: "bg-amber-500/15",  text: "text-amber-400" },
  SUPPORT: { bg: "bg-sky-500/15",    text: "text-sky-400" },
  VIEWER:  { bg: "bg-ink-700",       text: "text-ink-300" },
};

export function RolePill({ role }: { role: string }) {
  const cfg = ROLE_MAP[role] ?? ROLE_MAP.VIEWER;
  return (
    <span className={`inline-flex items-center ${cfg.bg} ${cfg.text} px-2 py-1 rounded-md font-mono text-[11px] uppercase tracking-wider font-medium`}>
      {role}
    </span>
  );
}
