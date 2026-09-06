# Staging verification, 6 September 2026

This records prerelease evidence, not completion of all V1 acceptance criteria. The unchanged PRD and requirement ledger remain authoritative.

## Hosted journeys

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

## Remaining release work

Full requirement closure remains open, including provider approval and connector operations, large-history performance, complete comparison/AI/health criteria, policy review, backup automation and retention, operational alerts and the full UI/accessibility matrix. Production continues to serve the holding page. This evidence does not justify `v1.0.0`.
