# Backup and recovery

Hosted backups use a separate private EU R2 bucket. The daily GitHub Actions workflow runs at 02:30 UTC for staging and production, with one run at a time. GitHub can delay scheduled runs; 24 hours is the intended recovery-point interval, not a measured availability guarantee. Failed runs remain visible in Actions. Operational alert routing and recovery-time targets still need release verification.

## Contents and retention

Each run captures a consistent native Convex database snapshot. It follows retained source and current/previous canonical stream references into R2, verifies original checksums, and stores immutable content-addressed backup objects. Subsequent runs reuse objects whose source ETag and size are unchanged and whose backup metadata passes verification. Restore reads verify the actual bytes against SHA-256.

Snapshots are retained for seven days. Retention runs even if snapshot creation fails. Unreferenced backup objects older than one day are removed; objects needed by a retained snapshot remain. Temporary user export archives are excluded, and recovery marks their jobs expired. Recovery also clears the derived numerical activity index and rebuilds it from canonical metadata. No private snapshot or object is uploaded as a public GitHub artifact.

Deletion first writes independent tombstones to the backup bucket for the internal athlete ID and a SHA-256 hash of the WorkOS identity. The identity marker covers revocations created before athlete registration. A restore reads current tombstones, resolves matching athlete IDs in the snapshot and filters every owned record and object, even if that snapshot predates registration or deletion. Snapshots containing an account already marked for deletion also exclude it during recovery. Tombstones contain internal IDs or identity hashes and deletion times, never raw tokens or email addresses. They are retained independently of expiring snapshots. Business/privacy review of this retention schedule remains a release gate.

## Credentials and scheduled operation

Repository secrets `KINETEXA_BACKUP_STAGING` and `KINETEXA_BACKUP_PRODUCTION` contain encrypted JSON configuration. Source R2 credentials are restricted to reading their environment's bucket. Target credentials are restricted to the backup bucket. Convex's deployment key is used only by the trusted backup workflow. Secrets and private operator configuration remain outside Git.

`scripts/backup.mjs` reads `BACKUP_CONFIG`, creates the snapshot, copies changed objects, writes a manifest and updates the environment's latest-backup pointer. Logs include counts and status, not credentials, athlete records or original filenames. `--prune-only` enforces retention separately. Run this job only through the workflow or while no other backup is running. The schedule is active only when its workflow exists on GitHub's default branch.

The backend's `BACKUP_*` configuration writes deletion tombstones. Hosted deletion fails closed if that ledger cannot be written and retries with capped backoff. Development can explicitly use `KINETEXA_ENVIRONMENT=development` without a hosted backup ledger.

## Isolated restore procedure

1. Select a successful manifest less than seven days old. Keep the original environment locked down during an incident until recovery checks finish.
2. Supply private `BACKUP_CONFIG` and `RESTORE_CONFIG` to `node scripts/restore-backup.mjs`. The restore configuration names an isolated restore bucket, its credentials and a local output directory. `manifestKey` can select an older retained snapshot; omission selects the latest. Existing target objects require explicit `replaceExisting: true` and are removed before the drill.
3. The script verifies the snapshot and every restored object's bytes, applies current deletion tombstones, and writes `snapshot-restore.zip` plus a private report. It does not import a database or switch live traffic. If the deletion ledger changes during preparation, it stops and requires another preparation.
4. Deploy the matching application schema to the isolated restore deployment. Keep email, payments and AI credentials absent during the drill. Verify the exact target before running `convex import --deployment restore-drill --replace-all --yes` against the prepared ZIP.
5. Verify both owners independently: activity counts and totals, health history, original/current/previous canonical checksums, settings and saved workspace data. Confirm that deleted athletes are absent from every table and object prefix. User exports must be expired and unsent emails must remain `delivery-unknown`.
6. Recover interrupted imports/reprocessing from retained originals and reconcile current Stripe state before restoring external service access. Recovered pending AI runs are marked failed. Only after incident checks should an operator configure external credentials and switch traffic.

The latest isolated drill restored seven activities across two synthetic accounts, thirteen health records and 45 checksum-verified objects. Four deleted accounts were excluded from all 25 owned tables and object prefixes. Interrupted archive jobs become retryable failures, and recovery discards partial archive scan cursors. A partial-archive retry journey passed before the drill was reset to its clean snapshot. Detailed evidence is recorded in `verification-staging.md`.
