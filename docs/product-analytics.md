# Consented product analytics

Product telemetry is off by default. `analyticsConsent` is independent of AI and health processing consent. The backend accepts only the event names below, never arbitrary event properties, URLs, prompts, filenames, health values, geometry or credentials. Product events are private, athlete-owned records included in account export and deletion. Local records expire after 90 days. A bounded milestone list prevents a first-observed event from being emitted again after retention cleanup.

## Taxonomy version 1

Server events: `account_created`, `onboarding_completed`, `provider_connect_started`, `provider_connected`, `import_started`, `import_completed`, `first_activity_processed`, `premium_checkout_started`, `premium_activated`, `analysis_query_run`, `analysis_saved`, `goal_created`, `calendar_workout_planned`, `gear_maintenance_created`, `share_created`, `share_revoked`, `ai_question_asked`.

Authenticated frontend events: `dashboard_viewed`, `activity_viewed`, `map_viewed`, `date_range_changed`, `metric_explanation_opened`, `map_filter_applied`, `ai_insight_opened`. Send these through `telemetry:track({event})`; no other arguments are accepted. View and interaction events represent user actions and must not be inferred from background API queries. Wiring the remaining frontend interaction events is separate work.

First-observed events: `first_dashboard_viewed`, `first_activity_analyzed`, `first_map_viewed`, `first_ai_question_asked`, `first_saved_analysis_created`. The corresponding accepted event emits the milestone once. These describe observation under consent, not unobserved activity before consent.

Server writes currently instrument onboarding, imports, goals, plans, saved analyses, query authorization, maintenance reminders, shares, AI asks and billing changes. `analysis_query_run` means an authorized query attempt, not a successful result. New account creation has no analytics consent, so no signup event is transmitted or backfilled. Provider events remain inactive while direct connectors are gated. Import completions describe processed source outcomes, including archive children, not a fixed count of physical workouts. Use canonical data for workout totals.

## Delivery and consent boundaries

`telemetry:page` gives the owner a paginated event/status history. An internal sender reserves an attempt, checks current consent and its revision again immediately before transmission, and retries failures at most four times with the same event UUID. Withdrawal invalidates queued attempts even if consent is later granted again. A request already in flight cannot be recalled; subsequent requests stop. No third-party browser SDK, automatic capture, replay or browser IP transmission is enabled by this implementation.

External capture requires all of `KINETEXA_TELEMETRY_ENABLED=true`, a staging/production environment, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_PROJECT_ID` and `POSTHOG_SECRET_KEY`. Otherwise events become `local-only` and are not replayed when configuration changes. The project secret needs the scopes required for person erasure and event-count queries. Keep it server-side.

The [PostHog EU capture API](https://posthog.com/docs/api/capture) receives a pseudonymous identity, event name, timestamp, UUID, environment and taxonomy version. Geolocation is disabled and IP is null. It receives no person name or email. Capture acceptance is distinct from verified ingestion. Hosted readback and erasure remain pending authenticated key setup.

## Erasure and recovery

Before any possible transmission, the athlete is marked as requiring external erasure. Account deletion locks access and observes its normal fifteen-minute grace period, then requests person/event/recording deletion using the [PostHog person API](https://posthog.com/docs/api/persons). HTTP acceptance only starts asynchronous deletion. The backend queries the exact pseudonymous identity until its event count is zero; final account purge has an independent erasure fence. Pending erasure retries every thirty minutes and remains visible in deletion status. API failures retain the locked account for retry/operator review.

No analytics key means no new external capture. If credentials disappear after transmission, deletion remains blocked until erasure can be verified. Restore preparation disables analytics consent, increments its revision and makes pending events local-only. It preserves the external identity for erasure, while isolated restore environments have no external analytics credentials.

## KPI acceptance still open

The taxonomy is the input to product KPIs, not evidence that activation, retention, conversion or churn targets have been measured. Reports must distinguish consenting cohorts and missing observations. Full KPI queries, first-activity timing across consent boundaries, successful-result events, frontend bindings, external retention configuration and hosted deletion verification remain open acceptance work.
