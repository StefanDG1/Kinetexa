# Delivery status

This file records implemented and verified outcomes separately. Unchecked items remain work, including external setup.

## Confirmed decisions

- Project directory: `C:\Code\Kinetexa`.
- Public source repository: `StefanDG1/Kinetexa`.
- Vercel project: `kinetexa`, under `stefandg1s-projects`.
- Public signup and real payments are the intended release mode.
- Premium: EUR 35 monthly or EUR 180 annually, charged upfront per interval.
- Garmin access is pending. Begin with real file import.
- Existing service accounts will receive new Kinetexa-specific projects and credentials.
- Do not substitute sample results for an operational integration.

## Service setup

- [x] Local Git repository initialized on `main`.
- [x] Public GitHub repository created.
- [x] Vercel project created, linked locally and connected to GitHub.
- [x] Initial source commit pushed and verified.
- [ ] Commercial Vercel plan. User explicitly retained Hobby and plans to upgrade personally after the first customer. Published Hobby restrictions remain unresolved.
- [x] Convex development and production deployments created; initial schema deployed and typechecked. Product functions are still to be implemented.
- [x] WorkOS development and production keys, application names, callbacks and sign-out URLs configured. API/JWKS checks passed. End-to-end login is pending the app.
- [x] Private development and production EU R2 buckets and separately scoped credentials created. Application access still needs verification.
- [x] Separate Stripe account and sandbox, test/live products and prices, scoped live key and customer portals configured; Vercel billing environments synchronized.
- [ ] Stripe signed webhooks, billing lifecycle and live payment/payout readiness verified as part of implementation and release.
- [x] Resend domain verified; sending key scoped to kinetexa.com; synthetic message accepted. No plan upgrade. Application mail templates and delivery lifecycle remain implementation work.
- [x] PostHog EU Kinetexa project created and token verified. Session replay and automatic capture are off. Consent-based SDK integration remains implementation work.
- [x] Separate AI Gateway credentials with USD 5/month development and USD 20/month production quotas. Both passed a synthetic generation request. Product consent and per-user limits remain implementation work.
- [ ] Website domain, auth callbacks and email DNS verified.

## Product milestones

- [ ] M0: Authenticated private shell, CI and operational foundation.
- [ ] M1: FIT import, retained original, canonical activity, real route and charts.
- [ ] M2: Multi-file, TCX, GPX, migration ZIP, resumable jobs, deduplication and reprocessing.
- [ ] M3: Dashboard, zones, load, fitness/form, records, curves and explanations.
- [ ] M4: Personal heatmap, filters, privacy zones and geometry leak tests.
- [ ] M5: Approved persistent provider, backfill, webhooks, reconciliation and status.
- [ ] M6: Saved custom analytics, goals, calendar, gear and maintenance.
- [ ] M7: Consented AI tools, evidence, insights, limits and evaluation suite.
- [ ] M8: Revocable shares, subscriptions, portal, entitlements and transactional email.
- [ ] M9: Export/deletion, security, accessibility, performance, backup restore and release gates.
- [ ] M10: Open Solo packaging after hosted V1.

## Verification record

### Staging milestone, 6 September 2026

See [staging verification](verification-staging.md) for hosted authentication, import/migration/health, ownership, original-checksum export, sandbox Checkout, AI consent and signed email delivery evidence. Fifty-three focused tests pass. Permanent deletion and an independent restore have been verified with synthetic accounts. Remaining feature acceptance, backup automation, model reliability and operational release gates remain open.

### Implementation progress, 6 September 2026

The user authorized full implementation after the setup report. Work is on `codex/operational-v1`. `docs/requirements.md` retains every numbered requirement; no GA claim or `v1.0.0` tag has been made.

Verified against the development Convex deployment and local Next.js application using two synthetic WorkOS accounts:

- Authentication and persisted onboarding. Cross-user activity reads fail; the second account sees no first-account activities.
- Real R2 uploads and background FIT, GPX, TCX and ZIP processing. Four uploads produce three canonical activities, with archive repeats deduplicated.
- Export ZIP downloaded and inspected. It contains four unchanged originals and three canonical stream files, plus application metadata.
- AI consent off rejects model requests. Consent on completed a Gateway query and returned evidence-linked output. This is a smoke test, not the full AI evaluation gate.
- Stripe sandbox Checkout creation, signed subscription activation, repeated delivery, forged-signature rejection and cancellation preserving canonical activities. No live charge was made.
- Browser inspection at 1600px desktop and 390px mobile. Home and activity pages display real synthetic imports without horizontal page overflow. This is partial UI verification, not the complete browser/accessibility matrix.
- Eighteen focused tests currently cover core calculations, malformed inputs, archive limits, privacy masking, cross-user access, quotas and AI response validation. Production build and TypeScript checks pass at the recorded implementation batch.

Still open: complete dashboard/customization, all analytics and import metadata criteria, provider framework/approval, automatic insight/evaluation coverage, production billing readiness, transactional email lifecycle, deletion/restore drill, operational alerts, large-history performance, full accessibility and all remaining ledger acceptance criteria. The production domain continues to serve the holding page until release gates are met.

## Setup handoff, 6 September 2026

The user first asked for a manual setup checklist, then explicitly asked the agent to resume setup. The current phase is setup completion and a report before full V1 implementation. See [user decisions](decisions.md); the earlier [manual checklist](PRE_CODING_SETUP.md) is historical and its Vercel/MapTiler upgrade recommendations are superseded.

Both Convex environments have the initial auth/profile schema. WorkOS production credentials and callbacks are configured. The Stripe live activation submission reused the company's existing details, updated the trading name/website/descriptor to Kinetexa, and left tax and climate contributions off. The user completed identity verification. The restricted live key, both live prices and the live customer portal are saved in Vercel production; matching sandbox resources are saved in development. Catalog and portal readbacks passed. Actual payment/payout readiness remains a release check.

Vercel DNS and the Next.js production holding page are live at kinetexa.com. The home page and health endpoint returned HTTP 200, with security headers present. This verifies basic hosting only. The app's actual product journeys have not been implemented or verified.
