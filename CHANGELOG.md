# Changelog

## Unreleased

- Rate-limit public share projection atomically to 120 views per link per minute, retain no visitor identifiers and update the share page for mutation transport and retry guidance.

- Align share preview/create validation, deduplicate legacy activity selections, enforce exact expiry, use profile calendar dates and expose selected-field totals with missing measurement counts.

## 0.4.0-alpha.3 - 2026-09-06

Backend recovery, workspace, goal and webhook verification milestone. Production remains closed; provider access and remaining PRD acceptance gates stay open.

- Record private verified Stripe/Resend webhook outcomes and provider failure metrics with OTLP attributes; ignore notifications for absent billing accounts and exclude forged requests from stored observations.

- Review Wahoo, Suunto and COROS access paths against current primary documentation; update disabled connector reasons and send the explicitly approved COROS scope clarification.

- Distinguish missing goal measurements from recorded zero, limit supporting history to the actual calculation cutoff and remove unrelated activity attribution from manual results. Publish goal method revision 1.1.0.

- Add paginated owned workspace and calendar APIs, read only required workspace collections for deterministic analytics, and default custom-query date groups to the athlete's timezone while preserving explicit overrides.

- Recover partial archives through child or whole-archive retries, preserve completed children, page aggregate status scans and fence stale import attempts. Restore interrupted archives as retryable failures and discard stale scan cursors.

## 0.4.0-alpha.2 - 2026-09-06

Verified backend corrections and private measurement APIs. Production remains closed; this is not operational V1 completion.

- Correct best-distance efforts when the fastest interval starts between recorded samples; version the calculation change and retain previous results during reprocessing.

- Bound webhook bodies while streaming and count UTF-8 bytes before signature verification.

- Expose paginated full source/calculation provenance and explicit overview truncation flags; reject impossible dates in health history.

- Seal verified uploads under checksum-addressed original keys before parsing, preventing upload URL replay from changing retained data; clean temporary copies after URL expiry.

- Add private editable AI answer feedback, evidence eligibility checks and consent-limited feedback aggregates without model calls or quota charges.

- Add private consent-limited KPI reports with explicit pending and missing-data counts; record successful analysis queries, source completion times and Premium cancellation transitions.

## 0.4.0-alpha.1 - 2026-09-06

Backend milestone. Production remains closed and external provider, analytics and release gates remain open.

- Publish completed subscription refreshes while newer requests are pending, while preserving the order of already-applied entitlement updates.

- Clear removed goal results, workout intensity and legacy gear intervals on edit; reject invalid calendar dates and future service dates.

- Add consent-fenced product events, private history and bounded delivery retries; require verified external event erasure before final account deletion and prevent telemetry replay after recovery.

- Expose explicit provider approval/terms gates and capability status, with a checked adapter contract and current Strava/Polar compliance notes.

- Divide email send reservations across production, staging and development to keep their combined allowance within Resend Free.

- Record private job outcomes, cost and latency; add guarded operator retries, queue alerts, OTLP trace export and scheduled checks. Keep production athlete APIs closed until release.

- Retain verified calculations with an explicit notice when AI explanation fails, while preserving consent withdrawal.

- Keep a transactional numerical activity index for large-history analytics, preserve pagination cursors and rebuild derived caches after recovery.

- Add custom distance, duration and date-based gear reminders, idempotent service history and paginated usage APIs.

- Preserve recording gaps in bounded chart streams and reject invalid saved-query calendar inputs.

- Add private daily database/object backups, incremental retention and checksum-verified restore preparation with an independent deletion ledger.
- Recover interrupted deletion attempts and send a confirmation only after removal; erase its cached recipient after provider acceptance.

## 0.3.0-alpha.2 - 2026-09-06

- Preserve recording breaks through distance, sensor coverage, records and private/public route geometry; prevent nested duplicate merges.

- Checkpoint exports into resumable ZIP parts with SHA-256 manifests, prior canonical versions, owned retry/download APIs and seven-day cleanup.

- Persist one Stripe Checkout reservation per account, reconcile full subscription history, enforce paid-period expiry and close unfinished payments during deletion.

- Recover interrupted email attempts with stable payloads and provider idempotency; retain early signed delivery events and suppress bounced or complained recipients.

- Complete workspace edit/delete APIs, validate planned workouts and goal results, and rebuild local dates after timezone changes.
- Enforce unique share tokens and durable expiry; include AI runs and insights in the shared export/deletion registry.

- Expose all thirteen deterministic analytics operations and complete dashboard summaries through authenticated APIs, without an AI call.
- Add recorded-interval analysis; reject sparse load extrapolation, unpaired efficiency and cycling FTP applied to running.
- Keep missing load distinct from rest days and leave unrecorded race results unavailable.

