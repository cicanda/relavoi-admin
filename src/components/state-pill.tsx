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

  // One of ours: a probe, a smoke test or the Cicanda workspace. Muted on
  // purpose. It is not a warning, it is a note that this row is not business.
  INTERNAL:     MUTED,

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

/**
 * The plan ladder, in brand colours, the same four as the tenant dashboard.
 *
 * It used to run mute, sky, violet, signal. Two of those are Tailwind's own
 * palette and violet has no brand equivalent, which is why the token check
 * had to allowlist it. Slate, Relay Teal, Ink, then Ink carrying Pulse Teal
 * reads as weight increasing with the plan and uses nothing that is not ours.
 *
 * Pulse Teal is on the Ink chip and nowhere else, per the guidelines: 8.01:1
 * on Ink, 2.16:1 on paper.
 *
 * Contrast against the ground each actually sits on:
 *   STARTER     #313D4A on Slate at 15% over white  9.08:1
 *   GROWTH      #096E60 on Relay at 15% over white  5.00:1
 *   SCALE       #FFFFFF on Ink                     17.33:1
 *   ENTERPRISE  #2CC5AE on Ink                      8.01:1
 */
const TIER_MAP: Record<string, string> = {
  STARTER: "bg-ink-500/15 text-ink-700",
  GROWTH: "bg-relay-500/15 text-relay-700",
  SCALE: "bg-ink-900 text-paper",
  ENTERPRISE: "bg-ink-900 text-pulse-500",
};

export function TierPill({ tier }: { tier: Tier }) {
  const cfg = TIER_MAP[tier] ?? TIER_MAP.STARTER;
  return <span className={`badge badge-sm flex-shrink-0 ${cfg}`}>{tier}</span>;
}
