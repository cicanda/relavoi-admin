"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Server,
  Webhook,
  Cpu,
  Database,
  Activity,
  Layers,
} from "lucide-react";

import { getSystemHealth } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import type { SystemHealth } from "@/lib/types";

export default function FleetPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const [platform, setPlatform] = useState<string>("—");
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.platform) {
      setPlatform(navigator.platform);
    }
  }, []);

  const health: SystemHealth = data ?? {};
  const pgOk = health.checks?.postgres === "ok";
  const redisOk = health.checks?.redis === "ok";
  const serviceState = pgOk && redisOk ? "ok" : "degraded";

  return (
    <div>
      <PageHeader title="Fleet" description="Service replicas, datastores, and runtime" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FleetCard title="API service" icon={Server} loading={isLoading}>
          <Row label="Replicas" value="2" />
          <RowPill label="Status" state={serviceState} />
          <Row label="Last deploy" value="—" />
        </FleetCard>

        <FleetCard title="Webhook service" icon={Webhook} loading={isLoading}>
          <Row label="Replicas" value="3" hint="critical path" />
          <RowPill label="Status" state={serviceState} />
          <Row label="Last deploy" value="—" />
        </FleetCard>

        <FleetCard title="Worker service" icon={Cpu} loading={isLoading}>
          <Row label="Replicas" value="1" />
          <RowPill label="Status" state={serviceState} />
          <Row label="Background jobs" value="—" />
        </FleetCard>

        <FleetCard title="PostgreSQL" icon={Database} loading={isLoading}>
          <RowPill label="Status" state={health.checks?.postgres ?? "down"} />
          <Row label="Connections" value="—" />
          <Row label="Utilization" value="—" />
        </FleetCard>

        <FleetCard title="Redis" icon={Activity} loading={isLoading}>
          <RowPill label="Status" state={health.checks?.redis ?? "down"} />
          <Row label="Memory" value="—" />
          <Row label="Clients" value="—" />
          <Row label="Uptime" value="—" />
        </FleetCard>

        <FleetCard title="Runtime" icon={Cpu}>
          <Row label="Node" value="Node.js" />
          <Row label="Memory RSS" value="—" />
          <Row label="Platform" value={platform} />
        </FleetCard>

        <div className="opacity-60">
          <FleetCard title="Kubernetes" icon={Layers}>
            <Row label="Replicas across pods" value="—" />
            <div className="text-xs text-ink-500 mt-2">
              Coming soon — pod-level introspection will appear here once the operator API exposes
              it.
            </div>
          </FleetCard>
        </div>
      </div>
    </div>
  );
}

function FleetCard({
  title,
  icon: Icon,
  loading,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-[10px] shadow-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="text-paper font-semibold text-base">{title}</div>
        <div className="w-9 h-9 rounded-md bg-ink-900 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-ink-400" />
        </div>
      </div>
      <div className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            <div className="h-3 rounded animate-shimmer" />
            <div className="h-3 rounded animate-shimmer w-3/4" />
            <div className="h-3 rounded animate-shimmer w-1/2" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-ink-400">{label}</span>
      <span className="text-paper font-mono tabular-nums">
        {value}
        {hint && <span className="text-ink-500 font-sans ml-1.5 text-xs">({hint})</span>}
      </span>
    </div>
  );
}

function RowPill({ label, state }: { label: string; state: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-ink-400">{label}</span>
      <StatePill state={state} />
    </div>
  );
}
