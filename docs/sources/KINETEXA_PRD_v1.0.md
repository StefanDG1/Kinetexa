# Kinetexa — Product Requirements Document (PRD)

**Document:** Kinetexa V1 Product Requirements Document  
**Version:** 1.0  
**Status:** Product direction aligned; implementation-ready baseline  
**Date:** 2026-09-06  
**Working product/company name:** Kinetexa  
**License direction:** AGPL-3.0 for the open-source solo/core product  
**Primary deployment:** Hosted Kinetexa Cloud on Vercel + Convex  
**Primary launch audience:** Runners and cyclists; endurance multi-sport architecture  
**Product strategy source:** `Kinetexa Product Definition & Strategy Brief v0.1`

---

## 0. Purpose of this document

This PRD converts the agreed Kinetexa product strategy into an executable V1 product contract.

It defines:

- exactly what V1 must do;
- who V1 serves;
- the critical end-to-end user journeys;
- functional requirements and acceptance criteria;
- provider/import/synchronization behavior;
- canonical data and provenance requirements;
- training analytics requirements;
- GIS/map requirements;
- AI requirements and evidence rules;
- privacy and security requirements;
- hosted free/premium requirements;
- open-source and self-hosting boundaries;
- architecture constraints;
- observability, reliability, accessibility and performance requirements;
- product analytics and KPIs;
- launch gates;
- explicit V2 deferrals.

This document intentionally goes further than a lightweight startup PRD. Kinetexa is meant to become both a credible product and a strong public demonstration of production-grade DevOps, cloud and security engineering.

### 0.1 Requirement language

The words **MUST**, **SHOULD**, **MAY**, and **MUST NOT** are normative:

- **MUST** — required for V1 unless explicitly marked conditional/external.
- **SHOULD** — strongly expected, but may be cut only if required to ship safely.
- **MAY** — optional enhancement.
- **MUST NOT** — prohibited behavior.

### 0.2 Requirement priorities

- **P0** — launch blocker.
- **P1** — expected in V1; can be disabled behind a feature flag only for a documented external dependency.
- **P2** — V1 stretch or immediate V1.x.
- **V2** — explicitly deferred.

---

# 1. Executive summary

## 1.1 Product thesis

> **Kinetexa is an open-source, privacy-first, AI-native fitness intelligence platform that gives athletes ownership of their data, continuously synchronizes multiple fitness providers, combines training science with geospatial intelligence, explains every metric, and lets users explore, query, visualize, share and act on their fitness data without vendor lock-in.**

### Working one-line positioning

> **Open fitness intelligence: own your movement data, understand your training, explore your world, and use AI to turn evidence into better decisions.**

### Working buzzword-rich description

Kinetexa is an **open-source, privacy-first, AI-native, self-hostable, multi-provider, cloud-native, mobile-first, explainable, extensible, developer-friendly, data-sovereign fitness intelligence platform**.

This description is deliberately maximal for product definition. Marketing copy will be simplified later.

---

# 2. V1 product objective

Kinetexa V1 succeeds when a runner or cyclist can:

1. create an account;
2. import or permanently connect a fitness source;
3. backfill and continuously synchronize historical/new data where the provider permits it;
4. maintain a provider-independent canonical copy of their activity data;
5. inspect a premium activity-detail experience with synchronized sensor charts and maps;
6. understand training load, trends, records, health/recovery context and goals;
7. explore their complete training history geographically;
8. construct custom analytics without writing code;
9. ask grounded AI questions whose answers are backed by deterministic analytics and source activities;
10. control privacy and sharing;
11. export or delete their data;
12. use the core experience comfortably from a phone;
13. choose the hosted free plan or pay for Kinetexa Premium;
14. inspect the public AGPL-licensed source code from day one.

## 2.1 Launch definition

V1 is launch-ready when:

> **A runner or cyclist can create an account, permanently connect/import their fitness history, have it normalized and deduplicated, see a polished dashboard and detailed workout analysis, understand training state, explore history geographically, ask grounded AI questions, control/export/delete their data, and use the core experience comfortably from a phone.**

Additionally:

- hosted subscriptions must work end-to-end;
- the public repository must be present from the beginning;
- the security and operational launch gates in this PRD must pass;
- at least one supported “connect once” provider integration must be production-ready, subject to third-party approval;
- manual/bulk import must provide a complete provider-independent fallback.

---

# 3. Product principles

Every product or engineering decision MUST be checked against these principles.

## P-01 — The user owns the canonical dataset

Providers feed Kinetexa. They do not define the lifetime, shape or accessibility of the user’s history.

## P-02 — Connect once, then disappear

After authorization, ongoing synchronization SHOULD require no repeated user intervention except when a provider revokes or requires renewed consent.

## P-03 — Evidence before explanation

Metrics, records, comparisons, GIS outputs and trend calculations are deterministic. AI interprets and communicates them; it MUST NOT invent measurements.

## P-04 — Explain the number

Important derived metrics MUST expose their model, input data, assumptions, algorithm version and limitations through progressive disclosure.

## P-05 — Maps and physiology are one product

Geospatial history and training science are equal product pillars. They MUST share the same canonical data and filters.

## P-06 — Privacy is the default

Accounts, activities, maps and health/recovery data start private. Sharing is explicit and revocable.

## P-07 — No artificial analytics paywall

The open-source personal analytics product remains meaningful. Hosted monetization should primarily charge for managed infrastructure, synchronization, AI usage, convenience and network value.

## P-08 — Premium consumer surface, technical depth underneath

Default UX MUST remain approachable. Advanced provenance, formulas, raw sensor data and custom analytics are discoverable rather than visually overwhelming.

## P-09 — Provider failure must not become user data loss

Provider revocation, API policy changes or service outages MUST NOT destroy already imported user-owned canonical data unless legally required.

## P-10 — Build portable boundaries before portable infrastructure

V1 may use managed hosted services directly. Module boundaries SHOULD anticipate adapters, but full provider-agnostic auth/backend/storage portability is not a V1 blocker.

---

# 4. Target users

## 4.1 Primary personas

### Persona A — Data-conscious runner

**Needs**
- longitudinal pace/HR/performance insight;
- best efforts and PRs;
- training load and consistency;
- simple explanations of complex metrics;
- mobile-first experience.

**Pain points**
- fragmented history;
- opaque fitness scores;
- subscriptions for advanced analytics;
- fixed dashboards;
- weak control of exported data.

### Persona B — Data-conscious cyclist

**Needs**
- power, cadence, HR, speed and elevation analysis;
- power-duration curve;
- device/sensor provenance;
- route intelligence and heatmaps;
- serious comparison of workouts and training load.

**Pain points**
- multiple device ecosystems;
- duplicated activities;
- loss of raw detail when moving between services;
- expensive overlapping subscriptions.

### Persona C — Quantified-self athlete

**Needs**
- custom filters;
- custom dashboards;
- transparent formulas;
- complete exports;
- provenance;
- reproducibility;
- AI over trusted structured data.

### Persona D — Privacy/self-host enthusiast

**Needs**
- inspectable source code;
- private-by-default behavior;
- future self-host path;
- export/delete;
- minimal vendor lock-in.

## 4.2 Secondary personas

P2/V2:

- multi-sport endurance athletes beyond running/cycling;
- friends and small social groups;
- clubs;
- coaches and organizations;
- developers building extensions.

---

# 5. Core jobs to be done

| ID | Job |
|---|---|
| JTBD-01 | Connect/import my training history once and keep a durable copy. |
| JTBD-02 | Understand whether my fitness and performance are improving and why. |
| JTBD-03 | Deeply inspect any workout and its sensor streams. |
| JTBD-04 | Explore where I have trained and how geography relates to performance. |
| JTBD-05 | Ask custom questions instead of accepting a fixed dashboard. |
| JTBD-06 | Understand records, goals, load and consistency. |
| JTBD-07 | Use health/recovery context to interpret training without turning the product into a medical diagnostic tool. |
| JTBD-08 | Share selected outcomes without exposing private raw data. |
| JTBD-09 | Export or delete everything and leave cleanly. |
| JTBD-10 | Pay for managed hosting/convenience if I do not want to operate the software myself. |

---

# 6. V1 scope at a glance

## 6.1 P0/P1 V1 product areas

- account/authentication;
- hosted Free and Premium plans;
- Stripe checkout + subscription lifecycle;
- FIT import;
- TCX import;
- GPX import;
- Strava bulk-export ZIP import;
- persistent Garmin connection if approved;
- provider connector framework;
- direct Strava connector only if expressly compliant/permitted;
- historical backfill where supported;
- automatic future synchronization;
- canonical activity model;
- untouched original-source retention;
- provenance and algorithm versioning;
- deduplication and high-confidence merge;
- dashboard;
- rich activity-detail page;
- training metrics;
- records/best efforts;
- basic health/recovery signals;
- global and filtered personal heatmaps;
- privacy-zone masking;
- visual custom analytics builder;
- AI chat (“Ask Kinetexa”);
- automatic AI insight cards;
- goals;
- training calendar;
- gear + maintenance;
- public/revocable share links;
- full export;
- full deletion;
- PWA;
- responsive/mobile-first UX;
- WCAG 2.2 AA target;
- product analytics;
- observability;
- threat model/security controls;
- public AGPL repository.

## 6.2 V1.x / V2 deferrals

A compact roadmap appears in Section 27. Notable deferrals include:

- native iOS/Android app;
- complete provider adapter portability;
- full Docker “one command” self-host package;
- road coverage percentage;
- unexplored roads;
- route generation;
- personal segments;
- custom formula language;
- third-party plugin SDK;
- full social network;
- clubs/coaches/teams;
- adaptive AI-generated training plans.

---

# 7. Critical user journeys

## UJ-01 — New user with Garmin

1. User opens Kinetexa on phone or desktop.
2. User authenticates through WorkOS.
3. User sees privacy defaults and AI consent separately.
4. User selects **Connect Garmin**.
5. Kinetexa completes provider authorization.
6. Kinetexa requests provider history/backfill where supported.
7. User sees a resumable progress state:
   - discovered activities;
   - queued;
   - processing;
   - complete;
   - errors requiring attention.
