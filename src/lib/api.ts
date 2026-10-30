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
  TenantBilling,
  AdminLedgerEntry,
  ContractTerms,
  ContractTermsView,
} from "./types";

// NEXT_PUBLIC_ADMIN_API_URL points at the backend's /v1/admin namespace.
const BASE = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:8080/v1/admin";

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
export interface FleetRegion {
  region: string;
  total: number;
  available: number;
  inUse: number;
  cooldown: number;
  quarantined: number;
}

export interface FleetSummary {
  pools?: PoolStatus[];
  numbers?: ProxyNumber[];
  byRegion?: FleetRegion[];
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

// Quarantine / release: backend exposes these as POST /admin/pool/{quarantine,release}
// with the number in the request body.
export async function quarantineNumber(num: string, reason: string) {
  const { data } = await adminApi.post("/pool/quarantine", { number: num, reason });
  return data;
}

export async function releaseNumber(num: string) {
  const { data } = await adminApi.post("/pool/release", { number: num });
  return data;
}

// ─── System / Health ──────────────────────────────────────────────────────────
// The backend returns a FLAT health payload ({ postgres, redis, dlqDepth,
// circuitBreakers, timestamp }). Normalize it into the nested SystemHealth shape
// the console renders, and only report "healthy" when both datastores confirm ok.
export async function getSystemHealth(): Promise<SystemHealth> {
  const { data } = await adminApi.get<Record<string, unknown>>("/system/health");
  const checks = (data.checks ?? {}) as { postgres?: string; redis?: string };
  const postgres = (data.postgres ?? checks.postgres) as "ok" | "down" | undefined;
  const redis = (data.redis ?? checks.redis) as "ok" | "down" | undefined;
  const healthy = postgres === "ok" && redis === "ok";
  return {
    status: healthy ? "healthy" : "degraded",
    checks: { postgres, redis },
    circuitBreakers: (data.circuitBreakers as SystemHealth["circuitBreakers"]) ?? [],
    dlqDepth: (data.dlqDepth as number) ?? 0,
    timestamp: data.timestamp as string | undefined,
  };
}

// ─── DLQ ──────────────────────────────────────────────────────────────────────
export interface DlqSummary {
  pending: number;
  retrying: number;
  resolved: number;
  abandoned: number;
}

export async function listDlq(params: {
  status?: string;
  provider?: string;
  limit?: number;
  after?: string;
} = {}) {
  const { data } = await adminApi.get<PaginatedResponse<DlqEntry> & { summary?: DlqSummary }>(
    "/dlq",
    { params },
  );
  return data;
}

export async function retryDlq(ids?: string[]) {
  // Backend responds { retrying: number }.
  const { data } = await adminApi.post<{ retrying: number }>("/dlq/retry", { ids });
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

export async function updateOperator(
  id: string,
  patch: { name?: string; role?: OperatorRole; isActive?: boolean; password?: string },
) {
  const { data } = await adminApi.patch<Operator>(`/operators/${id}`, patch);
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

export async function patchPricing(
  id: string,
  patch: { unitPrice?: number; includedQuantity?: number; overagePrice?: number | null },
) {
  const { data } = await adminApi.patch(`/pricing/${id}`, patch);
  return data;
}

// ─── CPaaS circuit breakers ───────────────────────────────────────────────────
export async function getCpaasStatus() {
  // Reuse the system-health response — it includes circuit breaker state.
  const h = await getSystemHealth();
  return h.circuitBreakers ?? [];
}

export async function forceCircuitState(provider: string, state: "CLOSED" | "OPEN") {
  const suffix = state === "OPEN" ? "force-open" : "force-close";
  const { data } = await adminApi.post(`/cpaas/${provider}/${suffix}`);
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

// ─── Business verification (KYB) ──────────────────────────────────────────────

export type KybStatus = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";

export type KybDocumentKind =
  | "REGISTRATION_CERTIFICATE"
  | "STATUS_REPORT"
  | "MEMART"
  | "OWNER_ID"
  | "PROOF_OF_ADDRESS"
  | "OTHER";

export interface KybDocument {
  id: string;
  kind: KybDocumentKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
}

export interface KybQueueRow {
  tenantId: string;
  workspaceName: string;
  legalName: string | null;
  registrationType: "COMPANY" | "BUSINESS_NAME" | "OTHER" | null;
  registrationNumber: string | null;
  kybStatus: KybStatus;
  submittedAt: string | null;
  mode: "sandbox" | "live";
  tier: Tier;
  documentCount: number;
}

export interface KybTenantDetail {
  tenantId: string;
  workspaceName: string;
  mode: "sandbox" | "live";
  status: KybStatus;
  details: {
    registrationType: "COMPANY" | "BUSINESS_NAME" | "OTHER" | null;
    legalName: string | null;
    registrationNumber: string | null;
    registeredAddress: string | null;
    city: string | null;
    state: string | null;
    contactName: string | null;
    contactPhone: string | null;
    website: string | null;
  };
  documents: KybDocument[];
  missingKinds: KybDocumentKind[];
  missingDetails: string[];
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: { id: string; email: string } | null;
  rejectionReason: string | null;
}

export async function listKybQueue(status: KybStatus = "PENDING", limit = 50) {
  const { data } = await adminApi.get<{ status: KybStatus; data: KybQueueRow[] }>("/kyb", {
    params: { status, limit },
  });
  return data;
}

export async function getTenantKyb(tenantId: string) {
  const { data } = await adminApi.get<KybTenantDetail>(`/tenants/${tenantId}/kyb`);
  return data;
}

/**
 * A short-lived presigned URL for one document. Deliberately fetched on demand
 * rather than alongside the list: issuing a URL is an audited access to someone
 * else's identity document, so it happens only when an operator asks for it.
 */
export async function getKybDocumentUrl(documentId: string) {
  const { data } = await adminApi.get<{
    url: string;
    expiresAt: string;
    expiresInSeconds: number;
    filename: string;
    contentType: string;
  }>(`/kyb/documents/${documentId}/url`);
  return data;
}

export async function approveTenantKyb(tenantId: string) {
  const { data } = await adminApi.post<{ tenantId: string; status: KybStatus }>(
    `/tenants/${tenantId}/kyb/approve`,
  );
  return data;
}

export async function rejectTenantKyb(tenantId: string, reason: string) {
  const { data } = await adminApi.post<{
    tenantId: string;
    status: KybStatus;
    rejectionReason: string;
  }>(`/tenants/${tenantId}/kyb/reject`, { reason });
  return data;
}

// ─── Tenant billing ───────────────────────────────────────────────────────────

export async function getTenantBilling(id: string) {
  const { data } = await adminApi.get<TenantBilling>(`/tenants/${id}/billing`);
  return data;
}

export async function getTenantLedger(id: string, limit = 50, before?: string) {
  const { data } = await adminApi.get<{ entries: AdminLedgerEntry[]; nextBefore: string | null }>(
    `/tenants/${id}/billing/ledger`,
    { params: { limit, ...(before ? { before } : {}) } },
  );
  return data;
}

/**
 * Money in by hand: a bank transfer that actually arrived, or a refund of our
 * own mistake. `sourceKey` is the idempotency key, so the same bank reference
 * cannot be credited twice however many times the form is submitted.
 */
export async function creditTenant(
  id: string,
  body: { amountNaira: number; reason: string; kind: "ADJUSTMENT" | "REFUND"; sourceKey: string },
) {
  const { data } = await adminApi.post(`/tenants/${id}/billing/credit`, body);
  return data as { entryId: string; balance: string };
}

export async function debitTenant(
  id: string,
  body: { amountNaira: number; reason: string; sourceKey: string },
) {
  const { data } = await adminApi.post(`/tenants/${id}/billing/debit`, body);
  return data as { entryId: string; balance: string };
}

/** Undo an entry by posting its opposite. Nothing is ever edited or deleted. */
export async function reverseLedgerEntry(id: string, body: { entryId: string; reason: string }) {
  const { data } = await adminApi.post(`/tenants/${id}/billing/reverse`, body);
  return data as { entryId: string; balance: string };
}

export async function setBillingBypass(id: string, body: { hours: number; reason: string }) {
  const { data } = await adminApi.post(`/tenants/${id}/billing/bypass`, body);
  return data as { tenantId: string; bypassUntil: string };
}

export async function clearBillingBypass(id: string, reason: string) {
  const { data } = await adminApi.delete(`/tenants/${id}/billing/bypass`, { data: { reason } });
  return data as { tenantId: string };
}

export async function setCreditLimit(id: string, body: { limitNaira: number; reason: string }) {
  const { data } = await adminApi.put(`/tenants/${id}/billing/credit-limit`, body);
  return data as { tenantId: string; creditLimit: string };
}

export async function getContractTerms(id: string) {
  const { data } = await adminApi.get<ContractTermsView>(`/tenants/${id}/billing/terms`);
  return data;
}

export async function putContractTerms(id: string, body: ContractTerms & { reason: string }) {
  const { data } = await adminApi.put(`/tenants/${id}/billing/terms`, body);
  return data as ContractTermsView;
}

export async function endContractTerms(id: string, reason: string) {
  const { data } = await adminApi.delete(`/tenants/${id}/billing/terms`, { data: { reason } });
  return data as { tenantId: string };
}

export async function setTenantInternal(id: string, body: { internal: boolean; reason: string }) {
  const { data } = await adminApi.put(`/tenants/${id}/internal`, body);
  return data as { tenantId: string; internal: boolean };
}

/**
 * Which payment key this workspace uses. 'test' is refused on any workspace
 * that is not flagged internal, by this route and by a database constraint
 * underneath it.
 */
export async function setPaymentsMode(id: string, body: { mode: "live" | "test"; reason: string }) {
  const { data } = await adminApi.put(`/tenants/${id}/billing/payments-mode`, body);
  return data as { tenantId: string; paymentsMode: "live" | "test"; internal: boolean };
}
