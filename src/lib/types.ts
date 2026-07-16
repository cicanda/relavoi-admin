// Shared types for the Relavoi operator console. Matches the camelCase shapes
// emitted by the relavoi-backend admin routes. Most fields are optional so the
// console renders gracefully if a particular column is missing.

export type Tier = "STARTER" | "GROWTH" | "ENTERPRISE";
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
