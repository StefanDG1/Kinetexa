# Staging verification, 6 September 2026

This records prerelease evidence, not completion of all V1 acceptance criteria. The unchanged PRD and requirement ledger remain authoritative.

## Latest backend checkpoint

`0.4.0-alpha.5` has 136 passing focused tests. It closes the verified logout, deleted-account recreation, pre-registration revocation and ZIP-integrity failures. A nonce-based CSP and public disclosure contact are deployed; hosted map, browser inline-handler blocking and production header/gate checks passed. The threat model and incident procedure explicitly retain their remaining security and paging gaps. [Milestone evidence](verification/backend-0.4.0-alpha.5.json).

Hosted staging reproduced an existing JWT remaining readable after direct WorkOS session revocation. Kinetexa logout now records server-side denial before contacting WorkOS: the same JWT cannot read private data or recreate the athlete, its refresh token fails, and a second session can still refresh and read. Both temporary sessions were logged out. The real browser Sign out link returned to the landing page, added one server revocation and redirected a subsequent protected-page visit to WorkOS sign-in. [Evidence](verification/logout-2026-09-06.json) and [authentication behavior/limits](authentication.md).

Account-purge regression testing also reproduced athlete recreation from an unexpired token after deletion. First allocation now verifies the live WorkOS identity through the public registration action. The hosted normal-grace deletion removed the identity and private objects, checked 26 owned tables and denied recreation from a token with 226 seconds left. Pre-registration logout, denial after fresh registration, export inclusion, never-registered identity cleanup and the second normal deletion all passed. Hashed identity tombstones cover pre-registration records in older snapshots. Temporary deletion notices still follow Free email quotas and bounded retention. [Registration evidence](verification/registration-2026-09-06.json), [pre-registration evidence](verification/pre-registration-2026-09-07.json).

ZIP regression checks reject damaged content, forged sizes, inconsistent headers and duplicate paths. In the hosted isolated environment, a damaged ZIP published no activities, while a valid two-activity migration retained metadata and original checksums. The fixture was removed through a clean restore of 45 objects, seven readable streams, thirteen health records and deletion exclusion across 26 tables. [Archive evidence](verification/archive-integrity-2026-09-06.json).

`0.4.0-alpha.4` has 125 passing tests. A fresh local Node process handling the same 28,168,610-byte GPX dropped from 860 MiB peak RSS with the previous parser/writer to 390 MiB with record parsing and chunked canonical JSON. The same 300,000-point file then completed the real isolated Convex/R2 journey in 71.1 seconds, retained its original checksum, round-tripped every canonical sample and served a bounded chart view. All seven retained staging activities reprocessed under the new version with checksums, edits and prior calculations preserved. The isolated environment was reset to its earlier snapshot: 45 checksum-verified objects, seven readable streams, thirteen health records and four deleted owners excluded across 25 tables. The large fixture is absent. [Machine-readable evidence](verification/backend-0.4.0-alpha.4.json).

