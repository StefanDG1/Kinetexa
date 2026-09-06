# Operating the backend

Production athlete APIs remain closed with `KINETEXA_ENVIRONMENT=production` and `KINETEXA_APP_ENABLED=false`. The public website remains the holding page. Deploying backend functions does not open registration or establish V1 completion.

## Private operator access

Use the Convex admin client with the deployment key from private configuration. These functions are internal. Authenticated athlete accounts and anonymous clients cannot call them.

- `operations:jobs({kind,status,cursor})` pages through import, reprocess, export, deletion and email queues. It excludes original names, storage keys and email payloads. Each response returns up to 100 rows and a continuation cursor.
- `operations:events({since,until,cursor})` pages through events for an ordered window of at most 31 days, up to 1,000 rows per page with a 4 MB read bound.
- `operations:check({})` aggregates the last 24 hours of events and current queues. It reports outcomes, measured latency, bytes, AI tokens and estimated cost, queue age and alert changes. This is a sequence of reads, not an atomic snapshot.
- `operations:latest({})` reads the latest aggregate checkpoint and active alert names.
- `operations:retry({kind,id})` retries eligible failed retained imports, reprocessing, unexpired exports and deletion. Account/job state remains enforced and an audit event records the retry. Email delivery with an uncertain outcome requires private provider review because retrying after the provider's idempotency window can send duplicates.

Never copy private event responses, deployment keys or job errors into public issues or Actions logs.

## Events and traces

Verified Stripe and Resend webhook handling records separate provider outcomes: accepted, ignored, duplicate or failed. Repeating the same provider event and outcome does not add another observation. These count logical outcomes, not every HTTP delivery attempt. Metrics and failure alerts use `webhook:stripe` and `webhook:resend`; five failed outcomes at or above 20% of a day's observations trigger the respective provider alert. Invalid signatures never create database observations. Payloads, signatures, customer IDs and recipient addresses are excluded. An observation failure is logged without changing the webhook's processing result.

Webhook timing covers the verification/processing action, not the complete HTTP request. OTLP exports identify the provider with `kinetexa.webhook.provider`. Full distributed traces, unauthenticated traffic metrics and absence-of-delivery monitoring remain open. Stripe notifications with no Kinetexa billing record are acknowledged as ignored, including late notifications after account deletion.

Import, reprocessing, export, deletion, accepted email attempts, AI outcomes and accepted billing updates record structured events. Job IDs correlate retries. Idempotent event keys avoid counting the same finalized attempt twice. Logs omit names, email addresses, prompts, geometry, file contents and response bodies.

`scripts/export-traces.mjs` converts the last hour of events into OTLP JSON envelopes in an ignored local file. Set `OPS_CONFIG` privately with `environment`, `convexUrl` and `deploymentKey`. Output creation never overwrites an existing file. Trace timing is marked unknown when a job did not record a start time. These are coarse job spans; nested parser, model/tool, provider and web request spans and an external collector remain open work. No paid Vercel drain was enabled.

Operational events expire after 30 days. Athlete-owned events follow account export and deletion. The final deletion event has no athlete owner. Aggregate checkpoints contain counts and measurements, not athlete IDs.

## Scheduled checks and response

Resend Free uses one account across environments. Transactional send attempts are reserved atomically against daily allocations of 80 production, 5 staging and 5 development. Unknown or recovery environments cannot send. The combined maximum is 90/day and 2,790 in a 31-day month. Excess work waits until the next UTC day without consuming a job attempt; uncertain prior sends still obey the 23-hour safety boundary. These allocations leave room under the account's published 100/day and 3,000/month limits, which also count inbound messages. Other applications or inbound mail can still consume that headroom. Provider quota rejection remains a visible delivery failure, never a paid upgrade. [Resend limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits).

`.github/workflows/operations.yml` checks staging and production every 15 minutes and supports manual dispatch. GitHub scheduling is best effort. Production also checks the public web health endpoint. Secrets are separate for each deployment. Logs contain only environment, timestamp and alert change counts because this repository is public.

New alerts fail the workflow. Unchanged active alerts remain visible as `actionRequired: true` but do not repeatedly fail runs. A successful subsequent workflow does not prove every incident is resolved. Review `operations:latest` and confirm the alert disappears after correcting its cause. Recovered alerts are counted in the next check. Reachability and execution errors always fail the run.

Thresholds cover 30-minute import/reprocessing/export backlogs, one-hour deletion backlogs, 26-hour mail backlogs, failed exports/deletions, failed or uncertain mail, at least five failed operations constituting 20% of a day's outcomes, and estimated AI spending over USD 2/day. Inspect private job state, fix the cause, use guarded retries when appropriate, and verify the resulting state and next check. Reconcile provider acceptance before retrying an uncertain email.

GitHub notification delivery depends on repository/account preferences and has not been verified. Missing webhook deliveries, activity-provider metrics, storage/auth failure thresholds, browser vitals and full distributed tracing are outstanding acceptance items. Current monitoring does not complete OBS-001 through OBS-004.
