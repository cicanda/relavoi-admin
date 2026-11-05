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
  PoolNumbersResponse,
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
  mfa?: {
    enrolled: boolean;
    /** The console sends the operator to the enrolment screen on this. */
    enrolmentRequired: boolean;
    usedRecoveryCode: boolean;
    recoveryCodesRemaining: number;
  };
}

/**
 * Sign in. `totpCode` is the six digit code from an authenticator, or a
 * recovery code.
 *
 * An operator who has not finished enrolling signs in without one and gets a
 * token that can do nothing but enrol. Issuing no token at all would have
 * locked everyone out of the console on the deploy that added the second
 * factor, including whoever has to enrol first.
 */
export async function adminLogin(email: string, password: string, totpCode?: string) {
  const { data } = await adminApi.post<AdminLoginResponse>("/auth/login", {
    email,
    password,
    ...(totpCode ? { totpCode } : {}),
  });
  return data;
}

// ─── Second factor ────────────────────────────────────────────────────────────

export interface MfaStatus {
  enrolled: boolean;
  enrolledAt: string | null;
  enrolmentStarted: boolean;
  recoveryCodesRemaining: number;
  lockoutThreshold: number;
}

export async function getMfaStatus() {
  const { data } = await adminApi.get<MfaStatus>("/auth/mfa");
  return data;
}

export interface TotpEnrolmentOffer {
  otpauthUri: string;
  /** base32, for typing into an app by hand. */
  secret: string;
  digits: number;
  periodSeconds: number;
  algorithm: string;
}

export async function startTotpEnrolment() {
  const { data } = await adminApi.post<TotpEnrolmentOffer>("/auth/totp/enroll");
  return data;
}

export interface TotpConfirmResult {
  enrolled: boolean;
  /** Shown once. They are stored hashed and cannot be shown again. */
  recoveryCodes: string[];
}

export async function confirmTotpEnrolment(code: string) {
  const { data } = await adminApi.post<TotpConfirmResult>("/auth/totp/confirm", { code });
  return data;
}

export async function resetOperatorMfa(operatorId: string) {
  const { data } = await adminApi.post<{ id: string; enrolled: boolean }>(
    `/operators/${operatorId}/mfa/reset`,
  );
  return data;
}

// ─── Tenants ──────────────────────────────────────────────────────────────────
export async function listTenants(params: {
  q?: string;
  tier?: Tier;
  status?: string;
  /**
   * `all` (the default) lists ours alongside the customers, `exclude` leaves
   * ours out, `only` keeps nothing else. The default is deliberate: this
   * console is the complete inventory of what exists.
   */
  internal?: "all" | "exclude" | "only";
  limit?: number;
  after?: string;
} = {}) {
  const { data } = await adminApi.get<PaginatedResponse<Tenant>>("/tenants", { params });
  return data;
}

/**
 * The 30 day usage summary the endpoint has always returned under
 * `usageLast30d`, typed so the review page can read it. It was declared as
 * `usage?: unknown` and the page printed "Not set" four times beside the words
 * "Usage details endpoint coming soon".
 */
export interface TenantUsageLast30d {
  periodStart: string;
  periodEnd: string;
  metrics: Partial<Record<
    "session_created" | "call_minute" | "sms_sent" | "sms_received" | "recording_minute" | "number_rental",
    number
  >>;
  totalEvents: number;
}

export async function getTenant(id: string) {
  const { data } = await adminApi.get<
    Tenant & { usageLast30d?: TenantUsageLast30d | null; userCount?: number }
  >(`/tenants/${id}`);
  return data;
}

/**
 * The industry and country lists, from the tenant-facing `GET /v1/reference`.
 *
 * Not on adminApi, whose base URL is the `/v1/admin` namespace, and not a copy
 * held in the console: the API validates industry and country against the same
 * constant that answers this call, so a list typed in here would eventually
 * offer an operator a value the server refuses. Unauthenticated and cacheable
 * for a day, so there is nothing to carry a token for.
 */
const REFERENCE_URL = `${BASE.replace(/\/admin\/?$/, "")}/reference`;

export interface ReferenceLists {
  industries: Array<{ code: string; label: string }>;
  countries: Array<{ code: string; name: string }>;
}

export async function getReferenceLists() {
  const { data } = await axios.get<ReferenceLists>(REFERENCE_URL, { timeout: 15_000 });
  return data;
}

/**
 * Correct a workspace's industry or registered country. SRE or ROOT, reasoned
 * and audited, because the alternative an operator reaches for is an UPDATE by
 * hand. Send only the field being changed; the other is left alone.
 */
