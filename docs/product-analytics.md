# Consented product analytics

Product telemetry is off by default. `analyticsConsent` is independent of AI and health processing consent. The backend accepts only the event names below, never arbitrary event properties, URLs, prompts, filenames, health values, geometry or credentials. Product events are private, athlete-owned records included in account export and deletion. Local records expire after 90 days. A bounded milestone list prevents a first-observed event from being emitted again after retention cleanup.

## Taxonomy version 1

Server events: `account_created`, `onboarding_completed`, `provider_connect_started`, `provider_connected`, `import_started`, `import_completed`, `first_activity_processed`, `premium_checkout_started`, `premium_activated`, `analysis_query_run`, `analysis_saved`, `goal_created`, `calendar_workout_planned`, `gear_maintenance_created`, `share_created`, `share_revoked`, `ai_question_asked`.

Authenticated frontend events: `dashboard_viewed`, `activity_viewed`, `map_viewed`, `date_range_changed`, `metric_explanation_opened`, `map_filter_applied`, `ai_insight_opened`. Send these through `telemetry:track({event})`; no other arguments are accepted. View and interaction events represent user actions and must not be inferred from background API queries. Wiring the remaining frontend interaction events is separate work.

First-observed events: `first_dashboard_viewed`, `first_activity_analyzed`, `first_map_viewed`, `first_ai_question_asked`, `first_saved_analysis_created`. The corresponding accepted event emits the milestone once. These describe observation under consent, not unobserved activity before consent.

Server writes instrument onboarding, imports, goals, plans, saved analyses, successful analysis queries, maintenance reminders, shares, AI asks and billing changes, including `premium_canceled`. `analysis_query_run` is emitted only after a custom query succeeds, with another consent revision check. Dashboard background queries do not emit it. New account creation has no analytics consent, so no signup event is transmitted or backfilled. Provider events remain inactive while direct connectors are gated. Import completions describe processed source outcomes, including archive children, not a fixed count of physical workouts. Use canonical data for workout totals.

## Delivery and consent boundaries

`telemetry:page` gives the owner a paginated event/status history. An internal sender reserves an attempt, checks current consent and its revision again immediately before transmission, and retries failures at most four times with the same event UUID. Withdrawal invalidates queued attempts even if consent is later granted again. A request already in flight cannot be recalled; subsequent requests stop. No third-party browser SDK, automatic capture, replay or browser IP transmission is enabled by this implementation.

External capture requires all of `KINETEXA_TELEMETRY_ENABLED=true`, a staging/production environment, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_PROJECT_ID` and `POSTHOG_SECRET_KEY`. Otherwise events become `local-only` and are not replayed when configuration changes. The project secret needs the scopes required for person erasure and event-count queries. Keep it server-side.

The [PostHog EU capture API](https://posthog.com/docs/api/capture) receives a pseudonymous identity, event name, timestamp, UUID, environment and taxonomy version. Geolocation is disabled and IP is null. It receives no person name or email. Capture acceptance is distinct from verified ingestion. Hosted readback and erasure remain pending authenticated key setup.

## Erasure and recovery

Before any possible transmission, the athlete is marked as requiring external erasure. Account deletion locks access and observes its normal fifteen-minute grace period, then requests person/event/recording deletion using the [PostHog person API](https://posthog.com/docs/api/persons). HTTP acceptance only starts asynchronous deletion. The backend queries the exact pseudonymous identity until its event count is zero; final account purge has an independent erasure fence. Pending erasure retries every thirty minutes and remains visible in deletion status. API failures retain the locked account for retry/operator review.

No analytics key means no new external capture. If credentials disappear after transmission, deletion remains blocked until erasure can be verified. Restore preparation disables analytics consent, increments its revision and makes pending events local-only. It preserves the external identity for erasure, while isolated restore environments have no external analytics credentials.

## Internal KPI reports

`productKpis:report({from,to})` is an internal operator action. Ordinary clients cannot call it. Select an ordered period of at most 31 days within the last 90 days, ending no later than now. Reports read bounded database pages and return aggregate counts and rates, without athlete IDs, names, files, prompts or health values. They include only active, currently consenting accounts. Event reads require the current consent revision, and each account is checked again after its reads. The report records its read interval; it is not an atomic historical snapshot. No report is persisted or sent externally.

- Activation is an observed lower bound for accounts created in the period whose seven-day window has ended. Younger accounts remain pending. A completion timestamp, enough processed activities, dashboard view and activity/map view are required. "All available if fewer" means all uploaded root sources completed, with at least one activity; files outside Kinetexa cannot be counted. Missing completion timestamps and missing frontend observations limit coverage. Legacy completion times are never fabricated.
- Time to value uses the first retained, unmerged activity creation time for the signup cohort. The report gives its sample count and median. Deleted or merged historical activities can change this retained-data measure.
- Import success uses current terminal outcomes of supported root uploads received in the period. An archive counts once; a partial archive is a failure. Pending imports and missing legacy upload times are separate counts. A later successful retry changes the result.
- Weekly engagement uses UTC Monday weeks and at least two high-value actions. First-use milestones do not double count actions. Partial boundary weeks include only actions within the requested interval. Explainability uses users with at least one high-value action as the active denominator.
- Premium conversion uses current entitlement among the observed activated signup cohort. Cancellation uses accounts with an observed Premium activation before the period and no later observed cancellation before its start. Accounts without observable opening state remain unknown. Select a full UTC month for monthly cancellation. These are consent-limited observations, not complete historical billing accounting.

Empty denominators return `null`, never a made-up zero. Provider reliability, a combined AI quality score and Open Solo adoption remain explicitly unavailable. AI feedback reports current helpful ratings, total ratings and eligible answers created in the selected period, only for consenting owners. Both completed and evidence-only answers qualify when their retained evidence validates; user prompts, failed runs and boundary responses do not. A rating is voluntary feedback, not independent verification of correctness. The hosted evaluation artifact remains separate. Runtime model completion must not stand in for grounded-answer quality. Frontend event bindings, external retention configuration, external ingestion/erasure verification and full KPI acceptance remain open.
