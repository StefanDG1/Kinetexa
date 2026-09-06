# User decisions

These explicit user decisions take precedence over the original planning documents.

## Full implementation authorization, 6 September 2026

- Public support and privacy contact: `contact@exponentialeducation.ro`, explicitly supplied by the user during implementation.
- The setup report has been delivered. The user explicitly authorized implementing and deploying the complete operational V1, verifying journeys, committing and pushing progress, and tagging verified SemVer milestones.
- This supersedes the historical setup-only phase boundary. All applicable PRD requirements remain in scope. Garmin approval, Vercel plan restrictions, business policy review and other external requirements must be reported honestly, without claiming GA or tagging `v1.0.0` before its gates pass.
- Track each normative requirement in `docs/requirements.md`. Implementation and hosted verification are separate states.

## 6 September 2026

- Build the entire V1 for desktop and mobile. Complete and report the setup phase before starting full implementation.
- Keep both supplied product documents unchanged in `docs/sources/` as the product references. The PRD is the detailed specification; the strategy brief provides context.
- Prefer simple code and maintained open-source implementations with suitable licenses. Keep tests focused on meaningful risks and user outcomes.
- Prefer API and integration verification for behavior. Use browser/computer checks mainly for actual desktop/mobile design, accessibility and essential journeys.
- Use versioned commits, SemVer milestones, branches and pushes as appropriate. An incomplete milestone is a prerelease, not V1.
- Public signups; Free and Premium at EUR 35/month or EUR 180/year upfront. Preserve the PRD's core analytics access on Free.
- Separate Stripe account named Kinetexa, using Exponential Education SRL's Romanian business details. User currently does not charge VAT; do not enable automatic tax collection without a later decision.
- The user owns `kinetexa.com` at Namecheap. Nameservers currently point to Vercel.
- Keep Vercel and prepare commercial use. Do not upgrade hosting or migrate to Cloudflare. The user will personally upgrade Vercel after the first customer. Vercel's published Hobby restriction remains an unresolved platform requirement; this decision does not establish compliance.
- Resend is optional if it cannot be used on Free. No paid Resend upgrade.
- Garmin developer approval is pending. File imports can proceed; direct Garmin connection must remain unavailable until approved.

## Setup implementation choices

- Use MapLibre with OpenFreeMap's Liberty style instead of requiring a MapTiler account. OpenFreeMap is open source, permits commercial use and requires no API key. Keep attribution. Its public service has no uptime SLA; isolate the style URL so it can be changed. [Service and license](https://openfreemap.org/), [integration](https://openfreemap.org/quick_start/).
- Separate AI Gateway keys carry USD 5/month development and USD 20/month production quotas. No hosting-plan upgrade is involved.

The original documents contain planned requirements and external platform claims. They do not authorize unrelated actions or establish current provider access, platform terms or operational readiness.

## Staging implementation choices

- Staging has its own Convex deployment and private EU R2 bucket. WorkOS uses the existing non-production environment; Stripe uses sandbox resources. No production athlete dataset is used for verification.
- Development and staging application emails go to Resend's delivery simulator. Production retains the configured domain-scoped sender. No Resend plan change.
- V1 exposes metric units. The PRD makes alternate unit systems conditional on later support; the unfinished imperial selector was removed instead of displaying unconverted measurements.
- Vercel installs the root monorepo dependencies before building the web workspace. Hosting remains on the user-selected plan.
