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

  const [platform, setPlatform] = useState<string>("Not set");
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

      <div className="bento">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
        <FleetCard title="API service" icon={Server} loading={isLoading}>
          <Row label="Replicas" value="2" />
          <RowPill label="Status" state={serviceState} />
          <Row label="Last deploy" value="Not set" />
        </FleetCard>

        <FleetCard title="Webhook service" icon={Webhook} loading={isLoading}>
          <Row label="Replicas" value="3" hint="critical path" />
          <RowPill label="Status" state={serviceState} />
          <Row label="Last deploy" value="Not set" />
        </FleetCard>

        <FleetCard title="Worker service" icon={Cpu} loading={isLoading}>
          <Row label="Replicas" value="1" />
          <RowPill label="Status" state={serviceState} />
          <Row label="Background jobs" value="Not set" />
        </FleetCard>

        <FleetCard title="PostgreSQL" icon={Database} loading={isLoading}>
          <RowPill label="Status" state={health.checks?.postgres ?? "down"} />
          <Row label="Connections" value="Not set" />
          <Row label="Utilization" value="Not set" />
        </FleetCard>

        <FleetCard title="Redis" icon={Activity} loading={isLoading}>
          <RowPill label="Status" state={health.checks?.redis ?? "down"} />
          <Row label="Memory" value="Not set" />
          <Row label="Clients" value="Not set" />
          <Row label="Uptime" value="Not set" />
        </FleetCard>

        <FleetCard title="Runtime" icon={Cpu}>
          <Row label="Node" value="Node.js" />
          <Row label="Memory RSS" value="Not set" />
          <Row label="Platform" value={platform} />
        </FleetCard>

        <div className="opacity-60 [&>.card]:h-full">
          <FleetCard title="Kubernetes" icon={Layers}>
            <Row label="Replicas across pods" value="Not set" />
            <div className="text-xs text-fg-3 pt-3">
              Coming soon. Pod-level introspection will appear here once the operator API exposes
              it.
            </div>
          </FleetCard>
        </div>
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
    <div className="card card-pad card-lift min-w-0">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="card-title">{title}</div>
        <div className="icon-tile w-9 h-9">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="divide-y divide-line">
        {loading ? (
          <div className="space-y-3 py-2">
            <div className="h-3 rounded-full animate-shimmer" />
            <div className="h-3 rounded-full animate-shimmer w-3/4" />
            <div className="h-3 rounded-full animate-shimmer w-1/2" />
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
    <div className="flex items-center justify-between gap-3 py-2.5 text-[13px] min-w-0">
      <span className="text-fg-2">{label}</span>
      <span className="text-fg font-mono tabular-nums text-right break-all">
        {value}
        {hint && <span className="text-fg-3 font-sans ml-1.5 text-xs">({hint})</span>}
      </span>
    </div>
  );
}

function RowPill({ label, state }: { label: string; state: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
      <span className="text-fg-2">{label}</span>
      <StatePill state={state} />
    </div>
  );
}