These are local RSS measurements and one hosted large-GPX journey, not hosted memory telemetry or universal device/format coverage. Convex documents a [512 MiB Node action limit](https://docs.convex.dev/production/state/limits). The original upload limits are unchanged. Broader FIT/TCX/ZIP and concurrent-load validation remain open.

Public-share rate limits bring the suite to 122 tests, with a passing production Next.js build. Hosted staging accepted 120 concurrent valid reads, rejected the next with a retry duration and denied the old query transport. The persisted counter was exactly 120 and the temporary link was revoked. Unit checks cover minute reset, unavailable-link behavior and bounded counter storage. [Sanitized evidence](verification/sharing-rate-2026-09-06.json).

Sharing corrections bring the suite to 121 focused tests. Hosted staging verified all four kinds against their previews, independently checked selected-field totals and profile dates, rejected invalid selections and cross-owner access, and verified expiry. All five temporary links were revoked and returned null. Tests additionally cover changed privacy masks, inactive owners, the exact expiry cutoff, legacy duplicate IDs and unavailable measurements. [Sanitized evidence](verification/sharing-2026-09-06.json). Frontend adoption of server totals remains in the user UI phase.

Verified webhook monitoring brings the focused suite to 119 tests. Hosted staging exercised forged rejection without persistent observation, a signed unowned billing notification, ignored email events, a duplicate delivery and a signed malformed event. Five logical outcomes were stored, with no body/signature content, and repeated identical outcomes did not inflate counts. The ordinary client could not write private operator observations. Provider metrics and OTLP attributes were read back. These are signed synthetic requests; no payment or email was sent. Production verification uses only ignored, non-mutating events.

Goal measurement and evidence checks bring the focused suite to 118 passing tests. Hosted staging verified an elevation goal with an imported activity lacking elevation: progress is unavailable, with the source and missing-data reason preserved. An entered race time returned its actual value with no unrelated activity IDs or source query. Cross-owner access failed and the two temporary goals were removed. Future-record exclusion, measured zero and partial coverage have focused regression tests. Method revision `1.1.0` is returned with goal evidence. The corrections are deployed to staging and the closed production backend.

Workspace and custom-query corrections bring the focused suite to 116 tests. An activity at 01:00 UTC now groups under the previous local date for a New York athlete; an explicit UTC query still uses its UTC date. Workspace paging traversed 126 workouts and 126 goals, found a requested goal beyond the first page, rejected another owner's goal and enforced inclusive calendar bounds. Hosted staging readback traversed all eight workspace collections for both retained owners with one-record pages, matched existing data, checked calendar bounds and independently matched profile/default and explicit timezone day groups. These corrections are deployed to staging and the closed production backend; frontend adoption remains separate.

After `0.4.0-alpha.2`, 114 focused tests pass. A hosted isolated restore imported a ZIP with one valid GPX and one malformed TCX. Child retry and whole-archive retry each reconciled the partial parent, reused its two children and retained exactly one successful activity. A 151-child integration case also verifies paginated aggregation and cross-owner retry rejection. Late worker mutations cannot replace a newer attempt or change an already completed result into a failure.

The isolated database and bucket were then reset from the same staging backup. All 45 restored objects passed checksum verification, all seven activity streams were readable at calculation version `0.4.0-alpha.2`, and thirteen health records remained across the two owners. Four deleted accounts were absent from all 25 owned tables and their object prefixes. Analytics consent stayed off, pending external deliveries stayed disabled and temporary exports were expired. The recovery fixture was removed. This batch is deployed to staging and production; production still rejects registration and its public health endpoint returns 200.

`0.4.0-alpha.2` has 113 passing focused tests. The later sections record private KPI/feedback APIs, upload integrity and cleanup, complete provenance paging, webhook byte limits and corrected best-distance calculations. All seven retained staging activities were reprocessed and preserved their originals, edits and historical calculations. Production registration remains closed and the public health endpoint passes. This milestone does not close all PRD requirements.

## Hosted journeys

Hosted AI acceptance: all six documented scenarios passed, including exact period comparison, missing-health results, goal progress, saved analysis and medical/privacy boundaries. The four model-backed answers took 2.28–3.25 seconds and cost an estimated USD 0.013065 combined. Boundary requests made no model calls. [Machine-readable results](verification/ai-2026-09-06.json). A separate four-TCX fixture with complete HR coverage generated the expected 100% weekly load comparison as an automatic insight; another owner could not dismiss it, and dismissal prevented regeneration. Temporary sandbox Premium was canceled without resetting usage counters. These small samples do not establish population-level reliability.

Production integration configuration: Stripe's endpoint is enabled, its signing secret is stored privately, forged signatures and sandbox payloads are rejected, and a signed non-mutating configuration request is accepted. Resend's production endpoint received a real signed delivery event from its simulator. The validated AI model is configured behind the closed app gate. No live charge or public signup was performed.

Billing fixture cleanup: WorkOS identity removed, private objects empty, all 25 owned tables checked and application data purged. One bounded deletion-notice record remains queued until the staging Free email allocation resets, so immediate removal of that temporary recipient is not claimed. The Stripe test clock and its test customer were deleted. Insight-fixture cleanup also passed: identity removed, private objects empty and all 25 owned tables checked. Its deletion notice remains under the same bounded email policy, for two pending simulator notices in total.

Stripe sandbox clock: an isolated synthetic customer completed initial monthly payment, renewal, a failed renewal that removed Premium, payment recovery that restored Premium, and cancellation. A test refund succeeded and left the subscription active until separately canceled, matching Stripe's subscription state. The customer portal URL was created and the same canonical activity survived every transition. Concurrent refresh verification exposed and fixed a race: a completed result now publishes unless a newer result has already applied. Immediate cancellation after refresh passed after that change. The synthetic account completed deletion after its normal grace period; cleanup evidence is recorded above. No live payment was made. The focused suite has 102 passing tests.

Product telemetry backend: a synthetic account with consent off recorded nothing; consent on recorded an allowed dashboard event as `local-only`; attempted payment-event spoofing and an extra arbitrary payload were rejected. Withdrawal stopped further recording. The original consent preference was restored. External PostHog ingestion and erasure are still gated on key setup. At that checkpoint the focused suite had 101 passing tests, including withdrawal/re-consent races, payload privacy, event isolation, erasure fencing and backup replay prevention.

The first hosted operational workflow passed for staging and production: [run 34049786270](https://github.com/StefanDG1/Kinetexa/actions/runs/34049786270). The workflow is active on the default branch. This proves scheduled-check execution; delivery of an incident notification has not been tested.

Operational verification: a retained staged cycling file reprocessed successfully in 1,389 ms and produced a correlated operational event. Its OTLP JSON export passed format/content checks. Ordinary authenticated and anonymous clients were denied internal operator reads. The production backend was deployed with athlete registration closed; `athletes:ensure` returned the explicit release-gate error and `athletes:current` returned null. Both private monitors completed without active alerts before workflow activation. Nested spans and actual notification delivery remain unverified. See [operations](operations.md).

Environment: `staging.kinetexa.com`, a separate European Convex deployment and private European R2 bucket. Synthetic accounts use the non-production WorkOS environment. Payments use Stripe sandbox; application email uses Resend's delivery simulator.

- WorkOS email/password sign-in completed in Chrome, returned through the registered staging callback and opened private onboarding. Onboarding persisted to the athlete account.
- FIT, TCX, GPX and ZIP uploaded through signed R2 URLs and processed in background. Initial four uploads produced three canonical activities. ZIP child completion and exact duplicate handling were verified through APIs.
- A second identity saw no first-account activities and could not read its activity ID.
- A second ZIP preserved a quoted activity title, private description and equipment assignment from Strava-format `activities.csv`. A health-only FIT produced a dated resting-heart-rate measurement without inventing an activity.
- The full export downloaded as a ZIP with seven originals and four canonical stream files. Every original matched the recorded SHA-256 and byte count. The ZIP also contains profile, gear, health, audit and other application metadata.
- With AI consent off, the API rejected a question. With consent on, a Gateway request completed with four activities, 27.06047 km and one hour of evidence. Consent was then switched off. This is smoke coverage; the full AI quality and safety evaluation remains open.
- Stripe's hosted sandbox Checkout accepted the synthetic test card and returned to Kinetexa showing Premium active. Signed webhook replay was idempotent, a forged signature was rejected, and sandbox cancellation removed Premium while preserving all four canonical activities. No real charge was made.
- The export notification reached `delivered` through the signed Resend webhook. Earlier pre-webhook notifications reached `sent`; delivery was not inferred from acceptance alone.
- A separate synthetic deletion account imported an activity, requested deletion and immediately lost private-data access. After the 15-minute grace period, WorkOS returned 404, its private R2 prefix contained zero objects, and its records and job were absent from all sixteen athlete tables checked.
- API checks also saved and pinned an analysis, verified its total against contributing activities, edited a goal, moved a planned workout, retired linked equipment, applied a privacy zone and revoked a share. The public endpoint returned no data after revocation.

## Focused automated checks

Twenty-six tests pass across core parsing/calculations, AI output validation, ownership/sharing and destructive lifecycle boundaries. Cases include archive traversal/expansion rejection, missing recording gaps, distance resets, complete-duration power requirements, quoted CSV metadata, FIT health extraction, hidden geometry, cross-user writes, quotas, deletion confirmation/ownership and interrupted-import recovery. Paging tests aggregate all 205 fixture activities across multiple bounded pages while keeping another owner's history empty; timezone and race-target tests cover the corrected goal/dashboard calculations.

The production Next.js build and TypeScript checks passed for tagged milestone `v0.2.0-alpha.1`, commit `c2317ca`; its GitHub Checks workflow passed. Chrome review verified the revised dashboard at 1600px and 390px. Axe-core found no WCAG A/AA violations across twelve private pages at desktop and 390px mobile widths; no page overflow was detected. Manual keyboard/screen-reader checks, populated-state coverage and other browsers remain open. The mobile public-share review identified raw SI labels, prompting a readable-unit correction.

## Independent restore drill

On 6 September, a native staging snapshot containing 75 documents in 19 tables was imported into an empty European Convex deployment named `restore-drill`. A separate bucket and bucket-scoped credentials received all 13 referenced objects: eight originals, four canonical streams and one export. Each restored object was downloaded and its SHA-256 compared with the source. The database snapshot and object manifest were also stored off-machine in the restore bucket.

A fresh authenticated API session against the restored deployment read four activities, one health measurement, one goal, one plan and one saved analysis. The restored total was 27,060.470230766892 metres, and the restored cycling stream returned 1,801 samples. The deleted synthetic account was absent from the snapshot. The restore deployment has no email, payment or AI service credentials.

This verifies one real restore. Scheduled production backups, retention, deletion handling across older backups and recovery-time targets remain release work.

## Expanded AI verification

Fifty focused tests now cover all thirteen deterministic tools and the request boundary, including local-calendar comparisons, missing signals, unowned entities, source-policy exclusion, consent off/on races, quota settlement, insight suppression and adversarial tool output. The production Next.js build and TypeScript checks pass for this implementation batch.

Live staging evals used `google/gemini-3.5-flash-lite`. Distance comparison returned 23,060.470230766892 metres against 4,000 metres; health returned resting heart rate 48 and unavailable sleep; goal evidence included the 35 km target; saved running analysis returned 9,060.470230766892 metres. Medical and privacy cases made no provider calls. Successful generated cases took approximately 2.3–4.6 seconds in this small sample.

The first saved-analysis attempt failed during planning. A later attempt succeeded; this is recorded as a reliability issue, not erased by the retry. Prompt revisions improved an initially vague goal explanation. The live sample is too small to establish the configured probabilistic quality threshold or production p95 latency. Automatic-card hosted verification and larger model evaluations remain open.

The ledger audit found 23 omitted source IDs (thirteen AI requirements and ten jobs-to-be-done). They were added without changing the source requirements. CI now verifies exact ledger coverage of all 236 numbered source IDs.

## Health and compressed-import verification

A new FIT uploaded through the second synthetic account on staging produced all six supported signals: resting HR 48 bpm, HRV 50 ms, weight 70 kg, VO₂max estimate 55 ml/kg/min, 2,000 recorded steps and 28,800 seconds of closed sleep intervals. It produced zero canonical activities. An earlier upload under the prior parser retained only its three supported readings; the subsequent verification used a distinct file and date.

Fifty-three tests pass, including health processing preferences, idempotent batches, 511 health rows across bounded pages, cross-athlete isolation, gzip CRC/length corruption, forged size headers and concatenated members. The production build passes. Sleep coverage and daily source-selection limitations are documented in `methods.md`.

Desktop Ask had no Axe WCAG A/AA violations. The populated mobile review found inaccessible scroll containers and poor date wrapping; a responsive card view and focusable chart-data regions address those findings. The revised hosted Ask review at 390px passed Axe WCAG A/AA with no page overflow. Recovery with all six recorded signals also passed at 390px and 1440px; manual inspection confirmed readable values, source records and coverage notes. The activity comparison loaded both recorded streams and its 601-row aligned data table.

## Retained-file reprocessing

Authenticated staging API checks rebuilt an older health-only FIT from three readings to six, repeated that rebuild without duplicate health rows, and rebuilt a cycling activity without changing its title, notes, tags, equipment, record-exclusion setting, distance or duration. The original downloaded file still matched its recorded SHA-256; the previous stream and metric snapshot remained available. A second athlete could not request that rebuild.

Fifty-seven focused tests pass. New cases verify atomic publication of staged health results, hidden incomplete generations, idempotent completion, bounded interruption retries, checksum failure, preservation of edits and version history, health preference off/on changes, concurrent threshold changes and account deletion fencing. Reprocessing operates from retained originals; per-file status survives browser closure. Visual redesign is now user-owned and paused while backend work continues.

## Canonical fidelity and multisport verification

A staging FIT containing a run and a ride produced two independent 20-second, 100-metre activities, each with three samples and its own distance origin. A repeated upload deduplicated both parts independently. Authorized full canonical downloads preserved vertical speed, stance time, vertical oscillation, torque effectiveness and the original decoded GPS-accuracy field. Local starts used the account's Europe/Berlin preference and retained that provenance. A second account could not obtain either canonical download.

Sixty-three tests pass. Added coverage includes DST transitions, explicit non-hour XML offsets, multi-session FIT boundaries, all GPX tracks and TCX activities, source extensions, unit conversions, duplicate handling and conversion of legacy multi-activity imports while retaining the first activity's edits and ID. Wider real-device fixture coverage remains open.

## Deterministic analytics API verification

All thirteen deterministic calculation requests completed against staging through `analytics:calculate`, with each returning finite or explicitly unavailable evidence. This includes activity comparison, period load/fitness, records, zones, health, both query forms, maps, goals and gear. The query and dashboard totals remained 27,060.470230766892 metres across four activities. These small-account calls took 79–125 ms; this is not a large-history benchmark or production p95 claim.

The selected cycling interval requested 100.5–600.5 seconds, used recorded boundaries 101–600, and returned 499 seconds, mean power 205.6933867735471 W and load 10.24673214788439. Another account was denied that interval. Health analytics returned recorded sleep while AI consent was off, without invoking a model. Sixty-nine tests pass, including source-policy separation between private deterministic analytics and AI, coverage constraints, sport-specific thresholds, unknown race results and missing-load propagation.

## Workspace and export registry verification

Staging API checks edited and removed a synthetic privacy zone, deleted a planned workout, rejected another account's deletion attempt, rejected a duplicate share token and confirmed that a three-second share expired into a persisted revoked state. The second synthetic account's export contained 29 files, including both canonical activities, AI-run data and insight data. Seventy focused tests pass. The synthetic zone and planned workout used for this check were removed.

## Email reliability verification

Staging sent one transactional message to Resend's delivery simulator. The signature-validated webhook recorded delivery after one attempt, and duplicate enqueueing produced no second job. Public outbox history excludes the cached recipient and body. The sender key cannot retrieve provider records; delivery evidence comes from the signed webhook. No customer was emailed and the Resend plan remains Free.

Seventy-three focused tests pass. Email cases cover interrupted attempts, stale completions, identical retry bodies and keys, an event arriving before its send response, forged signatures, replay ordering and bounce suppression. Uncertain retries stop before Resend's 24-hour idempotency retention expires. A daily job removes webhook receipts after 30 days; owned receipts follow account export and deletion. Legacy uncertain sends are marked for operator review rather than resent automatically. Production webhook setup remains open.

## Payment reliability verification

Two concurrent authenticated staging requests produced one real Stripe sandbox Checkout session. A repeated request returned the same URL. A conflicting annual request was rejected until the monthly session was expired, then the annual session used the configured annual price. Another account could not cancel the owner's session. All sessions created by this check were expired, with four canonical activities preserved. No live payment was made.

Seventy-seven focused tests pass. Payment cases cover concurrent reservations, stable request bodies, plan changes, stale subscription reads, paid-period expiry without a webhook, forged signatures, test/live separation, replay deduplication, all subscription pages and deletion with unfinished Checkout. Hourly reconciliation and paid-period refresh jobs repair missed events; AI entitlement checks also reject expired periods directly. Wider sandbox payment-failure/renewal verification and production payment readiness remain open.

## Durable export verification

Staging's new export completed as one ZIP containing 62 files: eight retained originals, two canonical activities, twelve active health rows and owned application metadata including AI runs, insights and delivery receipts. Every original and the full ZIP matched its SHA-256. A second account was denied the part URL, and R2 reported no abandoned multipart uploads for the job. The download expires seven days after the request.

Seventy-nine tests pass. Export tests force multiple parts, recover interrupted work from its cursor, reject stale publication and duplicate completion, preserve previous canonical streams, enforce ownership, and remove expired archives without touching source objects. Larger exports use several standard ZIP files plus a machine-readable manifest; all parts must be extracted together. Each metadata page records its read time. This is a documented read window rather than a transactionally frozen snapshot, so concurrent edits can appear at different page times.

## Recording gaps and merge verification

An imported staging GPX retained two recording segments and a canonical break marker. Its distance was 2,223.8985328911745 metres, excluding the gap between segments. The masked public projection preserved two separate lines. A nested duplicate merge and a cross-owner merge were rejected; the valid merge was reversed and the temporary share revoked. The second QA account now has three activities. Eighty-two tests pass.

The first QA account's retained sources were rebuilt under calculation version `0.3.0-alpha.2`. All thirteen deterministic APIs still passed; four activities totalled 27,060.470230766892 metres and the selected cycling interval retained its independently checked mean power and load. Recording breaks now exclude cross-boundary sensor time and best-effort windows. Geometry simplification preserves segment boundaries; complete samples remain in canonical downloads.

## Hosted backend milestone

Commit `5fc87d3` passed GitHub CI and the Vercel build. Deployment `dpl_APhJm6tB6HT8HrEjrh1Ho1hS3iap` is assigned to `staging.kinetexa.com`. The browser rendered the new export controls and live Stripe sandbox pricing; the recorded route showed its actual gap. The health endpoint returned 200 through the protected preview. Vercel preview protection remains enabled.

WorkOS staging's homepage, initiate-login URL and default sign-out URI now use the staging domain; localhost remains an allowed development callback/sign-out URI. An actual browser sign-out returned to `https://staging.kinetexa.com/`. Visual redesign remains paused at the user's request. This backend milestone is a prerelease, not operational V1.

## Backup, deletion and recovery verification

A private EU R2 backup bucket now holds native Convex snapshots and retained source/current/previous canonical objects. The first staging snapshot captured 204 records and 32 objects in 17.7 seconds. A later incremental snapshot captured 213 records and 34 objects, copying only two new objects in 10.5 seconds. The production snapshot completed against the currently empty production dataset. Daily scheduling is active on `main`. [GitHub backup run 34046493381](https://github.com/StefanDG1/Kinetexa/actions/runs/34046493381) succeeded for both staging and production, including retention cleanup. The staged snapshot contained 206 records and 32 objects; production remains empty.

An isolated restore verified all 32 object checksums and restored seven activities, thirteen health records and both synthetic owners' saved data. A separate synthetic account then completed real hosted deletion after its fifteen-minute grace period. WorkOS returned 404, R2 contained no owned objects, and all twenty owned application tables were empty. A signed Resend webhook confirmed the deletion receipt was delivered; the application retained neither its recipient nor an athlete association.

Restoring a snapshot taken before that deletion applied the independent deletion ledger. The deleted account's records and files remained absent, while the two other owners retained four and three activities, one and twelve health rows, and unchanged distance totals. Temporary export jobs were expired during recovery. The restore deployment has no payment, email or AI service credentials.

Eighty-four focused tests and TypeScript checks pass. Deletion workers now fence destructive work by lease, retry failures, cancel billing, abort abandoned multipart uploads, remove private objects and purge records before sending confirmation. See [backup and recovery](backup-and-recovery.md) for retention, credentials and the isolated recovery procedure.

## Maintenance and bounded stream verification

Staging created a custom shoe-replacement reminder against the real imported 2,223.8985328911745-metre activity. The kilometre threshold became due, service completion reset its usage, a repeated completion returned the same event, and retirement preserved historical usage. Another owner could not edit the reminder. Reminder and service records are registered for exports and deletion. The existing gear page has not been redesigned; the new APIs are documented for the user's later UI work.

Eighty-seven tests pass. Maintenance tests traverse 105 activities, exclude merged duplicates, avoid double-counting repeated equipment IDs, enforce ownership and preserve service history. Bounded stream tests retain omitted recording breaks and missing-time gaps, and saved-query validation rejects invalid time zones or inverted dates. Staging confirmed the route break and invalid-query rejection.

## Large-history backend verification

The isolated restore deployment received 1,000 and then 5,000 additional synthetic activity records with realistic stored route/metric sizes. The first run exposed an invalid pagination cursor caused by a changing default date bound. Stable bounds fix that error. The initial 1,000-activity dashboard took 5.4 seconds and gear usage took 4.0 seconds. Compact numerical indexing reduced those measurements to 0.95 seconds and 0.46 seconds.

With 5,004 activities, the dashboard completed in 2.45 seconds, a complete-history analytical query in 3.91 seconds and gear usage in 1.82 seconds. Paginated checks counted all 5,004 activities and reproduced 90,027,060.47023076 metres against the independently constructed fixture total. All seven cycling power-record evidence results were finite or explicitly unavailable. Index preparation took 50.6 seconds for this legacy dataset and persists progress between calls; new application writes maintain it incrementally.

These are individual synthetic API measurements, not a production percentile or browser rendering claim. Fixtures reused retained source references, so they do not measure processing 5,000 distinct files or all provider lookup patterns. The browser's initial history traversal remains open for the user's frontend work. The experiment was removed by restoring the original seven-activity dataset, clearing all 5,004 cache entries. Both owners' original totals and the pre-deletion recovery exclusion passed again.

Eighty-eight focused tests, TypeScript and the production build pass. Staging's thirteen deterministic tools and selected interval calculations passed after deployment. AI also reads the compact index with per-page consent and source-policy checks; live explanation reliability remains under verification.

## AI explanation failure recovery

A staged route-count question over the explicit August-to-September interval completed in 2.45 seconds using one deterministic tool and two provider calls. Its evidence matched the actual imported route count. The synthetic account's AI consent was restored to off afterward. An earlier explanation failed validation, exposing a loss of otherwise valid calculation results. Ask now retains those results with an explicit `evidence-only` outcome when explanation fails.

Focused tests force rejected numerical prose, provider failure and consent withdrawal. Invalid model prose is never displayed; verified evidence survives explanation failures, and withdrawal still removes it. The latest successful hosted answer does not establish the full model evaluation threshold, which remains a release check.

## Remaining release work

Full requirement closure remains open, including provider approval and connector operations, large-history performance, complete comparison/AI/health criteria, policy review, operational alerts and the full UI/accessibility matrix. Production continues to serve the holding page. This evidence does not justify `v1.0.0`.

## AI feedback API

A retained staged answer was rated helpful, changed to unhelpful and cleared. Internal aggregates changed by exactly one at each step; the original rating and analytics consent were restored. Another owner and an anonymous client were rejected. No model was called and quota was unchanged. The 108-test suite covers feedback ownership, idempotence, removal, evidence eligibility and analytics-consent exclusion. This verifies the backend API; frontend feedback controls and a larger independent quality evaluation remain open.

## Original integrity under upload replay

A fresh synthetic account reproduced an upload URL overwriting an already processed original; the original bytes were immediately restored. After the fix, replaying a new upload URL still succeeds against its temporary key, but the downloaded retained original and SHA-256 remain unchanged. Reprocessing succeeds from that original. A ZIP containing two activities and a two-session GPX each completed, and malformed XML failed while preserving its exact original and checksum. Six canonical fixture activities were verified. Automatic temporary-upload cleanup removed the replayable copy while preserving the sealed original. Final fixture deletion also passed: WorkOS identity removed, zero private objects, all 25 owned tables checked and an independent deletion tombstone present. One temporary simulator notice remains queued under the bounded Free email policy, making three such notices across this batch and the earlier two fixtures. The focused suite has 109 passing tests.

## Complete provenance reads

A focused integration case retrieves 126 sources and 35 calculation snapshots through bounded pages, checks overview truncation flags and rejects another owner. Staging retrieved a retained cycling activity's source and six calculation versions with one-row pages; cross-owner reads failed. Health history now rejects impossible dates such as 30 February while accepting valid leap days. All 110 tests and TypeScript pass.

## Webhook request bounds

Both staging and the closed production backend reject oversized UTF-8 webhook payloads with HTTP 413 and forged signatures with HTTP 400. Properly signed Unicode payloads still verify for Stripe and Resend. The checks used ignored event types and made no payments or email sends. Request reading now enforces one million bytes while streaming, including missing or dishonest length headers. The 112-test suite includes chunk-boundary and read-cancellation cases.

## Best-distance calculation correction

An independent 400 m fixture reproduced the missed-between-samples start: 52 seconds before the fix versus 46.6666666667 seconds from the stated piecewise speeds. The corrected scan passes that case and the recording-gap exclusions. All seven retained staging activities were reprocessed to calculation version `0.4.0-alpha.2`; original checksums, canonical totals, edited titles/notes/tags and previous calculation snapshots were preserved. The full suite has 113 passing tests.

## Record scopes and exclusion

Six synthetic activities imported through TCX in the isolated hosted environment verified all-time, athlete-local current-year, explicit period and comparison rankings. Default distance/pace queries use running; default power uses cycling. Explicit sport remains supported. Future activities do not compete. Exclusion removes a winner immediately, retains its local efforts and restores eligibility when cleared. Recorded zero power remains zero and missing long efforts stay unavailable. Focused integration checks reject another owner's reads and edits. All 137 tests pass. [Record evidence](verification/records-2026-09-07.json).

The isolated environment was returned to its verified 45-object, 369-document snapshot with seven readable canonical streams. The existing records frontend still needs to adopt the backend's timezone-aware scopes; this backend verification does not close the full records UI requirement.
