// State / status pill on the light console surfaces: a soft tinted capsule
// with a darker text tone so small mono labels stay readable.

import type { Tier } from "@/lib/types";

const GREEN = { bg: "bg-signal-500/15", text: "text-signal-800", dot: "bg-signal-500" };
const AMBER = { bg: "bg-amber-500/15",  text: "text-amber-800",  dot: "bg-amber-500" };
const SKY   = { bg: "bg-sky-500/12",    text: "text-sky-800",    dot: "bg-sky-500" };
const ROSE  = { bg: "bg-rose-500/12",   text: "text-rose-700",   dot: "bg-rose-500" };
const MUTED = { bg: "bg-mute",          text: "text-fg-2",       dot: "bg-ink-500" };

const MAP: Record<string, { bg: string; text: string; dot: string; label?: string }> = {
  // Session states
  ACTIVE:       GREEN,
  PENDING:      AMBER,
  GRACE_PERIOD: { ...SKY, label: "GRACE" },
  EXPIRED:      MUTED,
  FAILED:       ROSE,

  // Call states
  RINGING:      AMBER,
  ANSWERED:     GREEN,
  COMPLETED:    MUTED,
  MISSED:       AMBER,

  // Number / pool states
  AVAILABLE:    GREEN,
  IN_USE:       SKY,
  COOLDOWN:     AMBER,
  QUARANTINED:  ROSE,

  // Circuit breaker
  CLOSED:       GREEN,
  OPEN:         ROSE,
  HALF_OPEN:    { ...AMBER, label: "HALF-OPEN" },

  // DLQ
  RETRYING:     AMBER,
  RESOLVED:     GREEN,
  ABANDONED:    ROSE,

  // Tenant status
  SUSPENDED:    AMBER,
  CANCELLED:    ROSE,

  // Health checks
  ok:           { ...GREEN, label: "OK" },
  down:         { ...ROSE, label: "DOWN" },
  healthy:      { ...GREEN, label: "HEALTHY" },
  degraded:     { ...AMBER, label: "DEGRADED" },
};

export function StatePill({ state, size = "md" }: { state: string; size?: "sm" | "md" }) {
  const cfg = MAP[state] ?? MUTED;
  const label = cfg.label ?? state;
  return (
    <span className={`badge ${size === "sm" ? "badge-sm" : ""} ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot} ${state === "ACTIVE" ? "animate-pulse-dot" : ""}`} />
      {label}
    </span>
  );
}

const ROLE_MAP: Record<string, { bg: string; text: string; dark: string }> = {
  ROOT:    { bg: "bg-rose-500/12",  text: "text-rose-700",  dark: "bg-rose-500/20 text-rose-300" },
  SRE:     { bg: "bg-amber-500/15", text: "text-amber-800", dark: "bg-amber-500/20 text-amber-300" },
  SUPPORT: { bg: "bg-sky-500/12",   text: "text-sky-800",   dark: "bg-sky-500/20 text-sky-300" },
  VIEWER:  { bg: "bg-mute",         text: "text-fg-2",      dark: "bg-white/10 text-ink-300" },
};

/** `onDark` for the ink sidebar, where the light-surface tones would vanish. */
export function RolePill({ role, onDark = false }: { role: string; onDark?: boolean }) {
  const cfg = ROLE_MAP[role] ?? ROLE_MAP.VIEWER;
  return (
    <span className={`badge badge-sm ${onDark ? cfg.dark : `${cfg.bg} ${cfg.text}`}`}>
      {role}
    </span>
  );
}

export function TierPill({ tier }: { tier: Tier }) {
  const cfg =
    tier === "ENTERPRISE"
      ? "bg-signal-500/15 text-signal-800"
      : tier === "SCALE"
        ? "bg-violet-500/12 text-violet-800"
        : tier === "GROWTH"
          ? "bg-sky-500/12 text-sky-800"
          : "bg-mute text-fg-2";
  return <span className={`badge badge-sm flex-shrink-0 ${cfg}`}>{tier}</span>;
}
