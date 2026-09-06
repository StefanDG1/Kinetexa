import { VERSION, type Activity } from "./model";

// Numeric offsets in XML describe the recorded local start. A trailing Z gives UTC only.
export function explicitOffset(value: unknown): number | undefined {
  if (typeof value !== "string") return;
  const match = /([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!match) return;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return minutes <= 840 && Number(match[3]) < 60
    ? match[1] === "-"
      ? -minutes
      : minutes
    : undefined;
}
export function withTimeContext(
  activity: Activity,
  athleteTimezone: string,
  now = Date.now(),
): Activity {
  const sourceOffset =
    activity.timezoneSource === "file-offset"
      ? activity.utcOffsetMinutes
      : undefined;
  let offset = sourceOffset;
  if (offset === undefined) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: athleteTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(activity.start)
        .map((p) => [p.type, p.value]),
    );
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    offset = (local - Math.floor(activity.start / 1000) * 1000) / 60000;
  }
  return {
    ...activity,
    timezone:
      sourceOffset === undefined
        ? athleteTimezone
        : `UTC${offset < 0 ? "-" : "+"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`,
    localStart: new Date(activity.start + offset * 60000)
      .toISOString()
      .replace(/Z$/, ""),
    utcOffsetMinutes: offset,
    timezoneSource:
      sourceOffset === undefined ? "athlete-preference" : "file-offset",
    parserVersion: VERSION,
    normalizationVersion: VERSION,
    processedAt: now,
  };
}
