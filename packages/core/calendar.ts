import {
  fromDate,
  parseDate,
  parseDateTime,
  toCalendarDate,
  toCalendarDateTime,
} from "@internationalized/date";

export function calendarDate(at: number, timezone: string) {
  return toCalendarDate(fromDate(new Date(at), timezone)).toString();
}
export function localInput(at: number, timezone: string) {
  return toCalendarDateTime(fromDate(new Date(at), timezone))
    .toString()
    .slice(0, 16);
}
export function localTimestamp(value: string, timezone: string) {
  const timestamp = parseDateTime(value).toDate(timezone, "earlier").getTime();
  if (localInput(timestamp, timezone) !== value.slice(0, 16))
    throw new Error(
      "That local time does not exist because the clocks change. Choose another time.",
    );
  return timestamp;
}
export function dateBounds(from: string, to: string, timezone: string) {
  const first = parseDate(from),
    last = parseDate(to);
  if (first.compare(last) > 0) throw new Error("Choose an ordered date range.");
  return {
    from: first.toDate(timezone).getTime(),
    to: last.add({ days: 1 }).toDate(timezone).getTime() - 1,
  };
}
export function moveToDate(at: number, day: string, timezone: string) {
  return localTimestamp(
    `${day}T${localInput(at, timezone).split("T")[1]}`,
    timezone,
  );
}
export function selectedRange(
  range: string,
  from: string,
  to: string,
  timezone: string,
  now: number,
) {
  const today = parseDate(calendarDate(now, timezone));
  if (range === "custom") return dateBounds(from, to, timezone);
  if (range === "all") return { from: 0, to: now };
  const first =
    range === "ytd"
      ? today.set({ month: 1, day: 1 })
      : today.subtract({ days: Number(range) - 1 });
  return { from: first.toDate(timezone).getTime(), to: now };
}
