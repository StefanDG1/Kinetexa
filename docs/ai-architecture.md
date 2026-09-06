# AI evidence and request boundaries

The product calls one authorized action, `aiActions.ask({ question, activityId? })`. Core analytics remain available without AI consent. The action resolves a bounded plan, calculates evidence, asks the configured provider for a qualitative explanation, validates the answer and settles the request.

## Design decision

The architecture pass compared a fixed batch plan with an adaptive capability loop. The fixed plan scored 23/25 against 18/25 in the independent review. It keeps the thirteen read-only tools behind one executor, with at most three tool calls and two model calls. An adaptive loop would add latency and repeated authorization transitions without a demonstrated V1 requirement.

Both candidates were produced by the available GPT runner; the prescribed Claude and Grok runners were unavailable. No cross-provider consensus is claimed. The review added server-resolved aliases, whole-request context measurement and guaranteed failure settlement. Shared schema generation and adversarial fake-provider tests were retained from the alternative; its recursive orchestration was rejected.

## Ownership

- `packages/core/ai.ts` owns tool schemas, local-calendar periods, evidence validation, model projection and medical/privacy boundaries.
- `packages/core/ai-tools.ts` reuses the query, goal and training calculations. Missing values remain unavailable. Evidence includes comparison periods, source links, reproducible queries and caveats.
- `convex/aiData.ts` reads bounded pages under an active request, filters sources before calculation and resolves model aliases against that athlete's eligible records. Unknown source policies fail closed. The provider never receives database IDs, storage keys, route geometry or raw health rows.
- `convex/ai.ts` owns consent revisions, reservations, persistent messages, telemetry, interrupted-request recovery and insight suppression. Turning consent off and back on invalidates an older request.
- `convex/aiProvider.ts` owns gateway transport, schema-derived planning instructions, the complete request byte limit and token/cost extraction. Model-specific prices are isolated here.
- `convex/aiActions.ts` owns the fixed pipeline and total deadline. Its finalizer records failure as well as success. A scheduled watchdog settles an interrupted worker.

## Limits and accounting

Free reserves from ten monthly requests; active Premium reserves from two hundred. Requests are limited to three per minute. Automatic insights share the allowance and are limited to one attempt per day. A reservation that makes no provider call is refunded; completed provider work remains counted even when validation fails. Core analytics and stored history are unaffected by exhaustion.

The current limits are three tools, two provider calls, 48,000 bytes per complete external request, 24,000 bytes of evidence, 1,800 output tokens per call, a 28-second total deadline and 50,000 records per AI request. Exceeding a limit produces a failed request, never truncated totals. The PRD's latency and large-history targets still require broader measurement.

Telemetry records outcome, tool names/counts, bytes, tokens, model, duration and integer microdollar estimates. It contains no prompt, answer, coordinates or health measurements. The standard Gemini rate card was read from the Gateway model catalog on 6 September 2026; estimates exclude provider cache/region adjustments and are not invoices. A model without a configured rate card reports unavailable cost instead of inventing one.

## Verification

The versioned cases and thresholds live in `packages/core/ai-evals.ts`; `scripts/evaluate-ai.mjs` runs one to three cases against the documented synthetic staging fixture using a privately supplied short-lived token. Allow the product minute limit to reset between batches. Exact values, comparison values, unavailable measurements, selected tools, no-transmission boundaries and qualitative fidelity are separate checks.

Focused tests cover all thirteen calculations, calendar/DST edges, alias rejection, cross-athlete reads, source restrictions, consent revocation between provider calls, quotas, suppression and adversarial tool output. Live model reports are reviewed alongside these tests; deterministic passes alone do not establish model quality or operational V1.
