# Incident response

The repository owner is the initial incident coordinator. The public reporting inbox is contact@exponentialeducation.ro. Reports, private operational state and credentials must stay out of public issues and Actions output.

## Severity and notification

| Severity | Examples                                                                                                                        | Response                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Active cross-athlete disclosure, stolen operator/storage credentials, public backup exposure or uncontrolled destructive access | Begin containment immediately. Notify the repository owner through the private reporting channel and available account notifications. |
| High     | Confirmed single-account takeover, unrecoverable import loss, billing integrity failure or sustained destructive-job failure    | Investigate promptly, restrict the affected operation and preserve evidence. Escalate to critical if exposure spreads.                |
| Medium   | Prolonged import/email/export backlog, outage without evidence of exposure or a reproducible limited abuse path                 | Assign an owner, restore service and verify recovery.                                                                                 |
| Low      | Non-exploitable configuration/documentation issue or a report needing clarification                                             | Triage privately and track a concrete follow-up.                                                                                      |

The operations workflow checks staging and production every 15 minutes, subject to GitHub scheduling. New alerts fail the workflow; account/repository notification settings determine who receives them. Notification delivery has not been verified, so this is not yet a proven paging system. Before public launch, verify receipt at the monitored inbox and record the on-call owner and fallback channel privately. An unchanged successful run does not prove all incidents are resolved; inspect active alerts.

## Containment and recovery

1. Record detection time, affected environment, observed behavior, incident owner and a private incident reference. Capture only necessary evidence. Do not paste raw tokens, files, routes or customer details into shared logs.
2. Identify the affected trust boundary. Close production athlete access with `KINETEXA_APP_ENABLED=false` when broad access must stop; the frontend holding page alone does not disable direct backend calls. Pause implicated workers/CI workflows or disable the specific provider/AI path when that limits harm more precisely.
3. For public-share leakage, revoke affected links and verify direct anonymous requests fail. For account takeover, revoke sessions at WorkOS and in the application boundary, then verify old access and refresh tokens fail. External WorkOS revocation alone may leave a JWT valid until expiry.
4. For suspected secret theft, revoke the affected credential at its provider. Issue a new least-privilege credential, replace it in every affected private deployment/CI environment, redeploy where required and verify access with the new credential and rejection of the old one. Review WorkOS, Convex, R2, Stripe, Resend, Gateway, PostHog and GitHub/Vercel credentials according to the exposed scope. Do not rotate unrelated secrets blindly or keep a known-compromised credential live merely to preserve uptime.
5. Preserve originals, job state and audit evidence needed to diagnose data loss. Do not retry uncertain email/payment effects without reconciling provider acceptance. Use guarded operator retries after fixing the cause. Restore only into the isolated recovery environment first, verify checksums and apply the independent deletion ledger before considering production recovery.
6. Reproduce the failure with synthetic data, implement the root-cause fix, run focused authorization/integrity/destructive regression checks, and verify the actual hosted journey. Compare private metrics and active alerts before reopening the affected path.

## User and provider communication

The incident coordinator determines confirmed exposure, affected records/users, time window, containment status and required follow-up with the business owner. Check the applicable agreements and notification obligations for each affected processor/provider; do not invent a universal deadline or assert that an unapproved provider integration is active. Obtain the responsible owner's authorization for external communications. If an obligation requires a deadline, record it privately and assign an accountable sender.

Communications should distinguish confirmed facts from investigation, explain the practical user impact and state any user action needed. Never include another user's details, credentials or live exploit material. Preserve the sent wording and delivery outcome privately.

## Closure

Record root cause, scope, recovery evidence, notification decisions, credential rotations, data restored or lost, and remaining limitations. Hold a review with the repository/business owner, assign preventive changes and update the threat model and runbooks. Close the incident only after the affected journey works and the relevant alerts have recovered. Security fixes use focused Conventional Commits without publishing sensitive exploit data before containment.
