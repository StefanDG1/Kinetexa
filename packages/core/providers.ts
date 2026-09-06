/** Server-only adapter contract. Credentials must never appear in capability responses. */
export type ProviderId =
  "garmin" | "strava" | "polar" | "wahoo" | "coros" | "suunto";
export type ProviderCapability =
  | "authorization"
  | "refreshAuthorization"
  | "revocation"
  | "profile"
  | "backfill"
  | "activities"
  | "activityDetail"
  | "rawActivityFile"
  | "healthSignals"
  | "webhooks"
  | "reconciliation";
export type Capability = {
  state: "available" | "unavailable" | "unverified";
  limitation?: string;
};
export type RateLimitState = {
  windows: { limit: number; used: number; resetsAt: number }[];
  retryAt?: number;
  observedAt: number;
};
export type ProviderPage<T> = { items: T[]; cursor: string | null };
export type ProviderActivity = {
  id: string;
  updatedAt?: number;
  deleted?: boolean;
};
export type ProviderAuthorization = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  providerUserId: string;
};
export type ProviderContext = {
  authorization: ProviderAuthorization;
  signal: AbortSignal;
};
export interface ProviderAdapter {
  id: ProviderId;
  getCapabilities(): Record<ProviderCapability, Capability>;
  getRateLimitState(): RateLimitState | null;
  authorize?(args: { state: string; redirectUri: string }): Promise<string>;
  exchangeAuthorization?(args: {
    code: string;
    redirectUri: string;
    signal: AbortSignal;
  }): Promise<ProviderAuthorization>;
  refreshAuthorization?(
    context: ProviderContext,
  ): Promise<ProviderAuthorization>;
  revoke?(context: ProviderContext): Promise<void>;
  fetchProfile?(context: ProviderContext): Promise<{ id: string }>;
  requestBackfill?(
    context: ProviderContext,
    args: { from?: number; to: number; cursor: string | null },
  ): Promise<ProviderPage<ProviderActivity>>;
  fetchActivities?(
    context: ProviderContext,
    cursor: string | null,
  ): Promise<ProviderPage<ProviderActivity>>;
  fetchActivityDetail?(context: ProviderContext, id: string): Promise<unknown>;
  fetchRawActivityFile?(
    context: ProviderContext,
    id: string,
  ): Promise<{ format: "fit" | "tcx" | "gpx"; bytes: Uint8Array }>;
  fetchHealthSignals?(
    context: ProviderContext,
    cursor: string | null,
  ): Promise<ProviderPage<unknown>>;
  handleWebhook?(args: { body: Uint8Array; headers: Headers }): Promise<{
    eventId: string;
    providerUserId: string;
    activityIds: string[];
  }>;
  reconcile?(
    context: ProviderContext,
    cursor: string | null,
  ): Promise<ProviderPage<ProviderActivity>>;
}

const methods: Record<ProviderCapability, keyof ProviderAdapter> = {
  authorization: "authorize",
  refreshAuthorization: "refreshAuthorization",
  revocation: "revoke",
  profile: "fetchProfile",
  backfill: "requestBackfill",
  activities: "fetchActivities",
  activityDetail: "fetchActivityDetail",
  rawActivityFile: "fetchRawActivityFile",
  healthSignals: "fetchHealthSignals",
  webhooks: "handleWebhook",
  reconciliation: "reconcile",
};
export function validateProviderAdapter(adapter: ProviderAdapter) {
  for (const [capability, method] of Object.entries(methods)) {
    if (
      adapter.getCapabilities()[capability as ProviderCapability].state ===
        "available" &&
      typeof adapter[method] !== "function"
    )
      throw new Error(`Missing implementation for ${capability}.`);
  }
  if (
    adapter.getCapabilities().authorization.state === "available" &&
    !adapter.exchangeAuthorization
  )
    throw new Error("Missing authorization exchange.");
}

export type ProviderAvailability = {
  id: ProviderId;
  name: string;
  state: "approval-pending" | "terms-blocked" | "assessment-pending";
  reason: string;
  capabilities: Record<ProviderCapability, Capability>;
  externalAi: "blocked";
  policyVersion: string;
};
const unavailable = () =>
  Object.fromEntries(
    Object.keys(methods).map((key) => [key, { state: "unverified" }]),
  ) as Record<ProviderCapability, Capability>;
export const providerCatalog: ProviderAvailability[] = [
  {
    id: "garmin",
    name: "Garmin",
    state: "approval-pending",
    reason:
      "Garmin developer approval is pending. Import exported files in the meantime.",
  },
  {
    id: "strava",
    name: "Strava",
    state: "terms-blocked",
    reason:
      "Direct API sync requires permission under the current competing-app restrictions. Strava bulk ZIP import is available.",
  },
  {
    id: "polar",
    name: "Polar",
    state: "terms-blocked",
    reason:
      "Polar's competing-service and API data retention terms require review and permission for Kinetexa.",
  },
  {
    id: "wahoo",
    name: "Wahoo",
    state: "assessment-pending",
    reason: "API access, terms and supported data have not been verified.",
  },
  {
    id: "coros",
    name: "COROS",
    state: "assessment-pending",
    reason: "API access, terms and supported data have not been verified.",
  },
  {
    id: "suunto",
    name: "Suunto",
    state: "assessment-pending",
    reason: "API access, terms and supported data have not been verified.",
  },
].map((row) => ({
  ...row,
  capabilities: unavailable(),
  externalAi: "blocked",
  policyVersion: "provider-review-2026-09-06",
})) as ProviderAvailability[];

/** Current approval decisions deliberately cannot be overridden with an environment flag. */
export function requireProviderAvailable(id: ProviderId): never {
  const provider = providerCatalog.find((row) => row.id === id);
  throw new Error(provider?.reason ?? "Provider unavailable.");
}
