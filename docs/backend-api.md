# Backend verification API

The Convex API uses WorkOS access tokens. Construct a `ConvexHttpClient` with the configured deployment URL and call `setAuth(workosAccessToken)`. Keep tokens out of logs and source control. Every private operation resolves the active athlete on the server.

## Deterministic analytics

`analytics:calculate` accepts `{ request }`, validated by `packages/core/ai.ts`'s closed tool schema. It performs calculations without an AI provider, AI consent or AI quota. It supports activity search/detail/comparison, load, fitness/form and rolling comparisons, records, zones, health trends, saved/ad-hoc queries, map summaries, goals and gear usage. Entity IDs must belong to the authenticated athlete. The separate AI workflow applies source-policy and consent restrictions before model use.

```ts
await client.action("analytics:calculate", {
  request: {
    callId: "weekly-load",
    tool: "getTrainingLoad",
    period: { from: "2026-09-01", to: "2026-09-07", comparison: "previous" },
  },
});
```

Results carry units, date ranges, contributing activity IDs, reproducible queries, formulas/versions and missing-data caveats. Dates use the athlete's timezone. `analytics:dashboard` accepts UTC millisecond `from`/`to` bounds and returns complete-period summaries and curves without copying every activity into the result.

## Streams and retained sources

`imports:enqueue({ id })` starts an uploaded file or retries a failed/partial source. A child retry also refreshes its parent archive's aggregate status. Retrying a whole archive reuses completed children and retries failed children, preserving successful activities. Stale workers cannot publish into a newer attempt. A terminal `partial` archive remains partial when a malformed child fails again; clients should display its child failure counts and retained original rather than promise that retry repairs invalid input.

- `processing:stream({ id, from?, to? })`: an authorized chart view capped at 2,000 samples, preserving recording gaps through reduction. Extra decoded source fields are omitted from this bounded view.
- `processing:canonical({ id })`: a short-lived authorized download URL for the complete canonical stream, including source fields and device/developer metadata.
- `processing:interval({ id, from, to })`: interval summary, metrics, actual recorded boundaries and coverage caveats. Bounds are elapsed seconds.
- `processing:original({ id })`: a short-lived download for a retained source ID; its checksum is available through activity provenance.
- `activities:provenance({ id })`: original checksums, part indexes, parser versions and prior metric/summary/stream versions.
- `reprocessing:request({ id? })`: rebuild one retained source or all eligible sources in paginated background work. Read status through `imports:owned` or `imports:page`.

History endpoints `activities:page`, `imports:page` and `health:page` use Convex pagination cursors. Continue until `isDone`; an empty filtered page can still have a continuation cursor. Legacy list endpoints explicitly reject oversized history rather than returning silently truncated totals.

`activityFacts:prepare` resumes numerical index preparation and returns true when complete. Normal analytics actions perform this step automatically. `activityFacts:page` reads the complete owned index with stable date bounds; it omits geometry and private notes. Internal `activityFacts:rebuild` marks an account for repair after an operator imports canonical metadata directly. Application mutations keep the index current transactionally.

## Workspace maintenance

`workspace:page({ table, paginationOpts, from?, to? })` reads owned plans, goals, gear, analyses, privacy zones, shares, lifecycle jobs or messages, with at most 100 records and a 2 MB read bound per page. Continue until `isDone`. Only planned workouts accept `from`/`to`, inclusive UTC millisecond bounds; those results are ordered by start time descending. Messages use newest message time first; other collections use newest creation first. `workspace:overview` remains a compatibility endpoint for small workspaces. New frontend collections should use the paginated API.

`queryActions:preview` uses the athlete's timezone for day/week/month/year groups unless `query.timezone` explicitly overrides it. Its `from`/`to` filters remain UTC millisecond instants. Deterministic goal, gear and saved-analysis calculations read complete paginated collections and avoid fetching unrelated plans, messages or jobs.

`workspace:saveZone` accepts an optional existing zone ID for edits. `workspace:remove` deletes an owned goal, planned workout, saved analysis or privacy zone. Other account data is preserved. Plans validate sport, dates and intensity size; race results must be positive and event completion uses zero/one. Changing the profile timezone schedules retained-source reprocessing.

Share tokens must be unique. Expiring links are revoked by a durable scheduled mutation as well as checked on access. Account export and deletion share one owned-table registry, including AI runs and insights.

## Gear maintenance

`gear:status` reads usage across paginated canonical history, excluding merged duplicates, and returns each gear item's distance, duration and activity count. Distance coverage is explicit. Retired gear keeps its totals and service history but has no active due reminders. Results describe a read window; edits made during traversal can require a refresh.

`gear:saveReminder` creates or edits a custom reminder with a distance interval in kilometres, duration interval in hours, a due date in UTC milliseconds, or a combination. Omitted optional thresholds clear previous values. `disabled` pauses a reminder. `gear:completeService({ id, at, note })` records service and resets its usage baseline; repeating the same reminder/date returns the same event. One-off due dates are cleared after completion. `gear:history` uses normal pagination. Reminder and service records are included in export, backup and deletion.

