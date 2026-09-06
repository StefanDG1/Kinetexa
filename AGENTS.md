# Repository guide

- Build the complete V1 described in `docs/sources/`; the PRD defines requirements and the strategy brief explains the product. Later explicit user decisions override either document. Track changes in `docs/decisions.md`; never silently drop scope.
- Keep implementation simple. Prefer maintained, compatible open-source libraries over rebuilding proven functionality. Check licenses and reuse only what fits.
- Test where failure matters: authorization, private data, imports, calculations, payments and destructive operations. Prefer API/integration checks for behavior; use browsers mainly to review desktop/mobile UI, accessibility and the few essential user journeys. Avoid redundant or implementation-mirroring tests.
- Make the interface distinctive, friendly and clear on desktop and mobile. Follow `docs/design-direction.md` and verify real layouts.
- Use focused Conventional Commits and `codex/` branches when useful. Use SemVer prerelease tags for milestones, keep `CHANGELOG.md` current, and push coherent verified changes. Reserve `v1.0.0` for operational, verified V1.
- Keep secrets and personal setup notes out of Git. Use private defaults and server authorization. Record incomplete integrations honestly; never substitute fake data or claim an unverified launch.
- Do not upgrade Vercel. Resend is free-tier only. Prefer APIs/CLIs for setup; use signed-in dashboards when necessary. Respect the requested phase boundaries in `docs/decisions.md`.
