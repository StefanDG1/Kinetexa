# Kinetexa

Private fitness intelligence for runners and cyclists.

Kinetexa brings activity history, training analysis and maps together. Original activity files remain the athlete's source data. Derived metrics expose their inputs and calculations. AI explains authorized, deterministic results with evidence.

## Development status

Project setup is in progress. The application is not available for public use or payments yet. A deployed page alone does not establish release readiness.

The implementation follows the V1 PRD through tested end-to-end milestones. See [delivery status](docs/delivery-status.md), [architecture](docs/architecture.md) and [design direction](docs/design-direction.md).

## Product boundaries

- Next.js, TypeScript and shadcn/ui for the responsive application.
- Convex for authorized application records and durable job progress.
- WorkOS AuthKit for authentication.
- Private S3-compatible storage for original files and sensor streams.
- MapLibre for routes and personal maps.
- Deterministic analytics shared by the interface and AI tools.
- Stripe Checkout and Customer Portal for hosted subscriptions.

The hosted plans are Free and Premium. Premium costs EUR 35 per month or EUR 180 per year. Core personal analytics remain available on Free. Managed service limits are configuration, not a reason to delete an athlete's history.

Garmin developer access has not been approved. Direct Garmin synchronization remains unavailable until approved and verified. FIT, TCX, GPX and supported migration archives are the initial ingestion paths. Direct Strava API access is conditional on a separate provider terms review.

## Open source

The core is licensed under AGPL-3.0-only. Source availability and local development do not yet constitute a supported one-command self-host package. Open Solo packaging follows the hosted release.

Never commit credentials, real athlete exports or private route fixtures. Use synthetic test data and the environment template.