## Billing and delivery

Subscription refreshes are ordered by the last applied revision. A completed read may publish while a newer request is pending, but cannot overwrite a newer applied result. A refund does not itself cancel a Stripe subscription; cancellation is a separate operation. Sandbox renewal, failed payment, recovery and cancellation have been verified with unchanged canonical data.

`billingActions:checkout({ interval })` reuses the account's pending Stripe session. `billingActions:cancelCheckout({})` expires that session before a plan change. `billingActions:refreshCurrent({})` reconciles current Stripe subscriptions; `billing:current` returns server-calculated `premium` and `checkoutPending` flags. Paid-period expiry is enforced even when a webhook is missing. Reconciliation also runs hourly and at the paid-period boundary.

`email:page` provides private paginated delivery history without cached recipient bodies or idempotency keys. Bounces and complaints suppress subsequent application email. Uncertain delivery after the safe retry window is exposed as `delivery-unknown` for operator review.

## Account exports

`lifecycle:requestExport` starts a resumable export. `exports:retry({ id })` resumes a failed job from completed parts. `exports:list({ id, cursor })` lists owned part metadata and SHA-256 checksums; `exportActions:downloadPart({ id, index })` signs a short-lived URL after checking ownership, completion and expiry. `lifecycleActions:download({ id })` returns the single ZIP for small accounts or the part manifest for larger exports. Download every part, verify its checksum and extract all parts together. Temporary files expire seven days after the request. Metadata pages record their read times; the export is not a frozen database snapshot.

## Deletion and recovery

Deletion locks the account immediately and starts after fifteen minutes. Each destructive batch checks the owner and current attempt. Failures retry up to four times; operators can invoke internal `lifecycle:retryDeletion` for a failed job. A backup tombstone is written before removing records or objects. The queued confirmation cannot send while the athlete record exists; its recipient is removed after provider acceptance. Failed/abandoned notice recipients are pruned. See `backup-and-recovery.md` for restore filtering.

## Verification evidence

`telemetry:track({ event })` accepts the documented frontend event names only after optional analytics consent. `telemetry:page` returns the owner's paginated event/status history. Server-generated events cannot be spoofed through the client endpoint. External capture remains gated on verified erasure configuration. See `product-analytics.md`.

`providers:catalog` returns file-import formats and each direct provider's approval/terms status and unverified capabilities. `providers:connect` rejects all currently gated direct connections. See `provider-compliance.md`; persistent sync is still an external and implementation dependency.

`docs/verification-staging.md` records hosted outcomes. Automated tests use synthetic fixtures and independent owners. Live verification accounts, tokens, temporary source files and detailed operational artifacts remain in ignored local storage.

# Internal product measurement

`productKpis:report({from,to})` returns private operator aggregates for a period up to 31 days within the retained last 90 days. It reports observed activation, retained first-activity timing, terminal root-import success, weekly engagement, explainability, current Premium conversion and observed cancellation. Pending work, missing history and unavailable KPIs are explicit. This internal action is inaccessible to ordinary or anonymous clients. See [product analytics](product-analytics.md) for consent and denominator definitions.

## AI answer feedback

`ai:feedback({messageId,helpful})` sets a private helpful/unhelpful rating on an owned completed assistant answer with validated evidence. Set `helpful` to `null` to remove it. Repeating the same rating preserves its timestamp. Ratings appear with `ai:messages`, are included in account export and disappear with account deletion. Rating does not invoke a model or consume AI quota. It does not require renewed AI consent to manage an existing answer.

## Complete provenance histories

`activities:provenance` returns a bounded overview and `hasMore.sources` / `hasMore.history`. Use `activities:provenancePage({id,kind,paginationOpts})` for every retained source or calculation snapshot. `kind` is `sources` or `history`; follow the continuation cursor until `isDone`, even if a page is empty. Source pages contain at most 100 rows, history pages at most 25, with a 2 MB database read bound per page. Both APIs require ownership of the activity and exclude foreign-owner records.

## Public sharing

`sharing:preview` and `sharing:create` require one to 100 distinct owned activity IDs, a supported kind (`activity`, `dashboard`, `statistics`, `map`) and distinct explicitly selected public fields. Empty fields, unknown fields and duplicate activities are rejected. Public reads project only allowed fields, use the owner's local calendar date and apply current privacy masks on every request. Existing links with repeated IDs also return each activity once.

For dashboard/statistics shares, `totals` contains only selected distance, duration or elevation fields. Each entry has `value`, `unit`, `measuredCount` and `missingCount`. No usable measurements gives `null`; recorded zero stays zero. A partial sum must be presented with its missing count. Other share kinds return empty totals. The existing frontend still calculates its own display summary; use these server totals during the user's frontend work.

Preview and public reads use the same projection. `sharing:revoke` makes a link unavailable immediately. Reads also reject at the expiry instant and when the owner is no longer active, independently of scheduled cleanup. Revoked audit records remain in private history until account deletion.