8. Activities appear incrementally; user need not wait for entire history.
9. New Garmin activities automatically synchronize after connection.
10. Dashboard, records, heatmap and training metrics update incrementally.

### Success condition

The user can leave the app during processing and return later without losing progress.

---

## UJ-02 — New user migrating from Strava

1. User selects **Import Strava export**.
2. Kinetexa explains how to request/download the user’s own Strava archive.
3. User uploads the archive.
4. Kinetexa validates the ZIP safely.
5. Activities and supported metadata are extracted and normalized.
6. Original source files are retained.
7. Duplicates are detected.
8. Dashboard and historical analytics populate incrementally.
9. Kinetexa never presents the Strava API as required for the product.

### Success condition

A user can migrate years of activity history without a paid Strava subscription or permanent Strava API dependency.

---

## UJ-03 — Manual FIT/TCX/GPX import

1. User uploads one or many files.
2. Files are scanned and validated.
3. Supported records and streams are parsed.
4. Original file checksum is stored.
5. Kinetexa detects duplicates.
6. Activity is displayed with provenance.

---

## UJ-04 — Inspect an activity

1. User opens activity.
2. Above the fold: sport, date, title, key summary metrics and route.
3. User scrubs any time-series chart.
4. Map marker synchronizes with chart timestamp.
5. User toggles HR/power/pace/cadence/elevation.
6. User views laps/splits, zones, records and best efforts.
7. User opens **Explain** on a derived metric.
8. Kinetexa shows formula/model, inputs, source data and algorithm version.
9. User asks AI to explain the workout.
10. AI links its statements to the metrics/activities used.

---

## UJ-05 — Understand current training state

1. User opens dashboard.
2. User sees fitness/load/form summary and week-over-week change.
3. User changes time range.
4. All compatible widgets update.
5. User opens an explanation panel for a metric.
6. User can trace change back to contributing activities.

---

## UJ-06 — Explore training geographically

1. User opens Maps.
2. Global personal heatmap loads.
3. User filters by sport/date.
4. User can select an activity from the map.
5. Privacy-zone masking applies to share/public contexts.
6. User can save the map configuration as a dashboard widget.

---

## UJ-07 — Build a custom analysis

Example question:

> Cycling activities, distance > 30 km, average HR < 150 bpm, last six months; plot average speed by month.

Flow:

1. Choose activity scope.
2. Add filters.
3. Select metric(s).
4. Select grouping.
5. Select visualization.
6. Preview results.
7. Save as named analysis.
8. Optionally pin as dashboard widget.

No arbitrary code execution is allowed in V1.

---

## UJ-08 — Ask Kinetexa

User asks:

> How has my aerobic efficiency changed since January?

Kinetexa:

1. classifies intent;
2. invokes permitted deterministic analytics tools;
3. retrieves only relevant data;
4. produces structured evidence;
5. uses AI to explain evidence;
6. displays supporting metrics and activity links;
7. labels uncertainty and missing data.

---

## UJ-09 — Upgrade to Premium

1. User opens plan page.
2. Current plan and usage are visible.
3. User selects Premium monthly or annual.
4. Stripe Checkout handles payment.
5. Signed webhook updates entitlement state.
6. Premium features unlock without page reload where practical.
7. Customer can manage/cancel subscription through Stripe customer portal.
8. Downgrade preserves canonical user data; only managed-service entitlements change.

---

## UJ-10 — Export and leave

1. User requests full export.
2. Kinetexa generates/export-manifests data asynchronously.
3. Export includes canonical data plus raw/original files where licensing permits.
4. User may separately request account deletion.
5. Deletion is irreversible after an explicitly communicated grace period if one is implemented.
6. Provider tokens are revoked/deleted.
7. User receives completion confirmation.

---

# 8. Authentication, account and onboarding requirements

## AUTH-001 — WorkOS authentication [P0]

Hosted Kinetexa MUST use WorkOS/AuthKit as the V1 authentication system.

### Acceptance criteria

- unauthenticated users cannot access private application data;
- sessions are validated server-side;
- logout invalidates the relevant session;
- protected routes do not rely solely on client-side guards;
- user identity maps to a single internal Kinetexa athlete account;
- account-linking behavior is documented and tested.

## AUTH-002 — Privacy-first onboarding [P0]

Initial onboarding MUST separately capture:

- account/profile privacy;
- optional product analytics consent where required;
- AI data-processing consent;
- provider authorization consent.

AI consent MUST NOT be bundled with required account creation.

## AUTH-003 — Account settings [P0]

User MUST be able to:

- edit display name;
- change units between metric/imperial if later supported, with metric default for EU locales;
- configure time zone;
- configure HR/power/pace thresholds;
- manage privacy;
- manage AI consent;
- manage providers;
- manage billing;
- request export;
- request deletion.

## AUTH-004 — Private defaults [P0]

Default new-user state:

- profile: private;
- activities: private;
- maps: private;
- provider connections: private;
- health/recovery: private;
- public discovery: off;
- AI processing: off until explicitly enabled.

---

# 9. Provider, import and synchronization requirements

## 9.1 V1 provider priority

### Required import formats [P0]

1. FIT
2. TCX
3. GPX
4. Strava bulk-export ZIP

### Persistent connection targets

1. **Garmin** — P0 target, conditional on provider approval/licensing.
2. **Strava direct OAuth/API** — conditional P1 only if the final integration is expressly compliant with Strava’s current API Agreement/Policy and is approved where required.
3. **Fallback/next provider candidates** — Polar, Wahoo, COROS, Suunto based on access and legal/technical feasibility.

### External-approval rule

No third-party approval MUST be allowed to hold the entire product hostage. If Garmin approval is delayed, Kinetexa may launch hosted beta with file/bulk imports while a second legally viable persistent connector is promoted to P0.

---

## PROV-001 — Connector abstraction [P0]

Each provider integration MUST implement an internal contract supporting applicable capabilities:

- `authorize`
- `refreshAuthorization`
- `revoke`
- `fetchProfile`
- `requestBackfill`
- `fetchActivities`
- `fetchActivityDetail`
- `fetchRawActivityFile`
- `fetchHealthSignals`
- `handleWebhook`
- `reconcile`
- `getCapabilities`
- `getRateLimitState`

Not every provider must support every method.

## PROV-002 — Capability discovery [P0]

Provider-specific limitations MUST be represented explicitly in product state rather than silently ignored.

Example:

```text
Historical activities: supported
Automatic new activities: supported
Sleep: not available
Raw FIT: supported
Backfill window: provider-specific
```

## PROV-003 — Connect once behavior [P0]

After a successful provider connection:

- Kinetexa MUST persist the connection securely;
- refresh/re-authentication MUST be automated where provider protocols allow;
- provider webhooks/push SHOULD be preferred to polling;
- periodic reconciliation MUST detect missed events;
- user intervention SHOULD occur only on revocation, expired consent, provider policy changes or unrecoverable auth errors.

## PROV-004 — Historical backfill [P0]

Where provider APIs support history/backfill:

- Kinetexa MUST request as much available history as legally/technically permitted;
- processing MUST be asynchronous;
- jobs MUST be resumable/idempotent;
- progress MUST be visible;
- partial history MUST become usable before full completion;
- failures MUST be retryable;
- provider rate limits MUST be respected.

## PROV-005 — New-activity synchronization [P0]

New activities SHOULD appear within:

- target: 5 minutes of a provider push/webhook notification for 95% of successful provider deliveries;
- hard operational alert threshold: 30 minutes for normal provider conditions.

Provider outages are excluded from the SLO but MUST be surfaced.

## PROV-006 — Reconciliation [P0]

Kinetexa MUST periodically reconcile provider state to detect:

- missed webhooks;
- delayed activities;
- activity edits;
- provider-side deletions where legally appropriate;
- token/authorization failures.

Reconciliation MUST NOT erase canonical data automatically when a provider deletes an activity unless product policy explicitly requires synchronization of deletion.

## PROV-007 — Rate-limit control [P0]

Each provider adapter MUST:

- track known limit headers/state;
- throttle automatically;
- use exponential backoff with jitter for retryable errors;
- avoid retry storms;
- expose quota exhaustion operationally;
- provide user-facing status if a backfill is delayed by provider limits.

### Current Strava note

Current Strava documentation states default limits of 200 requests per 15 minutes / 2,000 per day overall, with a lower “non-upload” quota. Any enabled Strava connector MUST use provider-specific quota accounting and MUST NOT assume those limits are permanent.

## PROV-008 — Provider legal gate [P0]

Every direct integration MUST have a checked-in provider compliance note covering:

- API terms version/date;
- allowed data uses;
- retention constraints;
- display constraints;
- deletion/revocation obligations;
- branding requirements;
- commercial licensing;
- AI restrictions;
- whether Kinetexa’s use is permitted.

Direct integration MUST be disabled if current terms make the use non-compliant.

## PROV-009 — Strava API constraint [P0]

As of the PRD date, Strava’s June 1, 2026 API Agreement/Policy states that applications may not create apps that compete with or replicate Strava functionality.

Therefore:

- Strava ZIP/file import is a first-class V1 migration path;
- direct Strava API sync is not a launch dependency;
- no direct Strava integration may ship merely because technical OAuth access works;
- legal/terms review is required before enabling it;
- Strava-derived API data MUST NOT be routed into AI if current Strava terms prohibit that use.

---

# 10. File and bulk import requirements

## IMP-001 — Supported uploads [P0]

Kinetexa MUST accept:

- `.fit`
- `.tcx`
- `.gpx`
- supported `.zip` migration archives.

## IMP-002 — Multi-file import [P0]

Users MUST be able to upload multiple compatible files in one import operation.

## IMP-003 — Asynchronous import [P0]

Large/bulk imports MUST:

