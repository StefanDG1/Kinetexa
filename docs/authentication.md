# Authentication and logout

Kinetexa uses WorkOS AuthKit. Convex validates signed tokens against the configured WorkOS client and allowed issuers. Every private entry point resolves the athlete from the verified WorkOS user ID, checks active account status and checks the signed AuthKit session ID against server revocations. The protected Next.js layout also validates the session server-side. Production remains closed until the release gate is enabled.

## Identity and account linking

The WorkOS user ID is the account key. Repeated sign-ins and different sessions for that ID resolve to the same athlete, including when the email changes. Matching email addresses on different WorkOS user IDs do not merge accounts or training history. WorkOS manages authentication-provider linking; Kinetexa has no email-based linking or public history-transfer API. Focused tests cover both identity cases and ownership isolation.

## Logout

The sign-out route calls `sessionActions:logout` with the current server-side access token before AuthKit clears browser cookies and redirects to WorkOS logout. The action derives the session ID from the signed token; callers cannot supply another session ID. It records a SHA-256 hash in `revokedSessions`, then asks WorkOS to revoke the session and its refresh token. No access token, refresh token or raw session ID is stored in that table.

Private reads, writes and athlete creation reject a recorded revoked session immediately. Other sessions for the same athlete remain active. Denial stays in place if WorkOS is unavailable. The revocation record and audit event are idempotent, although a repeated action can repeat the provider revocation request. Records remain until account deletion and are included in owned export/deletion handling.

The frontend still clears its cookies and completes WorkOS logout if its backend request fails. In that outage case, an already-issued token can remain usable until expiry if the backend recovers before the token expires. Direct revocation in the WorkOS dashboard, outside Kinetexa's logout action, also relies on token expiry until provider-event synchronization is implemented. The staging token lifetime measured on 6 September was five minutes. Do not claim that every external revocation propagates instantly.

## Verification

The initial API check reproduced a five-minute window in which an existing JWT remained readable after WorkOS session revocation. After the change, hosted staging rejected that session's profile/activity reads and athlete creation immediately, rejected its refresh token, and allowed a second session to refresh and read. Both temporary verification sessions were then logged out. Tests also cover provider failure without reopening access, anonymous rejection and private record projection. Browser route verification is recorded separately in the staging record.
