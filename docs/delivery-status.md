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
- [ ] Commercial Vercel plan established before paid launch.
- [ ] Convex development and production deployments.
- [ ] WorkOS development and production configuration.
- [x] Private development and production EU R2 buckets and separately scoped credentials created. Application access still needs verification.
- [ ] Stripe account selected, test/live products and prices, portal and signed webhooks.
- [ ] Optional Resend sender domain and scoped key, free tier only. Domain and DNS records created; verification was pending; no key created.
- [ ] PostHog project, privacy-safe events and consent.
- [ ] AI project, credentials and budget controls.
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

The user asked to stop computer use and finish account preparation themselves before more application coding. See [the setup checklist](PRE_CODING_SETUP.md). Application coding and browser automation are paused.

Development Convex auth/schema deployment succeeded. WorkOS staging credentials and localhost settings exist. A separate Romanian Stripe account named Kinetexa was created, but business activation, keys and catalog remain unfinished. The domain's public nameservers now resolve to Vercel. Production website deployment and end-to-end verification have not happened.