- upload independently from processing;
- show per-file and aggregate status;
- survive browser close/reopen;
- retry safe failures;
- never require the user to keep a page open.

## IMP-004 — Safe archive handling [P0]

ZIP/archive processing MUST defend against:

- path traversal;
- nested archive abuse;
- decompression bombs;
- excessive entry counts;
- oversized uncompressed content;
- unsupported file types;
- malformed parser inputs.

## IMP-005 — Original preservation [P0]

The original uploaded/source file MUST be stored unchanged, subject only to encryption/storage encoding.

For each object store:

- cryptographic checksum;
- byte size;
- MIME/format;
- source/provider;
- import timestamp;
- object storage key;
- parser result.

## IMP-006 — Failed parsing [P0]

A parser failure MUST NOT destroy the original file.

User sees:

- failed file;
- concise reason;
- retry status;
- optional downloadable original where policy allows.

---

# 11. Canonical data and provenance

## DATA-001 — Canonical activity [P0]

Every activity MUST normalize into an internal provider-independent representation.

Minimum canonical activity properties:

- internal activity ID;
- athlete ID;
- sport type;
- sub-sport type;
- start time UTC;
- local start time;
- timezone/offset;
- duration;
- moving duration when derivable;
- distance;
- elevation gain/loss;
- route/polyline/geometry where available;
- summary HR;
- summary power;
- summary cadence;
- summary speed/pace;
- calories if source provides;
- source metadata;
- gear;
- laps/splits;
- tags/notes;
- privacy state;
- provenance references.

## DATA-002 — Stream model [P0]

Kinetexa MUST support time-aligned streams including, when available:

- timestamp/elapsed time;
- latitude;
- longitude;
- altitude;
- speed;
- pace (derived where appropriate);
- heart rate;
- cadence;
- power;
- temperature;
- distance;
- grade;
- vertical speed;
- running power;
- running dynamics;
- cycling dynamics;
- additional FIT developer fields without breaking ingestion.

Unknown/unsupported source fields SHOULD be retained in raw form for future parser upgrades where feasible.

## DATA-003 — Health/recovery model [P1]

V1 SHOULD ingest provider-available:

- resting heart rate;
- HRV;
- sleep duration/stages where available;
- weight;
- VO2max estimate;
- steps.

Additional fields such as stress, Body Battery, SpO2, respiration and body composition MAY be ingested if available without delaying core V1.

## DATA-004 — Provenance graph [P0]

Every canonical or derived value MUST be traceable to:

- source provider/file;
- source record identifier;
- original object checksum;
- parser/version;
- normalization/version;
- analytics algorithm/version;
- processing timestamp.

## DATA-005 — User-visible provenance [P1]

Activity detail MUST expose a technical provenance panel.

Example:

```text
Source activity: Garmin
Device: Edge 840
Original file: FIT
Heart rate source: Polar H10 (if determinable)
Power source: Favero Assioma (if determinable)
Parser: kinetexa-fit 1.2.0
Normalizer: activity-schema 1.0.0
Analytics engine: 1.4.0
```

## DATA-006 — Reprocessing [P0]

Kinetexa MUST support recomputing derived metrics when:

- parser improves;
- analytics formulas change;
- user thresholds change;
- bug fixes invalidate prior results.

Reprocessing MUST preserve algorithm version history sufficient to explain differences.

## DATA-007 — Data deletion semantics [P0]

Canonical data, derived data, raw files and provider credentials MUST be linked to deletion workflows so no orphan sensitive data remains after final deletion.

---

# 12. Duplicate detection and merge

## DEDUP-001 — High-confidence auto merge [P0]

If the same physical workout arrives through multiple sources, Kinetexa MUST attempt to detect duplicates.

Signals SHOULD include:

- overlapping start times;
- duration similarity;
- distance similarity;
- route similarity;
- sensor fingerprint;
- provider IDs/import lineage;
- file hashes;
- sport type.

When confidence exceeds a documented threshold, Kinetexa MAY auto-merge.

## DEDUP-002 — Uncertain merge [P0]

If confidence is ambiguous:

- do not silently destroy either activity;
- present merge suggestion;
- explain why records appear similar;
- allow user to keep separate.

## DEDUP-003 — Merged-source preservation [P0]

Merge MUST NOT discard source provenance.

A merged workout MAY use best available streams from different sources while retaining field-level source attribution.

## DEDUP-004 — Unmerge [P1]

Users SHOULD be able to reverse a merge.

---

# 13. Dashboard requirements

## DASH-001 — Default home dashboard [P0]

Default dashboard MUST contain:

- fitness/load/form summary;
- current training load;
- current week vs previous week;
- distance;
- duration;
- elevation;
- activity count;
- sport distribution;
- HR-zone distribution;
- training-load distribution;
- recent activities;
- recent PRs/records;
- goal progress;
- consistency/streak;
- compact personal heatmap;
- AI insight card.

## DASH-002 — Global date range [P0]

Supported ranges:

- 7 days;
- 4 weeks;
- 3 months;
- 6 months;
- YTD;
- 1 year;
- all time;
- custom range.

## DASH-003 — Widget customization [P0]

User MUST be able to:

- reorder widgets;
- hide widgets;
- restore defaults;
- add saved custom analyses as widgets;
- save layout per device class where needed.

## DASH-004 — Empty states [P0]

Widgets MUST communicate missing data rather than show misleading zeros.

Example:

> “Power data is unavailable for this period.”

## DASH-005 — Metric explanation [P0]

Derived metrics on dashboard MUST offer **Explain** affordance.

## DASH-006 — Mobile behavior [P0]

Dashboard MUST be usable without horizontal page scrolling on common phone widths.

---

# 14. Activity-detail requirements

## ACT-001 — Summary [P0]

Activity page MUST show:

- sport;
- title;
- date/time;
- duration;
- moving time when available;
- distance;
- elevation;
- primary performance summary;
- route when available;
- gear/source.

## ACT-002 — Interactive map [P0]

Route map MUST:

- support pan/zoom;
- highlight route;
- allow hover/touch synchronization with stream charts;
- show start/end markers only in private view;
- respect privacy masks in shared view.

## ACT-003 — Time-series charts [P0]

Where data exists:

- heart rate;
- power;
- cadence;
- speed/pace;
- elevation;
- temperature;
- grade;
- other supported sensor streams.

User can:

- toggle series;
- zoom to interval;
- scrub;
- compare selected intervals.

## ACT-004 — Synchronized chart/map cursor [P0]

Selecting a timestamp in a chart MUST move the corresponding map marker.

Selecting a route location SHOULD highlight corresponding chart time.

## ACT-005 — Laps/splits [P0]

Activity MUST display source laps and/or generated splits.

## ACT-006 — Zones [P0]

Activity MUST show time in configured:

- HR zones;
- power zones when applicable;
- pace zones when applicable.

## ACT-007 — Best efforts and PRs [P0]

Records detected in the activity MUST be highlighted.

## ACT-008 — Derived performance metrics [P0]

Applicable metrics include:

- load/stress score;
- aerobic decoupling;
- efficiency factor;
- normalized power or Kinetexa equivalent;
- intensity factor or Kinetexa equivalent;
- variability;
- power/pace curve contributions.

## ACT-009 — Comparison [P1]

User MUST be able to compare an activity with at least one other activity, including aligned summary metrics and selected charts.

## ACT-010 — Notes/tags [P0]

User can add private notes and tags.

## ACT-011 — Gear [P0]

Activity can be assigned to one or more applicable gear items.

## ACT-012 — AI analysis [P1]

Activity page SHOULD offer an AI explanation based on deterministic activity metrics.

## ACT-013 — Source/provenance [P1]

User can inspect original/source details without exposing secrets/tokens.

---

# 15. Training analytics requirements

## 15.1 Philosophy

V1 MUST ship a defined, tested analytics core rather than “every metric anyone has ever invented.”

Additional metrics may be added without changing the product contract, but the following families are required.

## ANALYTICS-001 — Zone systems [P0]

Kinetexa MUST support configurable:

- heart-rate zones;
- power zones;
- pace zones.

Zone calculations MUST record the threshold/model used at calculation time.

Defaults SHOULD prefer user/provider threshold data when available, with transparent fallback behavior.

## ANALYTICS-002 — Training load [P0]

Kinetexa MUST calculate at least:

- HR-based TRIMP;
- power-based stress/load where power + threshold data allow;
- running load/stress where pace/HR threshold data allow;
- daily load;
- weekly load.

### Trademark-safe requirement

Internal metric names SHOULD avoid relying on third-party trademarks unless legal review clears their use. Imported third-party values may be displayed with source attribution.

## ANALYTICS-003 — Fitness/fatigue/form [P0]

Kinetexa MUST provide explainable exponentially weighted chronic/acute load and form/balance metrics.

The UI MUST expose:

- time constants;
- input load metric;
- historical curve;
- activity contributions;
- model version.

## ANALYTICS-004 — Aerobic decoupling [P0]

For applicable steady endurance activities, Kinetexa SHOULD compute aerobic decoupling and explain minimum-data requirements.

## ANALYTICS-005 — Efficiency [P0]

Kinetexa MUST support an efficiency metric using sport-appropriate output relative to HR where sufficient data exists.

## ANALYTICS-006 — Cycling metrics [P0 when data exists]

Required:

- normalized/weighted power equivalent;
- intensity relative to FTP/threshold;
- variability;
- power-duration curve;
- best power efforts;
- time in power zones.

## ANALYTICS-007 — Running metrics [P0 when data exists]

Required:

- pace-duration curve;
- best pace efforts;
- HR/pace efficiency trend;
- time in pace zones;
- running power metrics where supplied.

## ANALYTICS-008 — Monotony/strain [P1]

V1 SHOULD calculate:

- training monotony;
- training strain;

with clear caveats.

## ANALYTICS-009 — Trend engine [P0]

The analytics engine MUST support time-windowed comparisons:

- week over week;
- month over month;
- custom period vs previous equivalent period;
- rolling averages;
- year over year where data permits.

