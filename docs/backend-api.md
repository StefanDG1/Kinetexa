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

- `processing:stream({ id, from?, to? })`: an authorized chart view capped at roughly 2,000 samples. Extra decoded source fields are omitted from this bounded view.
- `processing:canonical({ id })`: a short-lived authorized download URL for the complete canonical stream, including source fields and device/developer metadata.
- `processing:interval({ id, from, to })`: interval summary, metrics, actual recorded boundaries and coverage caveats. Bounds are elapsed seconds.
- `processing:original({ id })`: a short-lived download for a retained source ID; its checksum is available through activity provenance.
- `activities:provenance({ id })`: original checksums, part indexes, parser versions and prior metric/summary/stream versions.
- `reprocessing:request({ id? })`: rebuild one retained source or all eligible sources in paginated background work. Read status through `imports:owned` or `imports:page`.

History endpoints `activities:page`, `imports:page` and `health:page` use Convex pagination cursors. Continue until `isDone`; an empty filtered page can still have a continuation cursor. Legacy list endpoints explicitly reject oversized history rather than returning silently truncated totals.

## Workspace maintenance

`workspace:saveZone` accepts an optional existing zone ID for edits. `workspace:remove` deletes an owned goal, planned workout, saved analysis or privacy zone. Other account data is preserved. Plans validate sport, dates and intensity size; race results must be positive and event completion uses zero/one. Changing the profile timezone schedules retained-source reprocessing.

Share tokens must be unique. Expiring links are revoked by a durable scheduled mutation as well as checked on access. Account export and deletion share one owned-table registry, including AI runs and insights.

## Billing and delivery

`billingActions:checkout({ interval })` reuses the account's pending Stripe session. `billingActions:cancelCheckout({})` expires that session before a plan change. `billingActions:refreshCurrent({})` reconciles current Stripe subscriptions; `billing:current` returns server-calculated `premium` and `checkoutPending` flags. Paid-period expiry is enforced even when a webhook is missing. Reconciliation also runs hourly and at the paid-period boundary.

`email:page` provides private paginated delivery history without cached recipient bodies or idempotency keys. Bounces and complaints suppress subsequent application email. Uncertain delivery after the safe retry window is exposed as `delivery-unknown` for operator review.

## Account exports

`lifecycle:requestExport` starts a resumable export. `exports:retry({ id })` resumes a failed job from completed parts. `exports:list({ id, cursor })` lists owned part metadata and SHA-256 checksums; `exportActions:downloadPart({ id, index })` signs a short-lived URL after checking ownership, completion and expiry. `lifecycleActions:download({ id })` returns the single ZIP for small accounts or the part manifest for larger exports. Download every part, verify its checksum and extract all parts together. Temporary files expire seven days after the request. Metadata pages record their read times; the export is not a frozen database snapshot.

## Verification evidence

`docs/verification-staging.md` records hosted outcomes. Automated tests use synthetic fixtures and independent owners. Live verification accounts, tokens, temporary source files and detailed operational artifacts remain in ignored local storage.
