# Provider clarification request

Sent on 6 September 2026 after explicit user approval. Resend accepted the message; delivery and a COROS response have not yet been verified. The connector remains disabled pending clarification.

To: `api@coros.com`

From: `Kinetexa <notifications@kinetexa.com>`

Reply-to: `contact@exponentialeducation.ro`

Subject: Kinetexa: clarify MCP permission for a hosted training analytics application

Hello COROS API team,

We are building Kinetexa through Exponential Education SRL, Romania. It is an open-source training analytics application with private athlete accounts, a hosted Free plan and planned paid hosting conveniences. The public site is https://kinetexa.com and the source is https://github.com/StefanDG1/Kinetexa. Public registration is currently closed while implementation and verification continue.

Your new “Build on COROS MCP” page lists training dashboards and analytics platforms as supported self-service uses. We would like each athlete to authorize their own account through OAuth, periodically retrieve activity summaries and FIT files within your limits, and retain an unchanged private original plus a normalized copy for reproducible analytics and athlete export. Optional external AI would receive only minimized numerical evidence after separate consent. Raw GPS and unrestricted health histories would not be included in model requests. Users could disconnect or delete their account.

Could you confirm whether this use is permitted through MCP, or requires Partner API approval? In particular, please clarify:

- Whether background read-only synchronization and durable storage of each user's own FIT data are permitted, given the separate Partner API synchronization limitation.
- Which commercial-use terms apply to the hosted service, and whether the public MCP documentation grants the necessary permission under the linked Terms of Service.
- Required retention/deletion rules after disconnect, subscription cancellation or API termination, plus attribution and AI-use requirements.
- Whether the documented 50 FIT downloads per user per calendar day supports resumable historical backfill, and whether a historical lookback limit applies.

We will keep the connector disabled until the permitted scope is clear. Please direct your response to contact@exponentialeducation.ro.

Thank you,
Kinetexa / Exponential Education SRL