## ANALYTICS-010 — Explainability contract [P0]

Every first-class derived metric MUST expose:

- human definition;
- formula/model description;
- raw inputs;
- thresholds/parameters;
- missing-data caveats;
- algorithm version;
- “why this changed” contribution view where feasible.

## ANALYTICS-011 — Scientific/validation documentation [P0]

Each non-trivial training metric MUST have:

- implementation reference;
- test fixtures;
- known limitations;
- unit tests against published/sample calculations;
- change log when formula behavior changes.

---

# 16. Records and best efforts

## REC-001 — Independent computation [P0]

Kinetexa MUST calculate records from canonical streams rather than trusting provider badges alone.

## REC-002 — Running distances [P0]

At minimum:

- 400 m;
- 1 km;
- 1 mile;
- 5 km;
- 10 km;
- half marathon;
- marathon;

plus configurable/custom distances later.

## REC-003 — Cycling power durations [P0]

At minimum:

- 5 s;
- 15 s;
- 30 s;
- 1 min;
- 5 min;
- 20 min;
- 60 min.

## REC-004 — Record scope [P0]

User MUST be able to view:

- all-time record;
- current-year record;
- period record;
- activity-local best effort.

## REC-005 — Data quality [P0]

Kinetexa MUST allow suspicious/invalid records to be excluded if caused by GPS/sensor corruption.

---

# 17. Health and recovery requirements

## HLTH-001 — Basic V1 health signals [P1]

Where connected/imported sources provide them, Kinetexa SHOULD ingest and visualize:

- resting HR;
- HRV;
- sleep;
- weight;
- VO2max estimate;
- steps.

## HLTH-002 — Context not diagnosis [P0]

Kinetexa may say:

> “Your seven-day HRV average is below your recent baseline.”

Kinetexa MUST NOT say:

> “You have condition X.”

## HLTH-003 — Sensitive privacy [P0]

Health/recovery data:

- is private by default;
- MUST NOT be included in public shares unless explicitly selected;
- MUST NOT be sent to an AI provider without AI consent;
- MUST use minimum-necessary AI context.

## HLTH-004 — Missing data [P0]

The UI MUST distinguish:

- no source connected;
- source does not expose metric;
- no data for date;
- user disabled processing.

---

# 18. GIS and map requirements

## MAP-001 — Personal global heatmap [P0]

User MUST have a map aggregating all route-enabled activities.

## MAP-002 — Filters [P0]

Heatmap supports at least:

- date range;
- sport;
- activity selection.

## MAP-003 — Intensity [P0]

Repeated traversal SHOULD be visually distinguishable from a route ridden/run once.

## MAP-004 — Performance [P0]

Map architecture MUST avoid sending thousands of full-resolution raw routes to the browser at once.

Implementation may use:

- precomputed simplified geometry;
- tiling;
- server-side aggregation;
- progressive loading.

## MAP-005 — MapLibre [P0 architecture direction]

Web mapping SHOULD use the MapLibre ecosystem.

## MAP-006 — Privacy zones [P0]

User can create at least one privacy zone.

Shared/public routes MUST:

- remove/mask geometry inside applicable zones;
- avoid revealing exact hidden start/end points;
- apply masking server-side before share payload is returned.

## MAP-007 — Private raw geometry [P0]

Private canonical geometry MUST remain separate from public/shareable geometry.

Conceptually:

```text
raw/private geometry
        ↓
privacy transformation
        ↓
shareable geometry
```

## MAP-008 — Map + training bridge [P1]

V1 SHOULD allow users to open an activity or saved analysis directly from map context so GIS is not an isolated feature.

## MAP-009 — Deferred advanced GIS [V2]

Not required in V1:

- road coverage percentage;
- unexplored roads;
- routing;
- personal segments;
- AI route generation;
- group heatmaps.

---

# 19. Custom analytics requirements

## QUERY-001 — Visual query builder [P1]

V1 MUST provide a no-code builder with:

### Filters

At minimum:

- sport;
- date range;
- duration;
- distance;
- elevation;
- average HR;
- max HR;
- average power;
- normalized/weighted power when available;
- average pace/speed;
- gear;
- tags.

### Aggregations

At minimum:

- count;
- sum;
- average;
- minimum;
- maximum;
- median where feasible;
- time-series trend.

### Grouping

At minimum:

- day;
- week;
- month;
- year;
- sport;
- gear.

### Visualizations

At minimum:

- KPI number;
- line chart;
- bar chart;
- table.

## QUERY-002 — Save analysis [P1]

User can name/save a query.

## QUERY-003 — Pin to dashboard [P1]

Saved analyses can become dashboard widgets.

## QUERY-004 — Safe execution [P0]

V1 MUST NOT execute arbitrary user JavaScript/SQL/formulas.

## QUERY-005 — Future formula language [V2]

A sandboxed custom metric/formula language is deferred.

---

# 20. AI requirements

## 20.1 AI product surfaces

### AI-001 — Ask Kinetexa [P1]

Persistent conversational interface for questions about the user’s own fitness data.

### AI-002 — Automatic insight cards [P1]

Kinetexa generates evidence-backed observations such as:

> “At similar heart rates, your average running pace improved over the last eight weeks.”

Automatic insights MUST be suppressible.

---

## 20.2 AI architecture

### AI-003 — Tool-grounded operation [P0]

AI MUST operate over deterministic tool calls rather than receive unrestricted access to the database.

Conceptual flow:

```text
user question
    ↓
intent + plan
    ↓
authorized Kinetexa tools
    ↓
structured evidence
    ↓
LLM explanation
    ↓
evidence links + caveats
```

### AI-004 — V1 deterministic tools [P1]

The AI orchestration layer SHOULD expose tools such as:

- `searchActivities`
- `getActivity`
- `compareActivities`
- `getTrainingLoad`
- `getFitnessFormHistory`
- `getRecords`
- `getZoneDistribution`
- `getHealthTrend`
- `runSavedAnalyticsQuery`
- `runAdHocAnalyticsQuery`
- `getMapSummary`
- `getGoalProgress`
- `getGearUsage`

Tools MUST enforce athlete authorization independently of the model.

### AI-005 — Evidence [P0]

Any quantitative statement MUST be traceable to structured evidence.

UI SHOULD display:

- metric;
- period;
- activities used;
- comparison period;
- links to underlying activities/analyses.

### AI-006 — No invented data [P0]

If a required metric is unavailable, AI MUST say it is unavailable.

### AI-007 — Consent [P0]

AI processing is opt-in.

Turning AI off MUST disable:

- chat;
- automatic AI insights;
- new transmission to third-party model providers.

Existing canonical analytics continue to function.

### AI-008 — Data minimization [P0]

AI receives the minimum structured context required for a request.

Raw GPS streams, exact home coordinates and full raw health records MUST NOT be sent by default.

### AI-009 — Provider restrictions [P0]

Data obtained under a provider API with AI-use restrictions MUST be excluded from external AI processing as required by that provider’s terms.

### AI-010 — Medical boundary [P0]

AI MUST NOT:

- diagnose;
- prescribe treatment;
- claim medical certainty;
- interpret emergencies.

It MAY:

- describe fitness/training trends;
- explain training metrics;
- recommend general training behavior with clear uncertainty;
- advise professional medical evaluation when a user asks about concerning health symptoms.

### AI-011 — Model abstraction [P1]

Hosted Kinetexa SHOULD use an internal AI provider interface so the model vendor can change without rewriting product logic.

### AI-012 — Cost controls [P0]

Hosted AI MUST support:

- per-user usage accounting;
- plan quotas;
- max tool-call depth;
- max context size;
- request timeout;
- cost telemetry;
- abuse/rate limits.

### AI-013 — Evaluation suite [P0]

Before launch, maintain an AI eval set covering:

- accurate period comparison;
- missing data;
- no hallucinated metrics;
- authorization isolation;
- medical boundary;
- privacy-sensitive requests;
- tool-call correctness;
- source/evidence fidelity.

---

# 21. Goals requirements

## GOAL-001 — V1 goal types [P0]

Support:

- weekly distance;
- monthly distance;
- weekly training time;
- monthly elevation;
- activity count;
- target race/event date;
- target race time;
- custom numeric goal.

## GOAL-002 — Progress [P0]

Goal page/widget MUST show:

- target;
- current;
- percent complete;
- time remaining;
- projected completion where simple/deterministic.

## GOAL-003 — Multiple goals [P1]

User SHOULD support multiple concurrent goals.

## GOAL-004 — Adaptive plans [V2]

AI-generated/adaptive training plans are deferred.

---

# 22. Training calendar

## CAL-001 — Calendar [P0]

V1 MUST provide day/week/month views suitable for training history.

## CAL-002 — Completed activities [P0]

Activities appear with sport, duration/load and status.

## CAL-003 — Manual planned workouts [P1]

User can create a basic planned workout with:

- title;
- sport;
- date/time;
- duration;
- description;
- optional target intensity.

## CAL-004 — Drag/move [P1]

Planned workouts SHOULD be movable between dates.

## CAL-005 — Adaptive planning [V2]

Automatic AI plan adaptation is deferred.

---

# 23. Gear requirements

## GEAR-001 — Gear types [P0]

Support:

- bicycle;
- running shoe;
- arbitrary equipment.

## GEAR-002 — Activity assignment [P0]

Gear may be manually assigned and SHOULD support provider-imported assignments.

## GEAR-003 — Usage totals [P0]

Track:

- distance;
- duration;
- activity count.

## GEAR-004 — Maintenance reminders [P1]

Support mileage/time-based reminders such as:

- chain service;
- tire replacement/check;
- shoe replacement;
- custom reminder.

## GEAR-005 — Archive/retire [P0]

Gear can be archived without deleting its historical associations.

---

# 24. Public sharing requirements

## SHARE-001 — Revocable share links [P1]

User can create public links for:

- selected activity;
- selected dashboard;
- selected statistics;
- selected map view.

## SHARE-002 — Explicit fields [P0]

