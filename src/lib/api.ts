"use client";

import axios, { AxiosError, type AxiosInstance } from "axios";
import { readPersistedAdminToken, clearPersistedAdminToken } from "./auth-store";
import type {
  Operator,
  Tenant,
  Session,
  ProxyNumber,
  PoolStatus,
  DlqEntry,
  AuditEntry,
  PricingRow,
  CircuitBreakerStatus,
  PaginatedResponse,
  SystemHealth,
  OperatorRole,
  Tier,
} from "./types";

// NEXT_PUBLIC_ADMIN_API_URL points at the backend's /v1/admin namespace.
const BASE = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:3000/v1/admin";

export const adminApi: AxiosInstance = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

adminApi.interceptors.request.use((cfg) => {
  const token = readPersistedAdminToken();
  if (token) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return cfg;
});

adminApi.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    if (typeof window !== "undefined" && err.response?.status === 401) {
      const url = err.config?.url ?? "";
      if (!url.includes("/auth/login")) {
        clearPersistedAdminToken();
        if (window.location.pathname !== "/login") window.location.assign("/login");
      }
    }
    return Promise.reject(err);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface AdminLoginResponse {
  accessToken: string;
  operator: Operator;
}

export async function adminLogin(email: string, password: string) {
  const { data } = await adminApi.post<AdminLoginResponse>("/auth/login", {
    email,
    password,
  });
  return data;
}

// ─── Tenants ──────────────────────────────────────────────────────────────────
export async function listTenants(params: {
  q?: string;
  tier?: Tier;
  status?: string;
  limit?: number;
  after?: string;
} = {}) {
  const { data } = await adminApi.get<PaginatedResponse<Tenant>>("/tenants", { params });
  return data;
}

export async function getTenant(id: string) {
  const { data } = await adminApi.get<Tenant & { usage?: unknown }>(`/tenants/${id}`);
  return data;
}

export async function updateTenantTier(id: string, tier: Tier) {
  const { data } = await adminApi.patch<{ id: string; tier: Tier }>(`/tenants/${id}/tier`, { tier });
  return data;
}