export async function updateTenantProfile(
  id: string,
  patch: { industry?: string | null; country?: string | null; reason: string },
) {
  const { data } = await adminApi.patch<{
    id: string;
    industry: string | null;
    country: string | null;
  }>(`/tenants/${id}/profile`, patch);
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
  /** See listTenants. `all` is the default, so a listing stays complete. */
  internal?: "all" | "exclude" | "only";
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

/**
 * Which workspace is holding which numbers.
 *
 * The pool is shared and `proxy_numbers` has no tenant column, so until the
 * quota work nothing anywhere could answer "who is using these", which is the
 * first question when the pool runs hot. Read from the live Redis footprints,
 * which is what the allocator enforces the per-plan cap against, so this and
 * the enforcement cannot disagree.
 */
export interface NumberHolding {
  tenantId: string;
  workspace: string;
  tier: string;
  held: number;
  numbers: string[];
  quota: number;
}

/** A workspace asking to hold more numbers at once. */
export interface NumberQuotaRequest {
  id: string;
  tenantId: string;
  workspace: string;
  tier: string;
  status: "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";
  /** A total, not an increment. */
  requestedTotal: number;
  quotaAtRequest: number;
  region: string;
  note: string | null;
  createdAt: string;
  grantedTotal: number | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface FleetSummary {
  pools?: PoolStatus[];
  numbers?: ProxyNumber[];
  byRegion?: FleetRegion[];
  holdings?: NumberHolding[];
  pendingNumberRequests?: NumberQuotaRequest[];
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

export async function listNumberRequests() {
  const { data } = await adminApi.get<{ requests: NumberQuotaRequest[] }>("/numbers/requests");
  return data.requests ?? [];
}

export async function listNumberHoldings() {
  const { data } = await adminApi.get<{ holdings: NumberHolding[] }>("/numbers/holdings");
  return data.holdings ?? [];
}

/**
 * Approve an ask. `grantedTotal` defaults to what was asked for; a lower
 * figure is a part-approval. The note is sent to the workspace verbatim, so
 * the backend refuses one carrying a phone number or a supplier's name.
 *
 * Approving writes a plan override, which is what raises the cap. It applies
 * to the next session the workspace creates: nothing to deploy.
 */
export async function approveNumberRequest(
  id: string,
  args: { grantedTotal?: number; note?: string },
) {
  const { data } = await adminApi.post<NumberQuotaRequest>(
    `/numbers/requests/${id}/approve`,
    args,
  );
  return data;
}

/** Decline an ask. The note is required: it is the answer, and it is emailed. */
export async function declineNumberRequest(id: string, note: string) {
  const { data } = await adminApi.post<NumberQuotaRequest>(`/numbers/requests/${id}/decline`, {
    note,
  });
  return data;
}

// Quarantine / release: backend exposes these as POST /admin/pool/{quarantine,release}
// with the number in the request body.
export async function quarantineNumber(num: string, reason: string) {
  const { data } = await adminApi.post("/pool/quarantine", { number: num, reason });
  return data;
}

export async function releaseNumber(num: string, reason?: string) {
  const { data } = await adminApi.post("/pool/release", { number: num, reason });
  return data;
}

// ─── Registering a number we already own ──────────────────────────────────────
//
// Kay buys the DID from the carrier and sets its two voice fields by hand.
// None of this buys a number: it registers one, proves it reaches us, and only
// then lets it carry a call. Backend contract 4.

export async function listPoolNumbers(): Promise<PoolNumbersResponse> {
  const { data } = await adminApi.get<PoolNumbersResponse>("/pool/numbers");
  return data;
}

export async function registerNumber(args: {
  number: string;
  countryCode: string;
  reason: string;
}) {
  const { data } = await adminApi.post("/pool/numbers/register", args);
  return data;
}

/**
 * Opens the verification window. Proves nothing by itself: the operator then
 * dials the number, and it is verified only once both the inbound callback and
 * the terminal event have arrived.
 */
export async function startNumberVerification(num: string, reason: string) {
  const { data } = await adminApi.post<{ deadlineAt: string; instruction: string }>(
    "/pool/numbers/verify",
    { number: num, reason },
  );
  return data;
}

export async function admitNumber(num: string, reason: string) {
  const { data } = await adminApi.post("/pool/numbers/admit", { number: num, reason });
  return data;
}

export async function retireNumber(num: string, reason: string) {
  const { data } = await adminApi.post("/pool/numbers/retire", { number: num, reason });
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

/**
 * What our own webhook sink received.
 *
 * The internal workspace's webhook pointed at a path on the marketing site for
 * as long as it has existed: 19 deliveries, all 404, none ever accepted. This
 * is the other end of the loop, so a delivery can be seen leaving the platform
 * and arriving signed.
 */
export interface InternalWebhookDelivery {
  id: string;
  event: string | null;
  deliveryId: string | null;
  signatureValid: boolean;
  signatureDetail: string | null;
  workspaceName: string | null;
  tenantId: string | null;
  payload: Record<string, unknown>;
  sentAt: string | null;
  receivedAt: string;
  latencyMs: number | null;
}

export async function listInternalWebhooks(limit = 50) {
  const { data } = await adminApi.get<{
    data: InternalWebhookDelivery[];
    total: number;
    verified: number;
    retentionDays: number;
    configured: boolean;
  }>("/webhooks/internal", { params: { limit } });
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

// ─── Overview (synthetic from existing endpoints) ─────────────────────────────
//
// The spec calls for GET /admin/overview returning a "platform stats with
// infrastructure block" — the backend doesn't expose that as a single endpoint
// yet, so we hit system/health for infra + tenants/sessions for counts and
// derive the rest client-side. Pages can call this once and surface skeletons
// for any sub-section that fails.
export interface AdminOverview {
  infra: SystemHealth;
  /** Customer sessions. Our own workspaces are not counted. */
  activeSessions: number;
  /** Customer workspaces. Our own are not counted. */
  tenantsCount: number;
  /** How many of ours were left out of each figure above. */
  internalTenants: number;
  internalActiveSessions: number;
  dlqDepth: number;
  poolUtilization: number;
}

export async function getOverview(): Promise<AdminOverview> {
  const [infra, tenants, activeSess, fleet] = await Promise.allSettled([
    getSystemHealth(),
    listTenants({ limit: 1, internal: "exclude" }),
    listAdminSessions({ state: "ACTIVE", limit: 1, internal: "exclude" }),
    getFleet(),
  ]);

  const infraVal = infra.status === "fulfilled" ? infra.value : {};

  // `counts.customer` first, then `pagination.total`, and `count` last.
  //
  // These were reading `pagination.count`, which is the length of the page
  // that was asked for. Both requests ask for one row, so both figures were
  // 1 whatever the platform held. The fallbacks are ordered newest first so a
  // backend below contract version 2 degrades to the old wrong-but-present
  // number rather than to nothing, which is what the gate in
  // scripts/vercel-ignore-build.mjs is there to make a short window.
  const tenantsCount =
    tenants.status === "fulfilled"
      ? (tenants.value.counts?.customer ??
         tenants.value.pagination?.total ??
         tenants.value.pagination?.count ??
         tenants.value.data?.length ??
         0)
      : 0;
  const internalTenants =
    tenants.status === "fulfilled" ? (tenants.value.counts?.internal ?? 0) : 0;
  const activeSessions =
    activeSess.status === "fulfilled"
      ? (activeSess.value.counts?.customer ??
         activeSess.value.pagination?.total ??
         activeSess.value.pagination?.count ??
         activeSess.value.data?.length ??
         0)
      : 0;
  const internalActiveSessions =
    activeSess.status === "fulfilled" ? (activeSess.value.counts?.internal ?? 0) : 0;

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
    internalTenants,
    internalActiveSessions,
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
  // The date printed on the document, YYYY-MM-DD, as distinct from the day it
  // was uploaded. Null for a kind that carries no date, and for anything filed
  // before the backend recorded one.
  issuedOn?: string | null;
  issueDateRequired?: boolean;
  // Computed by the backend, so this console and the tenant dashboard cannot
  // disagree about whether a document still counts.
  expired?: boolean;
}

/** A filed document that is too old, or too undated, to count. */
export interface KybExpiredDocument {
  id: string;
  kind: KybDocumentKind;
  issuedOn: string | null;
  reason: string;
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
    socialLinks: string[];
  };
  documents: KybDocument[];
  missingKinds: KybDocumentKind[];
  missingDetails: string[];
  // Documents that are filed but out of date. Optional: an admin deploy can
  // briefly run against a backend that predates the field.
  expiredDocuments?: KybExpiredDocument[];
  proofOfAddressMaxAgeMonths?: number;
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
// One document per request, by id: the backend never serves the storage key,
// so there is nothing here to cache or share beyond the short-lived URL it
// hands back.
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