Before sharing, user MUST see what fields will be public.

## SHARE-003 — Privacy transformation [P0]

Shared route payloads MUST use shareable/masked geometry.

## SHARE-004 — Health data [P0]

Health/recovery fields are excluded by default and require explicit selection if sharing is supported at all.

## SHARE-005 — Revoke [P0]

Share link can be revoked immediately.

## SHARE-006 — Optional expiry [P1]

User SHOULD be able to set expiry.

## SHARE-007 — Search indexing [P1]

Public share pages SHOULD default to `noindex` unless the user explicitly publishes a discoverable profile in a later social version.

---

# 25. Billing, Hosted Free and Premium

## 25.1 Business model

Kinetexa’s code/core personal analytics are open source.

Hosted Kinetexa monetizes:

- managed infrastructure;
- automatic synchronization;
- storage/backup convenience;
- higher AI usage;
- higher provider-connection limits;
- managed notifications;
- future network/social features.

## BILL-001 — Stripe subscriptions [P0]

V1 MUST include a functioning Premium upgrade.

Required:

- monthly plan;
- annual plan;
- Stripe Checkout;
- signed webhook handling;
- internal entitlement state;
- failed-payment handling;
- cancellation;
- customer portal;
- downgrade behavior.

## BILL-002 — Pricing configuration [P0]

Exact price is a launch/business configuration, not hard-coded product logic.

Recommended initial packaging:

### Hosted Free

- full core personal analytics;
- unlimited supported manual file imports under fair-use resource limits;
- full historical canonical dataset;
- one active automatic provider connection;
- standard sync priority;
- limited monthly AI usage;
- standard public share quota;
- standard managed storage/retention.

### Kinetexa Premium

- multiple automatic provider connections;
- higher/fair-use AI quota;
- priority backfill/reprocessing;
- enhanced managed backup/restore guarantees;
- more share/customization quotas;
- enhanced notifications/digests;
- future hosted-only network/social capabilities.

### Open Solo

- no Kinetexa subscription;
- full single-user personal analytics;
- no hosted social graph;
- self-host user supplies infrastructure and eventually their own AI credentials/provider.

## BILL-003 — No destructive downgrade [P0]

Downgrading MUST NOT delete canonical historical data merely because a plan limit decreases.

The system may:

- stop extra automatic connectors;
- reduce AI quota;
- reduce future managed-resource use.

## BILL-004 — Entitlement source of truth [P0]

Stripe is payment source of truth; Kinetexa stores derived entitlement state.

Webhook processing MUST be idempotent.

---

# 26. Mobile, PWA and accessibility

## UX-001 — Mobile-first [P0]

Core journeys MUST work at common mobile widths.

## UX-002 — Desktop excellence [P0]

Desktop is not a stretched mobile view. Dense analytics and charts SHOULD take advantage of available space.

## UX-003 — PWA [P1]

V1 SHOULD be installable as a PWA with:

- manifest;
- application icons;
- standalone display support;
- resilient application shell where practical.

Offline fitness-data editing is not required in V1.

## UX-004 — Browser support [P0]

Target latest two major versions of:

- Chrome;
- Edge;
- Firefox;
- Safari.

## UX-005 — Accessibility [P0]

Target WCAG 2.2 AA.

Required:

- keyboard navigation;
- visible focus;
- semantic form labels;
- sufficient contrast;
- reduced-motion support where appropriate;
- chart summaries/table alternatives for key data;
- touch targets appropriate for mobile.

## UX-006 — Design character [P0]

Visual direction:

> premium sports product with unusually deep technical controls.

Avoid:

- generic admin-dashboard feel;
- excessive developer jargon on default surfaces;
- dense configuration before value is shown.

---

# 27. V2 / later roadmap

Everything here is intentionally not a V1 launch blocker.

## 27.1 Provider expansion

- Polar;
- Wahoo;
- COROS;
- Suunto;
- Apple Health;
- Android Health Connect;
- Fitbit;
- additional device ecosystems;
- direct cloud-folder/watch-folder imports.

## 27.2 Advanced GIS

- road/street coverage percentage;
- unexplored roads;
- “ridden once” / “never visited” filters;
- personal segments;
- route similarity;
- geographic performance layers;
- route builder;
- “maximize new roads” routing;
- AI-generated exploration routes;
- group/joint heatmaps.

## 27.3 Training intelligence

- adaptive training plans;
- event/race plans;
- recovery-aware plan adjustment;
- planned structured workouts;
- workout-device export;
- deeper performance prediction.

## 27.4 Customization

- full dashboard canvas/grid builder;
- custom formula language;
- user-defined derived metrics;
- community-shared widgets/metrics;
- advanced query language.

## 27.5 Social/cloud-only

- following/friends;
- activity feed;
- kudos;
- comments;
- clubs;
- social challenges;
- shared goals;
- friendly competitions;
- group road coverage;
- collaborative maps;
- social discovery;
- public athlete profiles;
- push notifications.

## 27.6 Native mobile

- Expo/React Native or equivalent;
- shared TypeScript packages;
- push;
- deeper device integration.

## 27.7 Open Solo portability

- polished Docker Compose quick start;
- generic OIDC/local auth;
- alternative persistence adapter;
- S3-compatible storage configuration;
- optional self-host analytics;
- optional self-host email;
- AI BYO keys / local model;
- deployment recipes for AWS/Azure/GCP/VPS;
- Terraform modules.

## 27.8 Plugin ecosystem

Future extension points:

- `ProviderPlugin`
- `AnalyticsPlugin`
- `MetricPlugin`
- `DashboardWidgetPlugin`
- `ExporterPlugin`
- `AIPlugin`

## 27.9 Coaches / organizations

Only after consumer traction:

- athlete-coach authorization;
- teams;
- shared plans;
- cohort analytics;
- organization billing.

---

# 28. Conceptual data model

This is a product-level model; physical Convex/object-storage schemas are technical-design artifacts.

## 28.1 Core entities

### Athlete

- `athleteId`
- auth identity reference
- profile
- locale/timezone
- privacy settings
- thresholds
- plan/entitlements
- consent state

### ProviderConnection

- `connectionId`
- athlete
- provider
- provider user ID
- capability set
- encrypted credential reference
- scopes
- status
- last successful sync
- last reconciliation
- rate-limit state
- authorization metadata

### ImportJob

- job ID
- athlete
- type
- source
- status
- counts
- progress
- failures
- retry state

### SourceObject

- object ID
- athlete
- provider/import lineage
- content hash
- object-store key
- type
- byte size
- received time
- parser version

### Activity

- canonical summary fields
- sport/subsport
- route reference
- stream reference
- health/context references
- provenance
- privacy
- gear
- merge group

### ActivitySource

Many-to-one mapping between provider/source record and canonical activity.

### ActivityStream

Time-series representation or external blob/columnar reference.

### Lap / Split

Canonical lap/split records with source provenance.

### DerivedMetric

- metric name/type;
- target entity;
- numeric/structured value;
- algorithm version;
- parameters;
- source input IDs;
- calculated at.

### DailyHealthMetric

- date;
- signal type;
- value/structured record;
- source;
- provenance.

### Record

- type;
- sport;
- duration/distance;
- value;
- activity;
- period scope;
- validity state.

### Gear

- type;
- name;
- usage;
- maintenance thresholds;
- status.

### Goal

- type;
- target;
- period/event;
- progress.

### PlannedWorkout

- date;
- sport;
- description;
- target duration/intensity;
- completion linkage.

### SavedAnalysis

- filter AST;
- aggregation;
- grouping;
- visualization;
- owner.

### Dashboard

- widget layout;
- widget references;
- device/layout metadata.

### Share

- token;
- scope;
- fields;
- transformed geometry reference;
- expiry;
- revocation.

### AIConversation / AIMessage

Store only necessary product history according to privacy policy; raw prompts/responses MUST avoid leaking provider secrets.

### AuditEvent

Security/product-sensitive events.

---

# 29. Architecture constraints

## 29.1 Agreed V1 stack

### Frontend

- Next.js
- TypeScript
- shadcn/ui
- Tailwind CSS

### Application backend

- Convex

Use for:

- users;
- activities metadata;
- settings;
- goals;
- dashboards;
- billing entitlements;
- provider metadata;
- jobs/status;
- realtime application state;
- queries/mutations.

### Authentication

- WorkOS/AuthKit

### Hosting

- Vercel

### Object storage

- S3-compatible storage, with Cloudflare R2 as the preferred initial candidate for raw activity files and large generated artifacts.

### Processing

Heavy parsing/GIS/stream analytics MAY use a dedicated worker/service.

V1 starts with the simplest managed approach that satisfies reliability and performance, while worker contracts remain containerizable.

### Maps

- MapLibre GL JS ecosystem

### Product analytics

- PostHog

### Email

- Resend

### Billing

- Stripe

### Source/CI

- GitHub
- GitHub Actions

---

## 29.2 Architecture direction

```text
                        ┌──────────────────────────┐
                        │ Next.js / Vercel         │
                        │ Kinetexa Web + PWA       │
                        └────────────┬─────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
                ▼                    ▼                    ▼
          WorkOS Auth            Convex App          Stripe/Resend
                                     │
                      ┌──────────────┼──────────────┐
                      │              │              │
                      ▼              ▼              ▼
                 job orchestration  metadata    AI orchestration
                      │
                      ▼
              processing boundary
             parse / normalize / GIS
              analytics / dedup
                      │
          ┌───────────┴────────────┐
          ▼                        ▼
    S3-compatible raw store   canonical/derived
     (R2 candidate)             app records
```

## 29.3 “C” infrastructure strategy

The chosen path is:

1. **V1:** managed-first architecture for speed of delivery.
2. Worker APIs and data contracts are container-friendly.
3. **V1.x/V2:** demonstrate a stronger independent cloud processing path using container runtime, queue/event infrastructure and IaC.
4. Full self-host provider substitution comes later.

V1 MUST NOT introduce Kubernetes solely for portfolio optics.

---

