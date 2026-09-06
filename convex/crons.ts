import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.daily(
  "expire email webhook receipts",
  { hourUTC: 3, minuteUTC: 15 },
  internal.email.pruneEvents,
  {},
);
export default crons;
crons.interval(
  "reconcile subscription state",
  { hours: 1 },
  internal.billing.reconcilePage,
  {},
);
