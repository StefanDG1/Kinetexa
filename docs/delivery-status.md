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
- [ ] Stripe account selected, test/live products and prices, portal and signed webhooks.
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

No application journey has been verified yet. Verification will record the environment, tested commit, fixture and outcome. Unit tests alone do not establish hosted integration success. Test payments do not establish successful live payments.

## Setup handoff, 6 September 2026

The user first asked for a manual setup checklist, then explicitly asked the agent to resume setup. The current phase is setup completion and a report before full V1 implementation. See [user decisions](decisions.md); the earlier [manual checklist](PRE_CODING_SETUP.md) is historical and its Vercel/MapTiler upgrade recommendations are superseded.

Both Convex environments have the initial auth/profile schema. WorkOS production credentials and callbacks are configured. The Stripe live activation submission reused the company's existing details, updated the trading name/website/descriptor to Kinetexa, and left tax and climate contributions off. The restricted live key is waiting on Stripe's identity verification prompt, which the user must complete. Sandbox prices and cancellation portal exist.

Vercel DNS and the Next.js production holding page are live at kinetexa.com. The home page and health endpoint returned HTTP 200, with security headers present. This verifies basic hosting only. The app's actual product journeys have not been implemented or verified.