export async function updateTenantStatus(id: string, status: "ACTIVE" | "SUSPENDED" | "CANCELLED") {
  const { data } = await adminApi.patch<{ id: string; status: string }>(`/tenants/${id}/status`, {
    status,
  });
  return data;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export async function listAdminSessions(params: {
  tenantId?: string;
  state?: string;
  limit?: number;
  after?: string;
} = {}) {
  const { data } = await adminApi.get<PaginatedResponse<Session>>("/sessions", { params });
  return data;
}

// ─── Fleet (numbers + infra) ──────────────────────────────────────────────────
export interface FleetSummary {
  pool?: PoolStatus[];
  numbers?: ProxyNumber[];
  totals?: {
    total?: number;
    available?: number;
    inUse?: number;
    cooldown?: number;
    quarantined?: number;
  };
}

export async function getFleet() {
  const { data } = await adminApi.get<FleetSummary>("/fleet");
  return data;
}

// Quarantine / release are not yet implemented on the backend. We provide them
// here so pages can call them and surface a friendly "coming soon" toast on
// 404, instead of doing string-handling at every call site.
export async function quarantineNumber(num: string, reason: string) {
  const { data } = await adminApi.post(`/numbers/${encodeURIComponent(num)}/quarantine`, { reason });
  return data;
}

export async function releaseNumber(num: string) {
  const { data } = await adminApi.post(`/numbers/${encodeURIComponent(num)}/release`);
  return data;
}

// ─── System / Health ──────────────────────────────────────────────────────────
export async function getSystemHealth() {
  const { data } = await adminApi.get<SystemHealth>("/system/health");
  return data;
}

// ─── DLQ ──────────────────────────────────────────────────────────────────────
export async function listDlq(params: {
  status?: string;
  provider?: string;
  limit?: number;
  after?: string;
} = {}) {
  const { data } = await adminApi.get<PaginatedResponse<DlqEntry>>("/dlq", { params });
  return data;
}

export async function retryDlq(ids?: string[]) {
  const { data } = await adminApi.post<{ retried: number }>("/dlq/retry", { ids });
  return data;
}

export async function abandonDlq(id: string) {
  const { data } = await adminApi.post(`/dlq/${id}/abandon`);
  return data;
}

// ─── Operators ────────────────────────────────────────────────────────────────
export async function listOperators() {
  const { data } = await adminApi.get<{ data: Operator[] } | Operator[]>("/operators");
  return Array.isArray(data) ? data : data.data;
}

export async function createOperator(args: {
  email: string;
  name: string;
  role: OperatorRole;
  password: string;
}) {
  const { data } = await adminApi.post<Operator>("/operators", args);
  return data;
}

export async function deactivateOperator(id: string) {
  const { data } = await adminApi.patch<Operator>(`/operators/${id}`, { isActive: false });
  return data;
}

export async function deleteOperator(id: string) {
  const { data } = await adminApi.delete(`/operators/${id}`);
  return data;
}

// ─── Audit log ────────────────────────────────────────────────────────────────
export async function listAudit(params: {
  actorType?: string;
  resourceType?: string;
  action?: string;
  limit?: number;
  after?: string;
} = {}) {
  const { data } = await adminApi.get<PaginatedResponse<AuditEntry>>("/audit", { params });
  return data;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
export async function getAdminPricing() {
  const { data } = await adminApi.get<{ tiers: PricingRow[] } | PricingRow[]>("/pricing");
  return Array.isArray(data) ? data : data.tiers;
}

export async function patchPricing(row: Partial<PricingRow> & { tier: Tier; metric: string }) {
  const { data } = await adminApi.patch("/pricing", row);
  return data;
}

// ─── CPaaS circuit breakers ───────────────────────────────────────────────────
export async function getCpaasStatus() {
  // Reuse the system-health response — it includes circuit breaker state.
  const h = await getSystemHealth();
  return h.circuitBreakers ?? [];
}

export async function forceCircuitState(provider: string, state: "CLOSED" | "OPEN") {
  const { data } = await adminApi.post(`/cpaas/${provider}/force`, { state });
  return data;
}

// ─── Overview (synthetic from existing endpoints) ─────────────────────────────
//
// The spec calls for GET /admin/overview returning a "platform stats with
// infrastructure block" — the backend doesn't expose that as a single endpoint
// yet, so we hit system/health for infra + tenants/sessions for counts and
// derive the rest client-side. Pages can call this once and surface skeletons
// for any sub-section that fails.
export interface AdminOverview {
  infra: SystemHealth;
  activeSessions: number;
  tenantsCount: number;
  dlqDepth: number;
  poolUtilization: number;
}

export async function getOverview(): Promise<AdminOverview> {
  const [infra, tenants, activeSess, fleet] = await Promise.allSettled([
    getSystemHealth(),
    listTenants({ limit: 1 }),
    listAdminSessions({ state: "ACTIVE", limit: 1 }),
    getFleet(),
  ]);

  const infraVal = infra.status === "fulfilled" ? infra.value : {};
  const tenantsCount =
    tenants.status === "fulfilled"
      ? (tenants.value.pagination?.count ?? tenants.value.data?.length ?? 0)
      : 0;
  const activeSessions =
    activeSess.status === "fulfilled"
      ? (activeSess.value.pagination?.count ?? activeSess.value.data?.length ?? 0)
      : 0;

  let poolUtilization = 0;
  if (fleet.status === "fulfilled" && fleet.value.totals) {
    const t = fleet.value.totals;
    const total = t.total ?? 0;
    const inUse = t.inUse ?? 0;
    poolUtilization = total > 0 ? Math.round((inUse / total) * 100) : 0;
  }

  return {
    infra: infraVal,
    activeSessions,
    tenantsCount,
    dlqDepth: infraVal.dlqDepth ?? 0,
    poolUtilization,
  };
}
