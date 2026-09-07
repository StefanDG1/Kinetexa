# Functional readiness

This records the 0.5.0-alpha.1 code milestone. Browser acceptance is pending. No visual polish or new hosted fixture imports were part of this milestone.

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

The shell no longer subscribes to every activity and workspace record. Lists request small projections; maps request bounded geometry. Pagination caps database bytes as well as row count. Complete analytics still need historical numerical facts on the server. These changes reduce unnecessary reads and response size; they are not a measured production cost guarantee. Filters applied after indexed pagination can produce an empty page with more matching history available; continuation remains visible.

Local tests cover owner isolation, records, maintenance, workspace authorization and queries. Two new focused core cases cover daylight-saving/calendar behavior and multi-gear/missing numeric query semantics. The canonical calculation version remains unchanged because this release does not reprocess stored activities.

## Remaining release dependencies

- Authenticated desktop/mobile functional walkthrough and complete acceptance mapping. Styling is left to the user.
- Persistent provider implementation and permission. None of the six catalog entries is an operational connection. Garmin approval and the COROS clarification response remain external dependencies; other providers need documented review/access.
- Remaining operational tracing, alert receipt, security/performance acceptance and real-device coverage in the requirement ledger.
- Live billing/payout readiness, business/controller policies and brand review, Vercel commercial eligibility without an agent-initiated upgrade, and PostHog erasure configuration before capture is enabled.

No `v1.0.0` release is claimed. A control in source is not evidence of a completed browser journey.
