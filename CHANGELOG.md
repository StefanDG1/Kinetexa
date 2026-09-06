# Changelog

Versions use Semantic Versioning. Setup and development milestones use prerelease versions. Version 1.0.0 is reserved for complete, operational V1 with recorded verification.

## Unreleased

Full V1 implementation has not begun. Account setup and the holding page form the first prerelease milestone.

## 0.1.0-alpha.2 - 2026-09-06

- Finish live Stripe key issuance after the user's identity verification.
- Configure and verify live EUR 35 monthly and EUR 180 annual subscription prices and the customer portal, with cancellation at period end.
- Save live billing configuration in Vercel production while retaining sandbox resources in development.
- Record implementation-dependent billing and live payment/payout release checks separately from completed account setup. No real charge was made.

## 0.1.0-alpha.1 - 2026-09-06

- Import the original PRD and strategy brief as product references.
- Add concise repository instructions, explicit user decisions and a setup checklist.
- Establish the Next.js workspace and initial authenticated Convex profile schema.
- Configure development and production Convex, WorkOS and private EU R2 resources, with separate credentials. Verify storage access and environment isolation through APIs.
- Deploy a responsive holding page and health endpoint to kinetexa.com. Keep signup entry points closed until the application is ready.
- Create bounded development/production AI Gateway keys, a Kinetexa PostHog EU project, and a domain-scoped Resend sending key without a plan upgrade.
- Choose the open-source OpenFreeMap service instead of a paid map account.
- Create a separate Stripe account and sandbox, submit live activation using the existing company's details, and configure test subscription prices and customer portal. Live key issuance requires the user's verification.

This is a setup milestone, not a V1 release. Full authentication, activity import, billing lifecycle and desktop/mobile product journeys still require implementation and verification.

## Initial foundation, b08f5d9

- Initialize the public AGPL repository, architecture notes and design direction.
