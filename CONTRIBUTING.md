# Contributing

Start with [local development](docs/local-development.md), [architecture](docs/architecture.md) and the [requirement ledger](docs/requirements.md). The original PRD and recorded decisions define scope. Discuss new dependencies or product changes in an issue before undertaking a large change.

Use a focused branch and Conventional Commits, for example `fix: preserve missing power measurements`. Keep calculation logic in `packages/core`, server authorization in `convex`, and UI controls in `apps/web`. Reuse compatible maintained libraries and document their licenses. Do not replace missing measurements with invented values.

Before opening a pull request:

- Describe the concrete problem and resulting behavior, with a synthetic example where useful.
- Run TypeScript and the smallest tests that cover the changed risk. Authorization, imports, calculations, billing and destructive operations need meaningful regression coverage. Documentation-only changes need no application tests.
- Use API/integration checks for behavior and a browser for changed user interactions. Record what you actually verified and any remaining dependency.
- Format changed files, preserve every PRD row, and include a changelog entry for user-visible behavior.
- Keep personal activities, coordinates, credentials, private logs and customer data out of commits and screenshots. Use generated fixtures.

CI checks formatting, types, build, the local test suite, dependency advisories, secret history and CodeQL. It publishes an SBOM. Do not add hosted Convex tests to ordinary pull requests. Hosted verification is a separately budgeted release activity.

Contributions are accepted under [AGPL-3.0-only](LICENSE). Do not submit code or datasets you cannot license accordingly. Provider API rights and branding permissions are separate from the source license.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md), not a public issue. Maintainers use SemVer prereleases until operational acceptance is complete; `v1.0.0` is reserved for verified V1.
