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
- A separate synthetic deletion account imported an activity, requested deletion and immediately lost private-data access. Permanent object, identity and database cleanup is still being verified.

## Focused automated checks

Twenty-four tests pass across core parsing/calculations, AI output validation, ownership/sharing and destructive lifecycle boundaries. Cases include archive traversal/expansion rejection, missing recording gaps, distance resets, complete-duration power requirements, quoted CSV metadata, FIT health extraction, hidden geometry, cross-user writes, quotas, deletion confirmation/ownership and interrupted-import recovery.

The production Next.js build and TypeScript checks pass for this implementation batch. GitHub checks and final deployed revision are recorded with the milestone commit. Earlier desktop/mobile screenshots verified home and activity layouts without horizontal overflow; the revised dashboard and complete accessibility/browser matrix still need review.

## Remaining release work

Full requirement closure remains open, including provider approval and connector operations, large-history performance, complete comparison/AI/health criteria, policy review, backup restoration, operational alerts and the full UI/accessibility matrix. Production continues to serve the holding page. This evidence does not justify `v1.0.0`.
