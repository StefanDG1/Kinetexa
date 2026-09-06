# Setup status

6 September 2026. Milestone `0.1.0-alpha.1` prepares the project and accounts. Full V1 implementation is the next phase.

## Repository and hosting

- Both supplied documents are preserved in `docs/sources/`, with SHA-256 checksums. The repository copies match the supplied files byte for byte.
- `AGENTS.md` records the user's preference for simple code, maintained open-source libraries, focused tests, API-first verification, and desktop/mobile design review.
- `docs/decisions.md` records explicit changes to the original documents. Versions use SemVer prereleases and Conventional Commits. Version `1.0.0` remains reserved for complete, operational V1.
- The source is pushed to [StefanDG1/Kinetexa](https://github.com/StefanDG1/Kinetexa).
- [kinetexa.com](https://kinetexa.com) serves an honest holding page. Its [health endpoint](https://kinetexa.com/api/health) returns HTTP 200.
- The Vercel project uses `apps/web`, Next.js and Node 24. Secrets are stored separately for development and production. Local environment files and private setup notes are excluded from Git and deployment uploads.
- Sign-in and signup entry points redirect to the holding page while `KINETEXA_APP_ENABLED` is unset or false. This prevents opening an unfinished app. The flag will be enabled after implementation and verification.
- Vercel remains on Hobby at the user's explicit request. No plan upgrade or hosting migration was made. The user plans to upgrade personally after the first customer. Vercel's published commercial-use restriction remains unresolved; this setup report does not establish compliance.

## Service results

| Service | Prepared | Verified |
| --- | --- | --- |
| Domain | Namecheap registration, Vercel nameservers, apex and www attached | Nameservers match; apex HTTPS and health endpoint return 200 |
| Convex | Separate development and production deployments; initial auth/profile schema | Typecheck and deployment passed for the initial backend |
| WorkOS | Separate staging and production credentials; Kinetexa name; correct callback, homepage, login and logout URLs | Both API keys and JWKS endpoints return 200; both authorization entry points redirect to their respective AuthKit hosts |
| R2 | Private `kinetexa-dev` and `kinetexa-prod` EU buckets with separate scoped keys | Synthetic write/read/delete passed in each bucket; development credentials received 403 against production |
| Maps | MapLibre dependency and configurable OpenFreeMap Liberty style | Style request returns 200 with valid MapLibre v8 structure |
| AI Gateway | Separate keys with USD 5/month development and USD 20/month production quotas | Both completed a tiny synthetic generation request |
| PostHog | Dedicated Kinetexa EU project and public project token | Flags API returns 200; session replay off; automatic web capture, web vitals capture and dead-click capture off after reload |
| Resend | Verified `kinetexa.com`; sending key restricted to that domain; no plan upgrade | Synthetic message to Resend's test recipient accepted. Application delivery handling is not implemented |
| Stripe sandbox | Dedicated sandbox, Premium product, EUR 35 monthly and EUR 180 annual prices, cancellation portal | Catalog readback confirms amounts, EUR currency, recurring intervals and test mode; portal cancellation is at period end |
| Stripe live | Separate Kinetexa account, company details reused through Stripe's existing-account flow, website and statement descriptor changed to Kinetexa, activation submitted | Live dashboard available. Restricted key creation is waiting for the user's identity verification. Live payment/payout capability has not yet been independently confirmed |

OpenFreeMap replaces the earlier MapTiler account recommendation. Its public service permits commercial use without an account or API key. Attribution will be retained, and the style URL remains replaceable. The public service has no uptime SLA. [OpenFreeMap service and license](https://openfreemap.org/).

Resend remains subject to the user's free-tier-only requirement. No subscription change or paid add-on was made. Its public Free allowance currently includes three domains and 3,000 messages per month, capped at 100 per day. [Resend pricing](https://resend.com/pricing).

## One immediate user action

Stripe's **Verification required** prompt is open in the Kinetexa dashboard. Complete it using Windows Hello/security key or Stripe's email verification option. This is required to finish creating the restricted live API key. The form and its permissions have already been prepared.

Once verification is complete, the remaining setup work is to save that key, create the matching live catalog and portal, verify account capability, and synchronize the live billing configuration. No real charge has been made.

## Work that depends on the full application

These are implementation and release checks, not completed setup outcomes:

- Complete sign-in, email verification, onboarding and account recovery journeys.
- Import processing, analytics, activity views, maps and every other V1 requirement in the PRD.
- Signed Stripe webhooks, entitlement updates, Checkout, cancellations and downgrade behavior. The sandbox catalog alone does not prove the billing lifecycle works.
- R2 upload CORS and signed upload/download flows, chosen around the implemented upload path.
- Consent-based analytics and AI, model evaluations, usage limits and privacy controls.
- Transactional templates, email delivery/bounce handling, exports and deletion.
- Business policies and a confirmed public support/privacy contact. Existing company details stay in Stripe and private notes until needed.
- Full desktop/mobile product review, focused security and calculation tests, deployment checks, monitoring and restore verification.

Direct Garmin access remains unavailable pending Garmin's approval. File imports are the initial ingestion path.

## Verification evidence

The holding page and foundation code at `c27aa31` passed a production build and TypeScript checks. Deployment `dpl_FvKRB9hgfKPNoJm2VMGRgaikyx4f` is ready and aliased to kinetexa.com.

Browser review covered 1440px desktop and 390px mobile layouts. Neither had horizontal overflow; both showed readable content, prices, the development notice and links. This was a review of the holding page only. `/sign-in` and `/sign-up` both returned a 307 redirect to `/`, as intended for this phase.

No test suite was added for the static holding page. Setup verification used direct service/API checks, a build, typechecks, source checksums, a staged-secret scan and two browser layout checks. These results do not establish V1 readiness.
