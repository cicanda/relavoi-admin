"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { useToast } from "@/components/toast";
import { getSystemHealth } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import type { SystemHealth } from "@/lib/types";

const ENV_LABEL = process.env.NEXT_PUBLIC_ENV_LABEL ?? "ng-prod";
const API_URL =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:3000/v1/admin";
const METRICS_URL = `${API_URL.replace(/\/v1\/admin\/?$/, "")}/metrics`;

interface FlagRow {
  name: string;
  state: "DEFAULT" | "DISABLED" | "ENABLED";
}

const FLAGS: FlagRow[] = [
  { name: "consent_audio_required", state: "DEFAULT" },
  { name: "twilio_failover_pool", state: "DISABLED" },
  { name: "sms_auto_reply", state: "ENABLED" },
  { name: "circuit_breaker_v2", state: "DEFAULT" },
];

interface PodRow {
  service: string;
  desired: string;
  ready: string;
}

const PODS: PodRow[] = [
  { service: "api", desired: "—", ready: "—" },
  { service: "webhook", desired: "—", ready: "—" },
  { service: "worker", desired: "—", ready: "—" },
];

export default function SystemPage() {
  const healthQ = useQuery({
    queryKey: ["health-system"],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });

  const health: SystemHealth | undefined = healthQ.data;

  return (
    <>
      <PageHeader
        title="System"
        description="Runtime, health checks, and feature flags"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EnvironmentCard />
        <UptimeCard health={health} loading={healthQ.isLoading} />
      </div>

      <HealthChecksCard health={health} loading={healthQ.isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <FeatureFlagsCard />
        <PodStatusCard />
      </div>
    </>
  );
}

function EnvironmentCard() {
  const toast = useToast();

  function copy(value: string, label: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard unavailable");
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error("Copy failed"));
  }

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Environment", value: ENV_LABEL, mono: true },
    { label: "Backend URL", value: API_URL, mono: true },
    { label: "API version", value: "v1", mono: true },
    { label: "Console build", value: "0.1.0", mono: true },
    { label: "Started", value: "—" },
  ];

  return (
    <Card title="Environment" icon={Cpu}>
      <ul className="divide-y divide-ink-700">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500 flex-shrink-0">
              {row.label}
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`text-[13px] text-ink-200 truncate ${row.mono ? "font-mono" : ""}`}
                title={row.value}
              >
                {row.value}
              </span>
              {row.value !== "—" && (
                <button
                  type="button"
                  onClick={() => copy(row.value, row.label)}
                  className="text-ink-500 hover:text-paper transition-colors p-1 -m-1"
                  aria-label={`Copy ${row.label}`}
                  title={`Copy ${row.label}`}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function UptimeCard({
  health,
  loading,
}: {
  health: SystemHealth | undefined;
  loading: boolean;
}) {
  const status = health?.status;
  return (
    <Card title="Uptime / Version" icon={Activity}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
            Last health check
          </span>
          <span className="text-[13px] text-ink-200">
            {loading ? "…" : fmtRelative(health?.timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
            Backend status
          </span>
          {status ? (
            <StatePill state={status} size="sm" />
          ) : (
            <span className="text-[13px] text-ink-400">—</span>
          )}
        </div>
        <div className="pt-2 border-t border-ink-700">
          <p className="text-xs text-ink-500">
            Auto-refreshes every 30 seconds
          </p>
        </div>
      </div>
    </Card>
  );
}

function HealthChecksCard({
  health,
  loading,
}: {
  health: SystemHealth | undefined;
  loading: boolean;
}) {
  const pg = health?.checks?.postgres;
  const redis = health?.checks?.redis;

  return (
    <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-4 h-4 text-ink-400" />
        <h2 className="text-sm font-semibold text-paper">Datastores</h2>
      </div>

      <ul className="space-y-3">
        <HealthRow
          label="PostgreSQL"
          status={loading ? undefined : pg}
        />
        <HealthRow label="Redis" status={loading ? undefined : redis} />
      </ul>

      <div className="border-t border-ink-700 mt-5 pt-5">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-ink-400" />
          <h3 className="text-sm font-semibold text-paper">Metrics</h3>
        </div>
        <a
          href={METRICS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-signal-500 hover:text-signal-600 text-sm font-medium transition-colors"
        >
          View Prometheus metrics
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <p className="text-xs text-ink-500 mt-2">
          Raw metrics endpoint; scrape with Prometheus.
        </p>
      </div>
    </div>
  );
}

function HealthRow({
  label,
  status,
}: {
  label: string;
  status?: "ok" | "down";
}) {
  const dot =
    status === "ok"
      ? "bg-signal-500"
      : status === "down"
        ? "bg-rose-500"
        : "bg-ink-500";
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3">
        <span
          className={`w-3.5 h-3.5 rounded-full ${dot} ${status === "ok" ? "animate-pulse-dot" : ""}`}
        />
        <span className="text-base text-paper">{label}</span>
      </div>
      {status ? (
        <StatePill state={status} size="sm" />
      ) : (
        <span className="text-[13px] text-ink-500">…</span>
      )}
    </li>
  );
}

function FeatureFlagsCard() {
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-5 opacity-60">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-ink-400" />
        <h2 className="text-sm font-semibold text-paper">Feature Flags</h2>
      </div>
      <ul className="space-y-2">
        {FLAGS.map((f) => (
          <li
            key={f.name}
            className="flex items-center justify-between gap-3 py-1.5 border-b border-ink-700 last:border-0"
          >
            <span className="text-[13px] font-mono text-ink-200">{f.name}</span>
            <FlagToggle state={f.state} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-500 mt-4">
        Coming soon — feature flag management will live here.
      </p>
    </div>
  );
}

function FlagToggle({ state }: { state: "DEFAULT" | "DISABLED" | "ENABLED" }) {
  const cfg =
    state === "ENABLED"
      ? "bg-signal-500/15 text-signal-500"
      : state === "DISABLED"
        ? "bg-rose-500/15 text-rose-400"
        : "bg-ink-700 text-ink-300";
  return (
    <button
      type="button"
      disabled
      className={`inline-flex items-center ${cfg} px-2 py-1 rounded-md font-mono text-[11px] uppercase tracking-wider font-medium cursor-not-allowed`}
    >
      {state}
    </button>
  );
}

function PodStatusCard() {
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-5 opacity-60">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-4 h-4 text-ink-400" />
        <h2 className="text-sm font-semibold text-paper">Pod Status</h2>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[11px] font-mono uppercase tracking-wider text-ink-500 pb-2">
              Service
            </th>
            <th className="text-right text-[11px] font-mono uppercase tracking-wider text-ink-500 pb-2">
              Desired
            </th>
            <th className="text-right text-[11px] font-mono uppercase tracking-wider text-ink-500 pb-2">
              Ready
            </th>
          </tr>
        </thead>
        <tbody>
          {PODS.map((p) => (
            <tr key={p.service} className="border-t border-ink-700">
              <td className="text-[13px] text-ink-200 py-2 font-mono">
                {p.service}
              </td>
              <td className="text-[13px] text-ink-400 py-2 text-right tabular-nums">
                {p.desired}
              </td>
              <td className="text-[13px] text-ink-400 py-2 text-right tabular-nums">
                {p.ready}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink-500 mt-4">
        Pod-level visibility requires the K8s introspection endpoint to be
        wired up first.
      </p>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-ink-400" />
        <h2 className="text-sm font-semibold text-paper">{title}</h2>
      </div>
      {children}
    </div>
  );
}
