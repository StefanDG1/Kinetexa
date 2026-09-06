# Contributing

Kinetexa is being built against a versioned product specification. Start with the architecture and delivery status in `docs` to understand the current stage.

Keep changes focused on an end-to-end behavior. Derived metric changes need documented formulas, versioning and fixtures. Ingestion changes need malformed-input and retry coverage. Private data reads and writes must enforce athlete ownership on the backend.

Use synthetic or explicitly licensed public fixtures. Never commit real fitness exports, access tokens, credentials or private coordinates. Configuration belongs in ignored environment files and deployment secret settings.

Changes to user-facing flows need keyboard, mobile, loading, empty-state and failure verification. Do not mark an external integration complete from mocked responses alone.

Contributions to the core are made under AGPL-3.0-only.
