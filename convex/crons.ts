import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "remove expired sealed upload copies",
  { hours: 1 },
  internal.imports.cleanupUploads,
  {},
);
crons.daily(
  "expire local product events",
  { hourUTC: 4, minuteUTC: 15 },
  internal.telemetry.prune,
  {},
);
crons.daily(
  "expire operational records",
  { hourUTC: 4, minuteUTC: 0 },
  internal.operations.prune,
  {},
);
crons.daily(
  "expire email webhook receipts",
  { hourUTC: 3, minuteUTC: 15 },
  internal.email.pruneEvents,
  {},
);
export default crons;
crons.daily(
  "remove deletion notice recipients",
  { hourUTC: 3, minuteUTC: 45 },
  internal.email.pruneDeletionNotices,
  {},
);
crons.daily(
  "expire private account exports",
  { hourUTC: 3, minuteUTC: 30 },
  internal.exports.expirePage,
  {},
);
crons.interval(
  "reconcile subscription state",
  { hours: 1 },
  internal.billing.reconcilePage,
  {},
);