# 30. Repository requirements

## REPO-001 — Monorepo [P0]

Recommended shape:

```text
apps/
  web/
  worker/

packages/
  analytics/
  fitness-data/
  fit-parser/
  gis/
  ai/
  ui/
  providers/
  security/
  config/

convex/
docs/
infra/
```

Physical details may change without PRD amendment if boundaries remain equivalent.

## REPO-002 — Public from the start [P0]

The Kinetexa core repository is public and AGPL-licensed from initial meaningful development.

## REPO-003 — Documentation [P0]

Repository MUST include:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- architecture overview;
- local development guide;
- threat model;
- data-flow diagram;
- provider compliance notes;
- release process;
- incident/runbook documentation as system matures.

## REPO-004 — ADRs [P1]

Significant architectural decisions SHOULD use Architecture Decision Records.

Examples:

- Convex boundary;
- raw storage selection;
- worker strategy;
- provider credential encryption;
- map/geometry representation;
- AI provider abstraction.

---

# 31. Security requirements

Security is a V1 product requirement, not a post-launch hardening phase.

## SEC-001 — Authorization [P0]

Every private data read/write MUST authorize against the authenticated athlete on the server/backend.

No record is trusted as accessible merely because its ID is unguessable.

## SEC-002 — Least privilege [P0]

Provider tokens, service accounts and deployment credentials MUST use minimum required permissions.

## SEC-003 — OAuth security [P0]

Where provider flow supports/requires:

- state validation;
- PKCE;
- exact redirect URI;
- CSRF defense;
- secure token exchange;
- refresh-token rotation handling.

## SEC-004 — Provider credentials [P0]

Provider access/refresh tokens:

- server-side only;
- never exposed to browser logs/analytics;
- encrypted at rest using application-managed/envelope encryption or equivalent;
- redacted from errors.

## SEC-005 — Webhook authenticity [P0]

Provider/Stripe webhooks MUST:

- verify signatures/challenges as supported;
- enforce replay/time-window defenses where possible;
- be idempotent;
- not trust client-provided identity.

## SEC-006 — Raw object access [P0]

Raw activity files are private.

Access MUST use short-lived authorized downloads or controlled application proxy behavior.

Long-lived public bearer URLs MUST NOT be used for sensitive raw objects.

## SEC-007 — File validation [P0]

See archive/upload requirements.

Parsers MUST be fuzzed or tested with malformed files.

## SEC-008 — Security headers [P0]

Web application SHOULD deploy appropriate:

- CSP;
- HSTS;
- frame protections;
- MIME sniffing protection;
- referrer policy;
- permissions policy.

MapLibre worker requirements must be reconciled with CSP deliberately.

## SEC-009 — Rate limiting [P0]

Rate limits MUST cover:

- auth-sensitive endpoints;
- upload URL creation;
- imports;
- public share endpoints;
- AI;
- expensive analytics queries;
- provider connection attempts.

## SEC-010 — Audit events [P0]

At minimum record:

- provider connected/disconnected;
- consent changed;
- privacy changed;
- export requested/completed;
- deletion requested/completed;
- share created/revoked;
- subscription changed;
- suspicious auth/security actions.

## SEC-011 — Dependency/security scanning [P0]

CI MUST include:

- dependency vulnerability scanning;
- secret scanning;
- SAST;
- lockfile integrity;
- container scanning once containers are introduced;
- SBOM generation for releases.

Recommended tools MAY include GitHub-native scanning, CodeQL, Trivy and Syft or equivalent.

## SEC-012 — Threat model [P0]

Threat model MUST cover at least:

- account takeover;
- IDOR/cross-user data access;
- provider-token theft;
- webhook forgery;
- file parser attack;
- decompression bomb;
- XSS;
- CSRF;
- SSRF;
- prompt injection into AI tool orchestration;
- AI data exfiltration;
- public share leakage;
- privacy-zone bypass;
- log leakage;
- supply-chain compromise;
- backup exposure;
- abusive compute/AI consumption.

## SEC-013 — Incident response [P0]

Repository/docs MUST define:

- severity classification;
- who/what is paged;
- containment steps;
- credential rotation;
- user/provider notification decision process;
- post-incident review.

## SEC-014 — Security disclosure [P0]

Public project MUST provide a responsible vulnerability disclosure path.

---

# 32. Privacy and data governance requirements

## PRIV-001 — Data categories [P0]

Kinetexa MUST classify:

- account/contact data;
- activity data;
- location data;
- health/recovery data;
- provider credentials;
- billing metadata;
- AI conversation data;
- product telemetry.

## PRIV-002 — Minimize collection [P0]

Do not collect fields solely because a provider returns them.

## PRIV-003 — PostHog [P0]

Product analytics MUST avoid ingesting raw health measurements, exact GPS route geometry or provider credentials.

Consent/opt-out behavior must match applicable jurisdiction and configured PostHog mode.

## PRIV-004 — AI privacy [P0]

See AI requirements.

## PRIV-005 — Export [P0]

User can export a machine-readable copy.

Target export should include:

- canonical activities;
- relevant derived metrics;
- settings;
- goals;
- gear;
- health/recovery records;
- saved analyses;
- raw/original activity files where permissible.

## PRIV-006 — Deletion [P0]

Deletion process MUST cover:

- application records;
- raw objects;
- derived caches;
- AI data controlled by Kinetexa;
- provider tokens;
- shares;
- billing linkage subject to legally required accounting retention.

## PRIV-007 — Privacy-zone test [P0]

Automated tests MUST verify hidden geometry cannot be retrieved through:

- share API;
- share HTML;
- Open Graph metadata;
- image previews;
- AI context;
- map tiles/cache.

---

# 33. Reliability and operations

## REL-001 — Idempotency [P0]

Provider ingestion, file processing and billing webhooks MUST be safe to retry.

## REL-002 — Job state machine [P0]

Long-running jobs MUST have explicit states such as:

```text
queued
running
waiting-provider
retrying
partial
complete
failed
canceled
```

## REL-003 — Retry policy [P0]

Retryable operations MUST use capped exponential backoff + jitter.

Permanent errors MUST NOT loop forever.

## REL-004 — Dead-letter / failed work [P0]

Failed ingestion work MUST remain inspectable and retryable by operators.

## REL-005 — User status [P0]

Provider issues MUST surface as meaningful UI states:

- connected;
- syncing;
- delayed;
- action required;
- provider outage;
- disconnected.

## REL-006 — Backup/restore [P0]

Hosted V1 MUST have a documented backup and restore strategy covering canonical metadata and raw objects.

Restore procedure MUST be tested before GA.

## REL-007 — Rebuildability [P1]

Derived analytics SHOULD be rebuildable from original/canonical data.

---

# 34. Observability

## OBS-001 — Structured logs [P0]

Logs MUST be structured and include correlation/job IDs.

Sensitive fields are redacted.

## OBS-002 — Tracing [P0]

Use OpenTelemetry-compatible tracing where supported.

Critical traces:

- provider webhook → ingestion;
- import → parsing → normalization → analytics;
- AI request → tools → model response;
- Stripe webhook → entitlement update.

## OBS-003 — Operational metrics [P0]

At minimum:

### Ingestion

- activities received;
- activities processed;
- failure rate;
- processing latency;
- queue depth;
- backfill progress;
- duplicate rate;
- merge confidence distribution.

### Provider

- webhook rate;
- auth failures;
- refresh failures;
- API error rate;
- quota/rate-limit state;
- freshness lag.

### Web

- request/error rate;
- response latency;
- Core Web Vitals.

### AI

- requests;
- latency;
- tool-call count;
- model errors;
- token/cost estimate;
- blocked/safety outcomes.

### Billing

- checkout success;
- webhook failures;
- entitlement mismatch.

## OBS-004 — Alerts [P0]

Alerts SHOULD cover:

- sustained ingestion failures;
- provider webhook outage;
- queue backlog;
- elevated cross-user authorization failures;
- storage errors;
- AI cost anomaly;
- Stripe webhook failure;
- export/deletion failure.

---

# 35. Service and performance targets

These are initial product targets and may be refined by measured baselines.

## PERF-001 — Web availability

Target hosted application availability: **99.9% monthly**, excluding announced maintenance and upstream-provider outages.

## PERF-002 — Core Web Vitals

At p75 on supported mobile browsers:

- LCP < 2.5 s;
- INP < 200 ms;
- CLS < 0.1.

## PERF-003 — Dashboard

Cached/normal dashboard interaction SHOULD feel immediate.

Target:

- initial useful dashboard content < 3 s under normal conditions;
- filter interaction < 1 s when data is already aggregated/cached.

## PERF-004 — Activity detail

Summary/route shell SHOULD render before heavy stream charts.

Large stream datasets MUST load progressively.

## PERF-005 — Single activity import

For typical individual FIT/TCX/GPX files, processing target is < 60 seconds after successful upload.

## PERF-006 — Bulk import

Bulk history processes asynchronously with visible incremental progress.

No fixed “all history in N minutes” guarantee because provider/archive size varies.

## PERF-007 — Provider freshness

See PROV-005.

## PERF-008 — AI

Target:

- visible “working” state immediately;
- first useful answer within 15 seconds p95 under normal model/provider conditions;
- long analytics work may stream progress.

---

# 36. Product analytics / PostHog events

Product analytics MUST use a documented event taxonomy.

## 36.1 Activation funnel

### Events

- `account_created`
- `onboarding_completed`
- `provider_connect_started`
- `provider_connected`
- `import_started`
- `import_completed`
- `first_activity_processed`
- `first_dashboard_viewed`
- `first_activity_analyzed`
- `first_map_viewed`
- `first_ai_question_asked`
- `first_saved_analysis_created`
- `premium_checkout_started`
- `premium_activated`

## 36.2 Retention/value events

- `dashboard_viewed`
- `activity_viewed`
- `date_range_changed`
- `metric_explanation_opened`
- `map_filter_applied`
- `analysis_query_run`
- `analysis_saved`
- `goal_created`
- `calendar_workout_planned`
- `gear_maintenance_created`
- `share_created`
- `share_revoked`
- `ai_question_asked`
- `ai_insight_opened`

