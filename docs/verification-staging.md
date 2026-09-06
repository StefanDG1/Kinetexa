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

## Remaining release work

Full requirement closure remains open, including provider approval and connector operations, large-history performance, complete comparison/AI/health criteria, policy review, backup automation and retention, operational alerts and the full UI/accessibility matrix. Production continues to serve the holding page. This evidence does not justify `v1.0.0`.
