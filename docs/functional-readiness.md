# Functional readiness

The 0.5.0-alpha.1 and alpha.2 milestones connected the functional workspace and processing evidence. The alpha.3 walkthrough verified the journeys below and fixed an equipment creation failure. Styling remains the user's work. This is a functional inventory, not a claim that every PRD acceptance criterion has passed.

| Page       | Functional controls and data                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home       | Server dashboard totals, fitness/load, goals, pinned analyses in their saved display mode, formula/input/caveat metadata, explicit refresh                                                                                 |
| Activities | Bounded history and continuation; sensor charts/cursor, interval calculations, original/canonical downloads, source and calculation-history pagination, duplicate decisions, edits, gear, records exclusion and comparison |
| Records    | One backend calculation for all-time, current-year or calendar-period distance, power and pace records                                                                                                                     |
| Analysis   | Saved queries, edit, copy, delete, pin/unpin; table/number/line/bar output; individual gear grouping                                                                                                                       |
| Calendar   | Bounded day/week/month plans and completed activities, create/edit/delete and move plans preserving local clock time                                                                                                       |
| Goals      | Create/edit/delete, manual and backend automatic progress, missing-measurement status and projections                                                                                                                      |
| Gear       | Usage, create/edit/retire/restore equipment, named distance/hour/date reminders, service notes/history, edit/disable reminders, legacy interval conversion preserving baselines                                            |
| Maps       | Date/sport filters and route selection with manual continuation and bounded geometry                                                                                                                                       |
| Sharing    | Activity deep links, field preview, server totals/coverage, publication, expiry, revocation and paginated links                                                                                                            |
| Ask        | Existing consented evidence-linked answers plus persistent helpful/not-helpful feedback                                                                                                                                    |
| Settings   | Running/cycling FTP, zones/profile, privacy-zone edit/delete, export history and all provider availability reasons                                                                                                         |

Import also exposes multi-file upload, job status/retry, retained originals and archive results. Health exposes imported measurements, their source/availability, date filters, chart tables and a future-import processing preference. Billing exposes the Free/Premium status, interval choice and customer portal. Earlier API evidence covers these backend paths; this walkthrough did not repeat billing, health, export or destructive account checks.

The shell no longer subscribes to every activity and workspace record. Lists request small projections; maps request bounded geometry. Pagination caps database bytes as well as row count. Complete analytics still need historical numerical facts on the server. These changes reduce unnecessary reads and response size; they are not a measured production cost guarantee. Filters applied after indexed pagination can produce an empty page with more matching history available; continuation remains visible.

Local tests cover owner isolation, records, maintenance, workspace authorization and queries. Two new focused core cases cover daylight-saving/calendar behavior and multi-gear/missing numeric query semantics. The canonical calculation version remains unchanged because this release does not reprocess stored activities.

## Remaining release dependencies

- Finish the acceptance mapping and remaining browser paths: saved-item deletion, privacy-zone management, comparison/record controls, health and billing interaction, keyboard/accessibility and supported-browser coverage. Several have earlier API evidence, which does not establish frontend acceptance. Styling is left to the user.
- Persistent provider implementation and permission. None of the six catalog entries is an operational connection. Garmin approval and the COROS clarification response remain external dependencies; other providers need documented review/access.
- Remaining operational tracing, alert receipt, security/performance acceptance and real-device coverage in the requirement ledger.
- Live billing/payout readiness, business/controller policies and brand review, Vercel commercial eligibility without an agent-initiated upgrade, and PostHog erasure configuration before capture is enabled.

No `v1.0.0` release is claimed. A control in source is not evidence of a completed browser journey.

## Authenticated walkthrough, 7 September 2026

One explicitly labelled synthetic TCX recording supplied 300 metres over two minutes. Its original is 4,290 bytes. The walkthrough reused that recording throughout; it did not run large imports, reprocessing, hosted AI, payment or restore tests.

- Import completed; the activity displayed its route and sensor data. The selected-interval calculation returned results. Title/private-note editing persisted.
- Sharing preselected the activity and showed the chosen title, distance and duration. The public page displayed those values without the private note. Revocation returned a 404 on reopening the link.
- A saved distance analysis ran, was pinned, changed from bar to number display, and appeared on Home with the value 300.
- A one-kilometre goal showed 0.3 kilometres of progress and appeared on Home.
- A planned 20-minute workout was created at 10:00 local time, moved from 8 to 9 September, and reopened with 10:00 preserved.
- Equipment creation initially failed because the browser supplied a timestamp that strict server validation could reject. With server-generated time, creation, a 100-kilometre reminder and a completed service succeeded. The service note appeared in history.
- Assigning the equipment from the activity produced 0.3 km, two minutes and one activity in equipment totals. Retirement changed the reminder state; restoring the equipment retained those totals.
- The activity/Home layouts fit the 1,600-pixel desktop viewport; the public share and analysis layouts fit the 390-pixel mobile viewport. This is not a complete accessibility or device audit.

The staging account retains the labelled recording, analysis, goal, plan, equipment and service record for further functional work and styling. The public share is revoked. [Machine-readable evidence](verification/functional-0.5.0-alpha.3.json).

## Installation and account-action follow-up

The alpha.4 milestone adds PNG/Apple icons, complete manifest scope/identity, Settings installation help and a public-only offline fallback. Local Chrome reported no installability errors and the server-down/reconnection journey passed. Native mobile installation remains unverified. [Behavior and privacy](pwa.md).

Profile changes are bounded before recalculation, and repeated logout suppresses redundant WorkOS requests while preserving local denial during failures. Local boundary and existing registration-lifecycle checks pass. Anonymous auth, first-registration and invalid-token ingress controls remain in the security audit. [Authentication](authentication.md).