## 36.3 Privacy rules

Events MUST NOT contain:

- raw HR/health values unless deliberately aggregated and approved;
- GPS coordinates;
- raw provider tokens;
- full AI prompts containing sensitive data by default;
- raw activity files.

---

# 37. Product KPIs

V1 focuses on usefulness and trust, not vanity signup counts.

## KPI-01 — Activation

A new user is activated when, within seven days:

1. at least one provider/import source is completed;
2. at least five activities are processed, or all available if fewer;
3. user views dashboard;
4. user opens at least one activity detail or map.

## KPI-02 — Time to value

Median time from account creation to first processed activity.

## KPI-03 — Import success

Percentage of supported uploaded files successfully parsed.

## KPI-04 — Sync reliability

Percentage of expected provider events eventually ingested without manual user reauthorization.

## KPI-05 — Weekly engaged athletes

Athletes who perform at least two high-value actions in a week:

- dashboard;
- activity analysis;
- map;
- custom analysis;
- AI question;
- goal/calendar.

## KPI-06 — Explainability engagement

Share of active users who open at least one metric explanation.

## KPI-07 — AI grounded-answer success

Evaluation + user-feedback rate for answers with valid evidence.

## KPI-08 — Premium conversion

Hosted activated users → Premium.

## KPI-09 — Churn

Monthly Premium cancellation.

## KPI-10 — OSS signal

- GitHub stars are secondary;
- more meaningful: successful self-host installs, contributors and external issues/PRs after Open Solo packaging.

---

# 38. Email requirements

## EMAIL-001 — Resend [P0]

Use Resend for Kinetexa-controlled transactional email.

Potential V1 emails:

- welcome/onboarding;
- bulk import completed;
- provider connection requires action;
- export ready;
- deletion confirmation;
- billing-related product notices not already handled by Stripe;
- optional weekly summary later.

## EMAIL-002 — Sensitive content [P0]

Do not include detailed health data or exact route information in email by default.

---

# 39. Testing strategy

## TEST-001 — Unit tests [P0]

Required for:

- parsers;
- normalization;
- training formulas;
- best-effort algorithms;
- privacy geometry transforms;
- dedup similarity functions;
- entitlement logic.

## TEST-002 — Golden activity fixtures [P0]

Repository SHOULD maintain sanitized synthetic/open test fixtures representing:

- running;
- cycling;
- GPS dropouts;
- pause/resume;
- multisensor;
- missing HR;
- missing GPS;
- power;
- corrupted FIT;
- unusual timezone;
- duplicate provider copies.

## TEST-003 — Integration tests [P0]

Cover:

- WorkOS auth boundary;
- provider OAuth callbacks with mocks;
- provider webhook signatures;
- object storage;
- Stripe webhooks;
- Resend abstraction;
- Convex authorization.

## TEST-004 — E2E [P0]

Browser E2E covers critical journeys:

- create/login;
- upload activity;
- view dashboard;
- view activity;
- build query;
- privacy share;
- upgrade;
- export/delete confirmation path.

## TEST-005 — Security tests [P0]

Include regression tests for:

- cross-user access;
- share-token access;
- privacy-zone leaks;
- malformed upload;
- ZIP bomb limits;
- webhook replay;
- rate limit;
- AI tool authorization.

## TEST-006 — Accessibility tests [P1]

Automated a11y checks plus manual keyboard/screen-reader smoke test for critical journeys.

## TEST-007 — Load/performance tests [P1]

Test:

- large athlete history;
- high-frequency activity stream;
- bulk upload;
- dashboard with years of data;
- heatmap with thousands of routes;
- concurrent AI requests.

---

# 40. CI/CD and environments

## CICD-001 — Environments [P0]

At minimum:

- local;
- preview;
- staging;
- production.

## CICD-002 — Pull request checks [P0]

PR gate:

- formatting;
- lint;
- TypeScript;
- unit tests;
- integration tests appropriate to changed packages;
- security scanning;
- build.

## CICD-003 — Preview deploys [P0]

Frontend PRs SHOULD have Vercel preview deployments where secrets/data isolation permits.

## CICD-004 — Production deploy [P0]

Production release MUST be reproducible from Git commit/tag.

## CICD-005 — Migration safety [P0]

Schema/data changes MUST:

- be backward-compatible where rollout requires;
- avoid unrecoverable destructive mutation in the same release as code dependency;
- document reprocessing impact.

## CICD-006 — Release artifacts [P1]

Release SHOULD include:

- changelog;
- SBOM;
- build provenance where practical;
- versioned analytics/parser package versions.

---

# 41. Open-source and hosted boundary

## OSS-001 — AGPL core [P0]

Personal Kinetexa core is released under AGPL-3.0 direction, subject to final legal review before public launch.

## OSS-002 — Public development [P0]

Core product development occurs publicly unless a security issue requires private handling.

## OSS-003 — Hosted-only network functionality [P1/V2]

Future social graph/network services may live outside Open Solo where they inherently depend on a shared hosted network.

## OSS-004 — No fake self-host claim [P0]

V1 README MUST distinguish:

- “source is open and locally developable now”;
- “polished one-command Open Solo package” when it actually exists.

## OSS-005 — Open Solo packaging [immediate V1.x]

Per agreed sequencing:

1. hosted V1 is first deployment target;
2. repository is open-source from the start;
3. polished Open Solo/Docker deployment is packaged immediately after hosted V1 rather than blocking hosted launch.

---

# 42. Legal/compliance constraints

## LEGAL-001 — Provider terms [P0]

See PROV-008/009.

## LEGAL-002 — Fitness vs medical [P0]

Product terms/UI MUST state Kinetexa is not a medical diagnostic service.

## LEGAL-003 — Data protection [P0]

Hosted product must be designed for GDPR-compatible operation including:

- data minimization;
- purpose limitation;
- user access/export;
- deletion;
- processor/subprocessor inventory;
- consent where required;
- privacy policy;
- retention rules.

This PRD is not legal advice; final policies require legal review.

## LEGAL-004 — License boundary [P0]

Before launch, review:

- AGPL obligations;
- hosted proprietary/network modules;
- third-party library licenses;
- map/tile data licenses;
- sports metric terminology/trademarks.

## LEGAL-005 — Brand clearance [P0 business gate]

Before major brand spend:

- domain ownership;
- EUIPO/BOIP trademark search;
- appropriate international collision checks;
- GitHub/social handles.

---

# 43. Current external platform constraints (2026-09-06)

This section records implementation-relevant facts that can change and MUST be re-verified before integration launch.

## 43.1 Strava

- Strava’s API Agreement effective June 1, 2026 states developers may not create applications that compete with or replicate Strava functionality.
- Strava API data from a user has display/disclosure limitations.
- Strava OAuth uses OAuth2.
- Current default rate limits are documented on the developer site.
- Direct Strava integration is therefore conditional and non-blocking.
- User-owned bulk export import is the strategic migration path.

## 43.2 Garmin

Garmin’s Activity API documentation states:

- access to detailed fitness activity data;
- push/pull integration choices;
- backfill support;
- access to full activity detail files including FIT/GPX/TCX;
- production access requires program approval.

Garmin’s Health API supports health metrics including sleep, HR, stress and more; official documentation notes commercial use requires a license fee.

Kinetexa MUST therefore treat Garmin Activity and Health access/licensing separately.

## 43.3 Polar

Polar AccessLink supports OAuth2 and exercise/activity access. Current documentation indicates historical availability constraints for some exercise endpoints, so Polar is useful as a future “connect once” source but not assumed to provide unlimited pre-registration history.

## 43.4 Convex

Convex supports:

- actions;
- scheduled functions;
- cron jobs;
- file storage.

Its scheduled functions/actions have different retry semantics, so idempotent external side effects remain Kinetexa’s responsibility.

Convex file URLs can behave like bearer URLs; sensitive raw activity files therefore SHOULD use controlled authorization/expiring-object access, supporting the choice of separate S3-compatible storage.

## 43.5 Cloudflare R2

R2 exposes an S3-compatible API and is a suitable initial raw-object-store candidate.

## 43.6 WorkOS

AuthKit has a supported Next.js SDK for App Router, fitting the chosen frontend architecture.

## 43.7 Stripe

Stripe Billing supports recurring subscription lifecycle and customer self-service management, fitting the hosted Free/Premium model.

## 43.8 MapLibre

MapLibre GL JS is a TypeScript/WebGL map rendering library with Next.js-compatible integration paths. CSP must account for its worker configuration.

---

# 44. Milestone plan

Milestones are vertical slices. Infrastructure without visible user value should not dominate a milestone.

## M0 — Foundation

Deliver:

- monorepo;
- Next.js/shadcn shell;
- WorkOS auth;
- Convex environment;
- CI;
- basic observability;
- privacy/settings skeleton;
- public AGPL repository;
- architecture/threat-model skeleton.

**Exit:** authenticated user can reach private app shell in preview/staging.

---

## M1 — Canonical activity vertical slice

Deliver:

- single FIT upload;
- object storage;
- parser;
- canonical activity;
- one activity page;
- route;
- HR/speed/elevation chart;
- provenance;
- basic authorization tests.

**Exit:** uploaded FIT produces a real premium-looking activity view.

---

## M2 — Historical import engine

Deliver:

- multi-file upload;
- TCX/GPX;
- Strava export ZIP;
- async jobs;
- progress;
- retries;
- raw source retention;
- dedup;
- reprocessing.

**Exit:** user can import years of history safely.

---

## M3 — Dashboard + training core

Deliver:

- dashboard;
- range filters;
- zones;
- training load;
- fitness/fatigue/form;
- records;
- power/pace curves;
- metric explainability.

**Exit:** Kinetexa becomes useful as a daily analytics product.

---

## M4 — Maps + privacy

Deliver:

