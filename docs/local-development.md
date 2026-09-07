# Local development

You can run all unit and backend integration tests without a Convex account, credentials or network requests. The full app currently needs a separate Convex project, WorkOS AuthKit application and private R2 bucket. There is no standalone Docker/Open Solo distribution yet.

## Work on code without hosted usage

Use Node 24 LTS and npm from that installation. From the repository root:

```sh
npm ci
npm run typecheck
npx vitest run packages/core/calendar.test.ts packages/core/query.test.ts
```

`npm test` runs the full local suite, including `convex-test` with an in-memory database. It does not use hosted Convex. Prefer the test file that exercises your change. A local build needs harmless placeholder public URLs if no environment file exists:

```sh
# POSIX shell
NEXT_PUBLIC_CONVEX_URL=https://example.convex.cloud NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback KINETEXA_APP_ENABLED=false npm run build
```

PowerShell equivalent:

```powershell
$env:NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud'
$env:NEXT_PUBLIC_WORKOS_REDIRECT_URI = 'http://localhost:3000/callback'
$env:KINETEXA_APP_ENABLED = 'false'
npm run build
```

The placeholder build checks compilation. It does not provide working authentication or application data.

## Run the authenticated app

1. Copy `.env.example` to the ignored root `.env.local`. Use your own development projects and synthetic activities. Set `KINETEXA_ENVIRONMENT=development` and `KINETEXA_APP_ENABLED=true` for your development app only.
2. Create a WorkOS development AuthKit application. Register `http://localhost:3000/callback` as redirect, `http://localhost:3000` as homepage/sign-out destination, and enable your chosen login method. Fill its client ID and API key. Generate a random cookie password of at least 32 characters, storing it directly in your private file.
3. Create/select a separate Convex development project with `npx convex dev --once`. Its CLI writes the deployment selector and URL into the root environment file. If initial function deployment needs the WorkOS client first, set it with `npx convex env set WORKOS_CLIENT_ID YOUR_CLIENT_ID` and rerun. Never select Kinetexa's staging or production projects for contributor tests.
4. Create a private R2 bucket and scoped object read/write credentials. Configure CORS to allow your localhost origin, `PUT` and `GET`, and the `Content-Type` request header. Fill the four `R2_*` fields. The storage adapter currently assumes R2's `auto` region and its browser CSP allows R2 hosts; other S3 services need an explicit adapter/CSP change.
5. Run `npm run setup:check`. This only checks local values and prints key names, never secrets. Run `npm run setup:check -- --write-web` once to create `apps/web/.env.local` from web-owned fields. It refuses to overwrite an existing file. The root file configures CLI/backend setup; Next.js loads the file inside `apps/web`.
6. Run `node scripts/sync-backend-env.mjs` to upload the documented backend fields to your selected **development** deployment. This command changes remote configuration. Keep the deployment selector in your root file correct. Optional empty fields are skipped, not removed.
7. Run `npm run convex:dev` in one terminal and `npm run dev` in another. Open `http://localhost:3000`, sign in, complete onboarding and import one small synthetic activity. Watch job status. Do not repeat bulk imports merely to verify an unrelated frontend edit.

`setup:check` is a configuration-shape check. It cannot prove that credentials belong to the same project. Restart Next.js after changing environment variables. Never paste a full environment file into an issue.

## Optional integrations

- Stripe: use sandbox keys, monthly/annual prices, portal configuration and a signed webhook at the Convex `.site/stripe` endpoint. Enable payments only in an environment intentionally configured for them. Missing billing setup must not prevent core analytics.
- Resend: configure a verified sender, scoped key and signed webhook at `.site/resend`. The development allocation is five attempts per UTC day; use simulator recipients for delivery work. See [operations](operations.md).
- AI: configure a Gateway key and model. Each athlete must opt in, and provider restrictions still apply. Pure analytics need no AI key.
- Product telemetry: keep external capture off unless collection, consent and erasure are configured together. See [product analytics](product-analytics.md).
- Backups/deletion: development can omit the separate backup ledger explicitly through the development environment. Hosted deployments require separate private backup storage and deletion tombstones. See [backup and recovery](backup-and-recovery.md).
- Direct fitness providers: all current catalog entries are gated. Credentials alone do not enable them. See [provider compliance](provider-compliance.md).

## Deploying your fork

Use separate preview/staging/production datasets and credentials. Deploy the backend before a frontend that calls new functions. Keep production registration and payments closed until your operational, legal and security gates pass. This repository's backup and monitor workflows require private JSON secrets documented in their operating guides; disable those schedules in your fork until configured. CI verification needs no application secrets. Do not upload logs, backups, exports or local environment files as public artifacts.

This guide describes supported source development, not a verified one-command self-host package. Standalone identity/storage packaging and a complete clean-machine hosted setup walkthrough remain work.
