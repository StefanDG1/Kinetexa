# Kinetexa

Private fitness intelligence for runners and cyclists. Keep original recordings, inspect training, explore your routes and ask evidence-linked questions about your own history.

## Status

Kinetexa is an implemented prerelease under active development. Public signup and real payments remain closed. `v1.0.0` is reserved for operational acceptance. [Functional readiness](docs/functional-readiness.md) distinguishes working code, verification and external dependencies. Visual polish is handled separately.

The app includes:

- FIT, TCX, GPX and supported ZIP migration imports with retained originals, resumable processing, duplicate decisions and versioned recalculation.
- Activity maps, sensor charts, interval calculations, laps, zones, records, performance metrics and calculation explanations.
- Training dashboards, custom saved/pinned analytics, goals, planned workouts and gear maintenance history.
- Private health context and route maps, privacy zones, explicit public-share previews, expiry and revocation.
- Optional consented AI with deterministic tools and evidence, Free/Premium entitlements, Stripe Checkout/Portal, transactional email, account export and deletion.
- Private operational inspection, guarded retries, backup/restore tooling and local security/calculation tests.

Direct Garmin, Strava, Polar, Wahoo, COROS and Suunto connections are **not operational**. Permissions, compatible terms and adapter implementations remain required. File import works independently. See [provider gates](docs/provider-compliance.md).

## Develop and contribute

Use Node 24 LTS. Tests run locally with synthetic data and an in-memory Convex database, without hosted credentials:

```sh
npm ci
npm run typecheck
npm test
```

For a change, run only relevant test files. [Local development](docs/local-development.md) explains the full app's Convex, WorkOS and private R2 setup, optional services and deployment boundaries. [Contributing](CONTRIBUTING.md) describes pull requests and verification. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

| Directory       | Responsibility                                               |
| --------------- | ------------------------------------------------------------ |
| `apps/web`      | Next.js/React app, charts and MapLibre maps                  |
| `convex`        | Authorized data, ingestion, deterministic APIs and jobs      |
| `packages/core` | Parsers, canonical models, calculations and privacy geometry |
| `scripts`       | Local setup/CI checks, backup/recovery and operations        |
| `docs`          | Requirements, decisions, architecture, methods and evidence  |

Start with [architecture](docs/architecture.md), [backend APIs](docs/backend-api.md), [methods](docs/methods.md) and the [PRD ledger](docs/requirements.md). The [original documents](docs/sources/README.md) remain unchanged; [recorded decisions](docs/decisions.md) take precedence.

## Hosting and open source

The source is [AGPL-3.0-only](LICENSE). Source availability and contributor development are available now. A supported standalone Open Solo package is not yet available; the PRD schedules that distribution immediately after hosted V1. The full app currently depends on managed identity/backend services and private object storage. A checkout is not a one-command self-host package.

Hosted Free provides core personal analytics. Intended Premium pricing is EUR 35 monthly or EUR 180 annually. Service quotas do not transfer ownership of an athlete's recordings. Payments remain closed until release gates pass.

Never commit credentials, personal fitness exports or private routes. Reused licenses are documented in [dependencies](docs/dependencies.md); CI produces a dependency inventory. Provider data rights and trademark permissions are separate from the code license.