- personal heatmap;
- filters;
- privacy zones;
- public/private geometry separation;
- share transformation tests.

**Exit:** product has a memorable map pillar.

---

## M5 — Persistent provider sync

Deliver:

- provider connector framework;
- Garmin integration if approved;
- historical backfill;
- push/webhook;
- reconciliation;
- provider status;
- rate limits.

**Exit:** at least one provider supports real connect-once use.

---

## M6 — Custom analytics + goals + calendar + gear

Deliver:

- visual query builder;
- save/pin;
- goals;
- calendar;
- gear;
- maintenance.

**Exit:** power-user customization is visible.

---

## M7 — AI intelligence

Deliver:

- AI consent;
- deterministic tools;
- Ask Kinetexa;
- automatic insight cards;
- evidence UI;
- eval suite;
- cost limits;
- medical boundary.

**Exit:** AI demonstrates unique grounded fitness intelligence.

---

## M8 — Sharing + Hosted Premium

Deliver:

- public share links;
- Stripe Free/Premium;
- checkout;
- portal;
- entitlements;
- Resend transactional email.

**Exit:** hosted product can convert a paying user.

---

## M9 — Production hardening

Deliver:

- performance work;
- accessibility;
- security test completion;
- backup/restore drill;
- incident runbooks;
- alerts;
- load tests;
- data export/delete;
- privacy review;
- provider compliance review.

**Exit:** GA launch gates pass.

---

## M10 — Open Solo packaging (immediate V1.x)

Deliver:

- Docker Compose or equivalent one-command path;
- self-host docs;
- hosted-service dependencies documented;
- first substitution points;
- local storage/AI instructions as required.

This follows hosted V1 and does not block hosted GA.

---

# 45. Launch gates

Kinetexa MUST NOT claim V1 GA until all P0 gates pass.

## Product gate

- [ ] New user can complete onboarding.
- [ ] FIT/TCX/GPX work.
- [ ] Strava bulk ZIP import works.
- [ ] At least one connect-once provider is available OR launch is clearly labeled beta while external approval remains the only blocker.
- [ ] Dashboard is complete.
- [ ] Rich activity detail is complete.
- [ ] Required training analytics are complete.
- [ ] Records are independently computed.
- [ ] Basic health/recovery works where supplied.
- [ ] Heatmap + privacy zones work.
- [ ] Visual query builder works.
- [ ] AI chat + evidence work for consented users.
- [ ] Goals/calendar/gear work.
- [ ] Share links are revocable/private-safe.
- [ ] Premium upgrade works.
- [ ] Export/delete work.
- [ ] Mobile core journeys pass.

## Trust gate

- [ ] Derived metrics expose explanations.
- [ ] Provenance is inspectable.
- [ ] Missing data is communicated honestly.
- [ ] AI eval set passes agreed threshold.
- [ ] No known cross-user data access vulnerabilities.
- [ ] Privacy-zone leak tests pass.

## Security gate

- [ ] Threat model reviewed.
- [ ] Provider credentials encrypted/protected.
- [ ] Webhooks authenticated.
- [ ] Rate limits active.
- [ ] File/archive abuse controls active.
- [ ] SAST/dependency/secret scans clean to agreed severity.
- [ ] SBOM generated.
- [ ] Responsible disclosure path exists.
- [ ] Incident process documented.

## Reliability gate

- [ ] Job retries/idempotency tested.
- [ ] Provider/import failure states are user-visible.
- [ ] Backup exists.
- [ ] Restore drill completed.
- [ ] Alerts configured.
- [ ] Observability dashboards exist.

## Legal/platform gate

- [ ] Provider terms re-verified.
- [ ] No non-compliant Strava API usage.
- [ ] Garmin licensing/access status documented.
- [ ] Open-source license review complete.
- [ ] map/tile licenses reviewed.
- [ ] privacy/terms documents ready.

## Portfolio-quality gate

- [ ] README explains architecture and tradeoffs.
- [ ] diagrams exist.
- [ ] CI/CD is visible.
- [ ] security posture is visible.
- [ ] observability screenshots/docs exist.
- [ ] meaningful ADRs exist.
- [ ] project can be demonstrated end to end without hidden manual steps.

---

# 46. Explicit V1 non-goals

V1 MUST NOT be delayed to:

- reproduce Strava’s entire social graph;
- ship clubs/coaches/organizations;
- support every fitness provider;
- implement a native mobile app;
- create a generic plugin ecosystem;
- make every cloud dependency swappable;
- implement road coverage/routing;
- build full adaptive AI training plans;
- deploy Kubernetes without a real requirement;
- create arbitrary user-code execution;
- make Kinetexa a medical diagnostic product.

---

# 47. Key risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Strava policy blocks direct sync | High | Bulk export is first-class; Strava API non-blocking; provider diversity. |
| Garmin approval/licensing delay | High | File import works independently; keep connector abstraction; promote another provider. |
| Scope is extremely large | High | Milestone vertical slices; P0/P1 gates; no social/native/advanced GIS in V1. |
| Time-series data becomes expensive | High | Raw object storage, derived summaries, progressive loading, preaggregation. |
| Heatmap becomes slow | High | Simplification/tiling/server aggregation. |
| AI cost grows quickly | High | quotas, telemetry, tool limits, compact structured context. |
| AI gives unsafe/wrong fitness advice | High | deterministic tools, evidence, evals, medical boundary. |
| Health/location privacy breach | Critical | private defaults, authz, encryption, privacy zones, least privilege, leak tests. |
| Provider duplicates produce wrong stats | High | dedup confidence + reversible merge + provenance. |
| Analytics formula mistakes undermine trust | High | tests, explainability, versioning, reprocessing. |
| OSS/hosted licensing boundary unclear | Medium/High | legal review + explicit package/service boundary. |
| Vercel/Convex perceived as weak portfolio signal | Low | show deliberate architecture, workers, storage, CI/CD, security, observability, IaC evolution. |
| Paid hosted plan lacks differentiation | Medium | sell managed sync, AI quota, connections, reliability and future network value rather than hiding analytics. |

---

# 48. Decisions intentionally left configurable

These do **not** block implementation and should be resolved by technical design or pre-launch business configuration:

- exact Premium price;
- exact Free/Premium quotas;
- final AI model provider;
- final R2 vs alternate S3-compatible object store decision;
- exact worker runtime in earliest milestone;
- exact map tile provider/style;
- exact provider fallback after Garmin;
- final product tagline;
- final metric naming after trademark review;
- final retention/grace periods;
- exact alert thresholds after baseline traffic exists.

---

# 49. Definition of done for a feature

A feature is not “done” merely when UI renders.

For P0/P1 V1 features, definition of done includes applicable:

1. functional acceptance criteria;
2. authorization;
3. privacy behavior;
4. responsive/mobile behavior;
5. loading/empty/error states;
6. accessibility;
7. analytics events;
8. logs/metrics;
9. tests;
10. documentation;
11. feature flag/rollback strategy when risky;
12. provider/legal constraints where relevant.

---

# 50. Recommended first end-to-end build slice

Before building dozens of independent pages, prove the central thesis:

```text
Account
  ↓
Upload one FIT
  ↓
Preserve original
  ↓
Canonical activity
  ↓
Rich activity detail
  ↓
One training metric
  ↓
Explain the metric
  ↓
Route map
  ↓
Grounded AI explanation
```

This slice simultaneously validates:

- authentication;
- data ownership;
- object storage;
- parsing;
- canonical schema;
- analytics;
- GIS;
- AI grounding;
- premium UX;
- provenance;
- security boundaries.

Once this slice is excellent, scale outward into bulk import, dashboard and provider synchronization.

---

# 51. Official technical references

These links are implementation constraints/references and must be rechecked before release.

## Strava

- API Agreement (effective June 1, 2026): https://www.strava.com/legal/api
- API Policy (effective June 1, 2026): https://www.strava.com/legal/api_policy
- Authentication: https://developers.strava.com/docs/authentication/
- Rate limits: https://developers.strava.com/docs/rate-limits/

## Garmin

- Activity API: https://developer.garmin.com/gc-developer-program/activity-api/
- Health API: https://developer.garmin.com/gc-developer-program/health-api/

## Polar

- AccessLink API: https://www.polar.com/accesslink-api/
- Dynamic API v4: https://www.polar.com/polar-api-v4/

## Convex

- Actions: https://docs.convex.dev/functions/actions
- Scheduled functions: https://docs.convex.dev/scheduling/scheduled-functions
- Cron jobs: https://docs.convex.dev/scheduling/cron-jobs
- File storage: https://docs.convex.dev/file-storage/overview

## WorkOS

- AuthKit: https://workos.com/docs/authkit
- AuthKit Next.js SDK: https://workos.com/docs/sdks/authkit-nextjs

## Vercel

- Cron jobs: https://vercel.com/docs/cron-jobs/quickstart
- Functions: https://vercel.com/docs/functions

## Cloudflare R2

- S3 API: https://developers.cloudflare.com/r2/get-started/s3/
- S3 compatibility: https://developers.cloudflare.com/r2/api/s3/api/

## Stripe

- Subscription overview: https://docs.stripe.com/billing/subscriptions/overview

## Resend

- Send email API: https://resend.com/docs/api-reference/emails/send-email

## PostHog

- Product website/docs entry: https://posthog.com/docs

## MapLibre

- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/

---

# 52. Final alignment statement

This PRD defines Kinetexa V1 as **both**:

1. a real hosted consumer fitness product with a working Free → Premium subscription path; and
2. an open-source product whose code is public from the start.

The immediate priority is the hosted Vercel/Convex experience. The public source code must remain meaningful from the beginning, while polished one-command Open Solo deployment follows immediately after hosted V1 rather than delaying the hosted launch.

The product’s competitive identity is **not** “free Strava.”

It is:

> **a user-owned fitness intelligence layer that unifies data, makes training science explainable, combines analytics with maps, and uses grounded AI to help athletes understand and act on their own history.**

---

**END OF KINETEXA V1 PRD**
