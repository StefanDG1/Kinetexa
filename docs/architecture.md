# Architecture

## Data ownership

The athlete owns canonical activities independently of provider availability. Each imported source keeps an immutable content hash, original private object, parser version and normalization version. Activity-source relationships preserve provenance and support conservative duplicate detection without destroying original records.

## Boundaries

The Next.js application handles pages, authenticated entry points and integration callbacks. Convex enforces athlete ownership for every private query and mutation, stores application metadata and coordinates durable jobs. Pure TypeScript packages implement canonical data validation, deterministic analytics, GIS transformations and provider contracts. Expensive parsing and stream work stays behind a processing interface that can move to a dedicated worker.

Raw files and high-resolution streams belong in private object storage. The browser receives authorized, bounded views. Public shares return explicit field projections and server-masked geometry; they never reuse the private activity response.

AI tools query through the same authorization and deterministic analytics boundaries. Global AI consent is off by default. Disabling consent prevents subsequent external model requests. Exact GPS coordinates and unrestricted health histories are excluded from default model context.

## Repository shape

```text
apps/web        Next.js pages and integration endpoints
convex          Authorized records, job state and realtime queries
packages        Canonical data, analytics, GIS and shared contracts
docs            Architecture, methods, setup, security and operations
infra           Infrastructure configuration when required
```

Create packages as a tested boundary becomes useful. Do not add empty deployment services solely to match a diagram.

## Environment separation

Development, preview, staging and production must not silently share private datasets or payment modes. Production requires verified WorkOS callbacks, a production Convex deployment, scoped private storage, live Stripe prices and signed webhook delivery. Configuration errors fail closed instead of opening a demonstration account.

## Release evidence

Verify parsers and metrics with synthetic golden fixtures; use two athlete identities for authorization tests. Browser journeys cover onboarding, import, activity/map synchronization, saved analysis, privacy-safe sharing, subscription lifecycle and export/deletion. Public release also requires restore testing, privacy/retention configuration and operational alerts.
