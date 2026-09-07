# Authentication and logout

Kinetexa uses WorkOS AuthKit. Convex validates signed tokens against the configured WorkOS client and allowed issuers. Every private entry point resolves the athlete from the verified WorkOS user ID, checks active account status and checks the signed AuthKit session ID against server revocations. The protected Next.js layout also validates the session server-side. Production remains closed until the release gate is enabled.

## Identity and account linking

The WorkOS user ID is the account key. Repeated sign-ins and different sessions for that ID resolve to the same athlete, including when the email changes. Matching email addresses on different WorkOS user IDs do not merge accounts or training history. WorkOS manages authentication-provider linking; Kinetexa has no email-based linking or public history-transfer API. Focused tests cover both identity cases and ownership isolation.

First registration calls the public `athletes:ensure` action. If no athlete exists, the action checks that the signed user ID still exists in WorkOS before allocating a record through an internal mutation. Deleted, mismatched or unavailable provider identities cannot create an athlete. Existing active athletes return their existing ID without another provider request. Deleting accounts and revoked sessions are rejected before allocation. This closes a reproduced failure where an unexpired token could recreate an empty athlete after account deletion.

## Logout

The sign-out route calls `sessionActions:logout` with the current server-side access token before AuthKit clears browser cookies and redirects to WorkOS logout. The action derives the session ID from the signed token; callers cannot supply another session ID. It records a SHA-256 hash in `revokedSessions`, then asks WorkOS to revoke the session and its refresh token. No access token, refresh token or raw session ID is stored in that table.

Private reads, writes and athlete creation reject a recorded revoked session immediately. Other sessions for the same athlete remain active. Denial stays in place if WorkOS is unavailable. The revocation record and audit event are idempotent. The same record now claims at most one WorkOS attempt per minute; after confirmed provider revocation, repeats return without another provider call. A failed attempt keeps local denial and can be retried after the minute. Attempt/completion timestamps contain no credentials and follow the existing export, deletion and backup handling. Records remain until account deletion.

Profile/consent updates allow 30 successful changes per athlete per hour. Validation or rate-limit rejection rolls back the mutation, including any counters and scheduled recalculation. These controls bound the identified backend actions. Anonymous sign-in/callback traffic, first-registration verification attempts and invalid-token traffic still need complete ingress controls; this is not a claim of complete auth rate limiting.

Logout before first registration also creates a revocation, owned by the verified WorkOS identity. A later session can register, but the old session remains denied. Export pages include both legacy athlete-owned and identity-owned revocations without duplicates. Account deletion purges both. For an identity that never registers, a daily bounded cleanup checks WorkOS; only a confirmed missing identity with no athlete record can be removed, after an independent identity tombstone is written. Live identities retain their security records. WorkOS or ledger failures preserve denial and retry on a later run.

The frontend still clears its cookies and completes WorkOS logout if its backend request fails. In that outage case, an already-issued token can remain usable until expiry if the backend recovers before the token expires. Direct revocation in the WorkOS dashboard, outside Kinetexa's logout action, also relies on token expiry until provider-event synchronization is implemented. The staging token lifetime measured on 6 September was five minutes. Do not claim that every external revocation propagates instantly.

## Verification

Local integration checks verify that repeated successful logout makes one provider request, failed-provider retries are suppressed until the minute boundary, and private access stays denied. Existing registration/pre-registration lifecycle checks pass. A profile update at its quota is rejected without changing the profile or scheduling its timezone recalculation. No new hosted identities or logout were needed for these changes.

The initial API check reproduced a five-minute window in which an existing JWT remained readable after WorkOS session revocation. After the change, hosted staging rejected that session's profile/activity reads and athlete creation immediately, rejected its refresh token, and allowed a second session to refresh and read. Both temporary verification sessions were then logged out. Tests also cover provider failure without reopening access, anonymous rejection and private record projection. Browser route verification is recorded separately in the staging record.

The real staging Sign out link returned to the public landing page, added exactly one server revocation for the browser session, and redirected a subsequent protected-page visit to WorkOS sign-in. The registration regression is covered by provider-response and actual database-purge tests. The hosted normal-grace deletion check removed the identity and private objects, checked 26 owned tables, and rejected athlete recreation from a token with 226 seconds remaining. One temporary confirmation notice awaited the existing Free email allocation. [Evidence](verification/registration-2026-09-06.json).

Hosted pre-registration logout, denial after a fresh session registered, export inclusion, never-registered identity cleanup and the independent identity tombstone passed. The second fixture completed normal deletion, including its identity-owned revocations and private object prefix. [Evidence](verification/pre-registration-2026-09-07.json).
