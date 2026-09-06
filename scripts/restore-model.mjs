export function restoreRecord(table, row, deleted) {
  if (
    (table === "athletes" && deleted.has(row._id)) ||
    (row.athleteId && deleted.has(row.athleteId))
  )
    return null;
  if (table === "exportParts" || table === "activityFacts") return null;
  if (table === "athletes") {
    const { factsCursor, ...rest } = row;
    return { ...rest, factsReady: false };
  }
  if (table === "lifecycleJobs" && row.kind === "export") {
    const { key, position, lease, partCount, ...rest } = row;
    return {
      ...rest,
      status: "expired",
      error: "Temporary exports are not restored. Request a new export.",
    };
  }
  if (
    table === "outbox" &&
    ["queued", "retrying", "sending"].includes(row.status)
  ) {
    const { payload, ...rest } = row;
    return { ...rest, status: "delivery-unknown" };
  }
  if (table === "aiRuns" && row.status === "pending")
    return { ...row, status: "failed", finishedAt: Date.now() };
  if (table === "sources") {
    const pending = ["queued", "running", "retrying", "waiting-archive"];
    return {
      ...row,
      ...(pending.includes(row.status)
        ? {
            status: "failed",
            error:
              "Recovery interrupted this import. Retry from its retained original.",
          }
        : {}),
      ...(pending.includes(row.reprocessStatus)
        ? {
            reprocessStatus: "failed",
            reprocessError:
              "Recovery interrupted reprocessing. Retry from its retained original.",
          }
        : {}),
    };
  }
  return row;
}
