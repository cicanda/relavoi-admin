// Shared types for the Relavoi operator console. Matches the camelCase shapes
// emitted by the relavoi-backend admin routes. Most fields are optional so the
// console renders gracefully if a particular column is missing.

export type Tier = "STARTER" | "GROWTH" | "SCALE" | "ENTERPRISE";
export type OperatorRole = "ROOT" | "SRE" | "SUPPORT" | "VIEWER";
export type SessionState =
  | "PENDING"
  | "ACTIVE"
  | "GRACE_PERIOD"
  | "EXPIRED"
  | "FAILED";

export interface Operator {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Tenant {
  id: string;
  name: string;
  tier: Tier;
  billingEmail?: string;
  status?: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  workspaceSlug?: string;
  country?: string;
  industry?: string;
  webhookUrl?: string | null;
  supportPhone?: string | null;
  recordingEnabled?: boolean;
  recordingConsentMode?: "DEFAULT" | "CUSTOM" | "NONE";
  recordingConsentAudioUrl?: string | null;
  expiredCallBehavior?: "DEAD_LINE" | "REDIRECT_SUPPORT" | "PLAY_MESSAGE";
  defaultGracePeriod?: number;
  defaultSessionTtlMin?: number;
  cooldownMin?: number;
  pushEnabled?: boolean;
  pushTitleTemplate?: string;
  pushBodyTemplate?: string;
  smsAutoReplyOnExpired?: boolean;
  requestedPoolSize?: number;
  onboardingMetadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Session {
  id: string;
  tenantId: string;
  tenantName?: string;
  proxyNumber: string;
  state: SessionState;
  directionMode?: "BIDIRECTIONAL" | "A_TO_B_ONLY" | "B_TO_A_ONLY";
  callCount?: number;
  expiresAt?: string;
  createdAt?: string;
  endedAt?: string | null;
}

export interface ProxyNumber {
  number: string;
  region?: string | null;
  provider: "AFRICASTALKING" | "TWILIO" | "PLIVO";
  status: "AVAILABLE" | "IN_USE" | "COOLDOWN" | "QUARANTINED";
  lastUsedAt?: string | null;
  cooldownUntil?: string | null;
  healthCheckAt?: string | null;
  provisionedAt?: string;
}

export interface PoolStatus {
  region: string;
  provider: string;
  total: number;
  available: number;
  inUse: number;
  cooldown: number;
  quarantined?: number;
}

export interface DlqEntry {
  id: string;
  eventId: string;
  provider: string;
  payload?: Record<string, unknown>;
  errorMessage?: string | null;
  retryCount?: number;
  maxRetries?: number;
  status: "PENDING" | "RETRYING" | "RESOLVED" | "ABANDONED";
  firstReceivedAt?: string;
  lastRetryAt?: string | null;
  resolvedAt?: string | null;
}

export interface CircuitBreakerStatus {
  provider: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  openedAt?: string | null;
  lastError?: string | null;
  failureCount?: number;
}

export interface AuditEntry {
  id: string;
  actorType: "operator" | "tenant" | "system";
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  createdAt: string;
}

export interface PricingRow {
  id: string;
  tier: Tier;
  metric: string;
  unitPrice: number;
  includedQuantity: number;
  overagePrice?: number | null;
  currency: string;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination?: { count: number; after?: string | null };
}

export interface SystemHealth {
  status?: "healthy" | "degraded";
  checks?: {
    postgres?: "ok" | "down";
    redis?: "ok" | "down";
  };
  circuitBreakers?: CircuitBreakerStatus[];
  dlqDepth?: number;
  timestamp?: string;
}

// ─── Tenant billing (operator view) ───────────────────────────────────────────

/**
 * Amounts here are naira decimal strings ("12500.00"), the shape the operator
 * routes already speak. The console prints them and never computes with them:
 * the ledger is the record of what was charged, and a figure recomputed in a
 * browser will eventually disagree with it.
 */
export interface TenantBilling {
  tenantId: string;
  name: string;
  tier: Tier;
  mode: "sandbox" | "live";
  balance: string;
  creditLimit: string;
  blocked: boolean;
  bypassUntil: string | null;
  graceUntil: string | null;
  plan: {
    tier: Tier;
    monthly: string;
    includedMinutes: number;
    overagePerMinute: string;
    /** True when a contract is laying terms over the tier's plan. */
    overridden: boolean;
  } | null;
  period: {
    id: string;
    start: string;
    end: string;
    includedMinutesUsed: number;
    overageMinutes: number;
  } | null;
}

export type AdminLedgerType =
  | "TOPUP"
  | "FEE"
  | "SUBSCRIPTION"
  | "USAGE"
  | "ADJUSTMENT"
  | "REFUND"
  | "REVERSAL";

export interface AdminLedgerEntry {
  id: string;
  type: AdminLedgerType;
  amount: string;
  balanceAfter: string;
  sourceKey: string;
  billingPeriodId: string | null;
  operatorId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Every term is optional; an omitted one keeps following the plan. */
export interface ContractTerms {
  monthlyNaira?: number;
  includedMinutes?: number;
  overageNairaPerMinute?: number;
  maxConcurrentPerPerson?: number;
  maxConcurrentSessions?: number;
  maxApiReqPerMin?: number;
  effectiveFrom?: string;
}

export interface ContractTermsView {
  tenantId: string;
  tier: Tier;
  /** The terms that actually apply: the tier's plan with any contract over it. */
  effective: {
    monthly: string;
    includedMinutes: number;
    overagePerMinute: string;
    maxConcurrentPerPerson: number;
    maxConcurrentSessions: number;
    maxApiReqPerMin: number;
  } | null;
  overridden: boolean;
  /** The open contract window. Null in any field means "follow the plan". */
  current: {
    id: string;
    monthly: string | null;
    includedMinutes: number | null;
    overagePerMinute: string | null;
    maxConcurrentPerPerson: number | null;
    maxConcurrentSessions: number | null;
    maxApiReqPerMin: number | null;
    effectiveFrom: string;
    effectiveUntil: string | null;
    reason: string;
    operatorId: string | null;
  } | null;
  history: Array<{
    id: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
    reason: string;
    operatorId: string | null;
    createdAt: string;
  }>;
}