- Preserve local start/offset provenance, device metadata, sensor dynamics and decoded source fields in downloadable canonical data.
- Import all FIT sessions, TCX activities and GPX tracks independently; retain shared originals and deduplicate by file and part.
- Repair legacy multi-activity imports through the retained-file reprocessing workflow.

- Rebuild retained originals with checksum verification, durable retries, atomic health publication and preserved activity edits and metric history.
- Paginate import history and reject legacy requests that would silently truncate it.
- Prioritize backend completeness and API verification; user will handle subsequent visual design.

## 0.2.0-alpha.2 - 2026-09-06

- Complete the six supported FIT health signals, expose source and date availability, and paginate health history with a processing preference.
- Verify a six-signal health-only import on staging without inventing an activity; expand focused coverage to 53 tests.
- Validate actual gzip expansion, CRC and length using bounded decompression, and make mobile AI evidence readable and keyboard-accessible.

- Implement thirteen grounded AI tools, local-calendar comparisons, paginated conversation history, source-policy filtering, consent revisions and request cost telemetry.
- Add optional, dismissible training-load insights and expand safety, privacy, calculation and quota coverage to fifty tests.

- Verify an independent database and object-storage restore with authenticated reads and byte checks; keep backup automation and retention as open release gates.
- Isolate scheduled background work in authorization and sharing tests so CI workers finish without email jobs running during teardown.

- Paginate private activity history and authorized analytics rather than relying on one large response. Load complete totals and use smaller overview geometry.
- Add custom-date/activity map filters, aligned activity-comparison charts, editable goals and correct lower-is-better race targets.
- Preview the exact masked public fields before publishing a share; format shared distance and time with readable units.
- Preserve checksums even when parsing fails and retain individual archive-source provenance across exact duplicates.
- Verify permanent account deletion and twelve-page desktop/mobile accessibility scans; expand focused coverage to 26 tests.

## 0.2.0-alpha.1 - 2026-09-06

- Add canonical FIT/TCX/GPX parsing, bounded archive imports, private original storage, background import state, and duplicate suggestions.
- Add deterministic load, zones, fitness decay and best-effort calculations with synthetic fixtures.
- Add athlete ownership checks, mutation quotas, and two-identity backend tests.
- Deploy an isolated staging application with WorkOS sign-in, private onboarding, configurable dashboard, activities, records, maps, saved analyses, goals, calendar, gear and sharing. This is a prerelease, with remaining acceptance work tracked in the requirement ledger.
- Preserve Strava CSV migration metadata and ingest FIT resting heart rate, HRV and weight when present. Recover interrupted import workers and wait for archive child completion.
- Verify staging uploads, cross-account isolation, sandbox Checkout through the hosted payment page, signed subscription updates, consented Gateway responses, and an export containing seven originals and four canonical streams.
- Add a free-tier email outbox and verify an export notification through a signed Resend delivery event.
- Add source checksums, calculation history, interval stream loading and map-driven recording selection.
- Record all 213 numbered PRD requirements and the user's authorization to proceed beyond setup.

Versions use Semantic Versioning. Setup and development milestones use prerelease versions. Version 1.0.0 is reserved for complete, operational V1 with recorded verification.

## 0.1.0-alpha.2 - 2026-09-06

- Finish live Stripe key issuance after the user's identity verification.
- Configure and verify live EUR 35 monthly and EUR 180 annual subscription prices and the customer portal, with cancellation at period end.
- Save live billing configuration in Vercel production while retaining sandbox resources in development.
- Record implementation-dependent billing and live payment/payout release checks separately from completed account setup. No real charge was made.

## 0.1.0-alpha.1 - 2026-09-06

- Import the original PRD and strategy brief as product references.
- Add concise repository instructions, explicit user decisions and a setup checklist.
- Establish the Next.js workspace and initial authenticated Convex profile schema.
- Configure development and production Convex, WorkOS and private EU R2 resources, with separate credentials. Verify storage access and environment isolation through APIs.
- Deploy a responsive holding page and health endpoint to kinetexa.com. Keep signup entry points closed until the application is ready.
- Create bounded development/production AI Gateway keys, a Kinetexa PostHog EU project, and a domain-scoped Resend sending key without a plan upgrade.
- Choose the open-source OpenFreeMap service instead of a paid map account.
- Create a separate Stripe account and sandbox, submit live activation using the existing company's details, and configure test subscription prices and customer portal. Live key issuance requires the user's verification.

This is a setup milestone, not a V1 release. Full authentication, activity import, billing lifecycle and desktop/mobile product journeys still require implementation and verification.

## Initial foundation, b08f5d9

- Initialize the public AGPL repository, architecture notes and design direction.
