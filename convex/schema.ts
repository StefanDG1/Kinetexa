import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { exportPosition } from "./exportModel";
import { operationKind, operationMeasures } from "./operationModel";
import { productEvent } from "./telemetryModel";

export default defineSchema({
  productEvents: defineTable({
    athleteId: v.id("athletes"),
    event: productEvent,
    at: v.number(),
    uuid: v.string(),
    consentRevision: v.number(),
    status: v.string(),
    attempts: v.number(),
  })
    .index("by_athlete", ["athleteId", "at"])
    .index("by_athlete_event", ["athleteId", "event"])
    .index("by_status", ["status", "at"])
    .index("by_at", ["at"]),
  operationalStatus: defineTable({
    key: v.string(),
    at: v.number(),
    metrics: v.any(),
    alerts: v.array(v.string()),
  }).index("by_key", ["key"]),
  operationalEvents: defineTable({
    athleteId: v.optional(v.id("athletes")),
    kind: operationKind,
    service: v.optional(v.union(v.literal("stripe"), v.literal("resend"))),
    jobId: v.string(),
    outcome: v.string(),
    startedAt: v.optional(v.number()),
    at: v.number(),
    attempt: v.optional(v.number()),
    measures: v.optional(operationMeasures),
    key: v.string(),
    traceId: v.string(),
    spanId: v.string(),
  })
    .index("by_athlete", ["athleteId"])
    .index("by_key", ["key"])
    .index("by_job", ["jobId"])
    .index("by_at", ["at"]),
  athletes: defineTable({
    tokenIdentifier: v.string(),
    workosUserId: v.string(),
    displayName: v.string(),
    timezone: v.string(),
    units: v.union(v.literal("metric"), v.literal("imperial")),
    aiConsent: v.boolean(),
    aiConsentRevision: v.optional(v.number()),
    healthProcessing: v.optional(v.boolean()),
    healthProcessingRevision: v.optional(v.number()),
    emailSuppressed: v.optional(v.string()),
    analyticsConsent: v.boolean(),
    analyticsConsentRevision: v.optional(v.number()),
    productMilestones: v.optional(v.array(productEvent)),
    telemetryTransmitted: v.optional(v.boolean()),
    telemetryDistinctId: v.optional(v.string()),
    telemetryDeletionRequested: v.optional(v.boolean()),
    telemetryDeletionVerified: v.optional(v.boolean()),
    consentUpdatedAt: v.number(),
    onboarded: v.boolean(),
    status: v.union(v.literal("active"), v.literal("deleting")),
    createdAt: v.number(),
    thresholds: v.optional(v.any()),
    dashboard: v.optional(v.array(v.string())),
    hiddenWidgets: v.optional(v.array(v.string())),
    insightConsent: v.optional(v.boolean()),
    factsReady: v.optional(v.boolean()),
    factsCursor: v.optional(v.string()),
  })
    .index("by_identity", ["tokenIdentifier"])
    .index("by_workos_user", ["workosUserId"]),
  auditEvents: defineTable({
    athleteId: v.id("athletes"),
    action: v.string(),
    at: v.number(),
  }).index("by_athlete", ["athleteId", "at"]),
  activities: defineTable({
    athleteId: v.id("athletes"),
    title: v.string(),
    sport: v.string(),
    start: v.number(),
    duration: v.number(),
    distance: v.optional(v.number()),
    summary: v.any(),
    metrics: v.any(),
    route: v.array(v.array(v.number())),
    routeSegments: v.optional(v.array(v.array(v.array(v.number())))),
    streamKey: v.string(),
    sourceId: v.id("sources"),
    notes: v.string(),
    tags: v.array(v.string()),
    gearIds: v.array(v.id("gear")),
    excludedRecords: v.boolean(),
    version: v.string(),
    createdAt: v.number(),
    duplicateOf: v.optional(v.id("activities")),
    mergedInto: v.optional(v.id("activities")),
  })
    .index("by_athlete", ["athleteId", "start"])
    .index("by_athlete_created", ["athleteId", "mergedInto", "createdAt"])
    .index("by_merged", ["mergedInto"]),
  activityFacts: defineTable({
    athleteId: v.id("athletes"),
    activityId: v.id("activities"),
    start: v.number(),
    data: v.any(),
  })
    .index("by_athlete", ["athleteId", "start"])
    .index("by_activity", ["activityId"]),
  sources: defineTable({
    athleteId: v.id("athletes"),
    name: v.string(),
    key: v.string(),
    uploadKey: v.optional(v.string()),
    uploadCleanupAt: v.optional(v.number()),
    hash: v.optional(v.string()),
    bytes: v.number(),
    status: v.string(),
    error: v.optional(v.string()),
    attempts: v.number(),
    createdAt: v.number(),
    activityId: v.optional(v.id("activities")),
    parentId: v.optional(v.id("sources")),
    partIndex: v.optional(v.number()),
    ownsHealth: v.optional(v.boolean()),
    splitCount: v.optional(v.number()),
    parserVersion: v.optional(v.string()),
    healthGeneration: v.optional(v.number()),
    reprocessStatus: v.optional(v.string()),
    reprocessAttempt: v.optional(v.number()),
    reprocessStartedAt: v.optional(v.number()),
    reprocessQueuedAt: v.optional(v.number()),
    queuedAt: v.optional(v.number()),
    reprocessRetries: v.optional(v.number()),
    reprocessError: v.optional(v.string()),
    reprocessedAt: v.optional(v.number()),
    childIds: v.optional(v.array(v.id("sources"))),
    completedChildren: v.optional(v.number()),
    failedChildren: v.optional(v.number()),
    archiveScan: v.optional(
      v.object({
        cursor: v.string(),
        completed: v.number(),
        failed: v.number(),
        seen: v.number(),
      }),
    ),
    importMetadata: v.optional(v.any()),
    receivedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    format: v.optional(v.string()),
    mime: v.optional(v.string()),
    externalAi: v.optional(
      v.union(v.literal("allowed"), v.literal("blocked"), v.literal("unknown")),
    ),
    aiPolicyVersion: v.optional(v.string()),
  })
    .index("by_athlete", ["athleteId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_upload_cleanup", ["uploadCleanupAt"])
    .index("by_reprocess_status", ["reprocessStatus", "createdAt"])
    .index("by_hash", ["athleteId", "hash"])
    .index("by_parent", ["parentId", "name", "hash"])
    .index("by_activity", ["activityId"]),
  metricHistory: defineTable({
    athleteId: v.id("athletes"),
    activityId: v.id("activities"),
    metrics: v.any(),
    at: v.number(),
    version: v.optional(v.string()),
    summary: v.optional(v.any()),
    streamKey: v.optional(v.string()),
  })
    .index("by_athlete", ["athleteId"])
    .index("by_activity", ["activityId", "at"]),
  gear: defineTable({
    athleteId: v.id("athletes"),
    name: v.string(),
    kind: v.string(),
    retired: v.boolean(),
    maintenanceKm: v.optional(v.number()),
    maintenanceHours: v.optional(v.number()),
    servicedAt: v.number(),
  }).index("by_athlete", ["athleteId"]),
  gearReminders: defineTable({
    athleteId: v.id("athletes"),
    gearId: v.id("gear"),
    title: v.string(),
    distanceKm: v.optional(v.number()),
    durationHours: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    servicedAt: v.number(),
    disabled: v.boolean(),
    createdAt: v.number(),
  }).index("by_athlete", ["athleteId"]),
  gearServices: defineTable({
    athleteId: v.id("athletes"),
    gearId: v.id("gear"),
    reminderId: v.id("gearReminders"),
    at: v.number(),
    note: v.string(),
  })
    .index("by_athlete", ["athleteId", "at"])
    .index("by_reminder_at", ["reminderId", "at"]),
  goals: defineTable({
    athleteId: v.id("athletes"),
    title: v.string(),
    kind: v.string(),
    target: v.number(),
    start: v.number(),
    end: v.number(),
    manualProgress: v.optional(v.number()),
  }).index("by_athlete", ["athleteId"]),
  plans: defineTable({
    athleteId: v.id("athletes"),
    title: v.string(),
    sport: v.string(),
    start: v.number(),
    duration: v.number(),
    description: v.string(),
    intensity: v.optional(v.string()),
  }).index("by_athlete", ["athleteId", "start"]),
  analyses: defineTable({
    athleteId: v.id("athletes"),
    name: v.string(),
    query: v.any(),
    pinned: v.boolean(),
  }).index("by_athlete", ["athleteId"]),
  privacyZones: defineTable({
    athleteId: v.id("athletes"),
    name: v.string(),
    lat: v.number(),
    lon: v.number(),
    radius: v.number(),
  }).index("by_athlete", ["athleteId"]),
  shares: defineTable({
    athleteId: v.id("athletes"),
    token: v.string(),
    kind: v.string(),
    activityIds: v.array(v.id("activities")),
    fields: v.array(v.string()),
    expires: v.optional(v.number()),
    revoked: v.boolean(),
    createdAt: v.number(),
    viewWindow: v.optional(v.number()),
    viewCount: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_athlete", ["athleteId"]),
  health: defineTable({
    athleteId: v.id("athletes"),
    date: v.string(),
    kind: v.string(),
    value: v.number(),
    source: v.string(),
    sourceId: v.optional(v.id("sources")),
    at: v.optional(v.number()),
    unit: v.optional(v.string()),
    generation: v.optional(v.number()),
  })
    .index("by_athlete", ["athleteId", "date"])
    .index("by_kind", ["athleteId", "kind", "date"])
    .index("by_source", ["sourceId", "date", "kind"]),
  billing: defineTable({
    athleteId: v.id("athletes"),
    customerId: v.string(),
    subscriptionId: v.optional(v.string()),
    status: v.string(),
    periodEnd: v.optional(v.number()),
    refreshRevision: v.optional(v.number()),
    appliedRefreshRevision: v.optional(v.number()),
    checkout: v.optional(
      v.object({
        key: v.string(),
        interval: v.union(v.literal("monthly"), v.literal("annual")),
        price: v.string(),
        appUrl: v.string(),
        expiresAt: v.number(),
        sessionId: v.optional(v.string()),
      }),
    ),
    updatedAt: v.number(),
  })
    .index("by_athlete", ["athleteId"])
    .index("by_customer", ["customerId"]),
  webhookEvents: defineTable({ eventId: v.string(), at: v.number() }).index(
    "by_event",
    ["eventId"],
  ),
  outbox: defineTable({
    athleteId: v.id("athletes"),
    template: v.string(),
    dedupeKey: v.string(),
    status: v.string(),
    providerId: v.optional(v.string()),
    attempts: v.number(),
    createdAt: v.number(),
    firstAttemptAt: v.optional(v.number()),
    deliveryAt: v.optional(v.number()),
    payload: v.optional(
      v.object({
        from: v.string(),
        to: v.string(),
        subject: v.string(),
        text: v.string(),
      }),
    ),
  })
    .index("by_athlete", ["athleteId"])
    .index("by_key", ["dedupeKey"])
    .index("by_template_created", ["template", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_provider", ["providerId"]),
  emailEvents: defineTable({
    athleteId: v.optional(v.id("athletes")),
    providerId: v.string(),
    eventId: v.string(),
    template: v.optional(v.string()),
    status: v.string(),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_provider", ["providerId"])
    .index("by_athlete", ["athleteId"])
    .index("by_created", ["createdAt"]),
  systemCounters: defineTable({ key: v.string(), count: v.number() }).index(
    "by_key",
    ["key"],
  ),
  usage: defineTable({
    athleteId: v.id("athletes"),
    kind: v.string(),
    window: v.string(),
    count: v.number(),
  }).index("by_athlete", ["athleteId", "kind", "window"]),
  revokedSessions: defineTable({
    athleteId: v.optional(v.id("athletes")),
    workosUserId: v.optional(v.string()),
    sessionHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionHash"])
    .index("by_workos_user", ["workosUserId"])
    .index("by_athlete", ["athleteId"]),
  messages: defineTable({
    athleteId: v.id("athletes"),
    role: v.string(),
    content: v.string(),
    evidence: v.optional(v.any()),
    at: v.number(),
    runId: v.optional(v.id("aiRuns")),
    feedback: v.optional(v.object({ helpful: v.boolean(), at: v.number() })),
  }).index("by_athlete", ["athleteId", "at"]),
  aiRuns: defineTable({
    athleteId: v.id("athletes"),
    revision: v.number(),
    purpose: v.union(v.literal("ask"), v.literal("insight")),
    status: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    contextBytes: v.number(),
    toolCalls: v.number(),
    tools: v.optional(v.array(v.string())),
    modelCalls: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costMicrousd: v.optional(v.number()),
    model: v.optional(v.string()),
    costSource: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
  }).index("by_athlete", ["athleteId", "startedAt"]),
  insights: defineTable({
    athleteId: v.id("athletes"),
    fingerprint: v.string(),
    content: v.string(),
    evidence: v.any(),
    dismissed: v.boolean(),
    at: v.number(),
  })
    .index("by_athlete", ["athleteId", "at"])
    .index("by_fingerprint", ["athleteId", "fingerprint"]),
  lifecycleJobs: defineTable({
    athleteId: v.id("athletes"),
    kind: v.string(),
    status: v.string(),
    key: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    lease: v.optional(v.number()),
    attempts: v.optional(v.number()),
    position: v.optional(exportPosition),
    partCount: v.optional(v.number()),
    notificationId: v.optional(v.id("outbox")),
    expiresAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_athlete", ["athleteId"])
    .index("by_created", ["createdAt"])
    .index("by_status", ["status", "createdAt"]),
  exportParts: defineTable({
    athleteId: v.id("athletes"),
    jobId: v.id("lifecycleJobs"),
    index: v.number(),
    key: v.string(),
    bytes: v.number(),
    sha256: v.string(),
    createdAt: v.number(),
  })
    .index("by_athlete", ["athleteId"])
    .index("by_job", ["jobId", "index"]),
});
