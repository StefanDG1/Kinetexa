export type TimerWindow = { from: number; to: number };

// Build a complete active-timer schedule only when the initial state is known.
export function timerWindows(
  events: { timestamp?: unknown; event?: unknown; event_type?: unknown }[],
  start: number,
  duration: number,
  reportedTimer?: number,
): TimerWindow[] | undefined {
  const transitions = events
    .flatMap((event) => {
      if (event.event !== "timer") return [];
      const kind = String(event.event_type);
      const active = ["start", "begin_deprecated"].includes(kind)
        ? true
        : [
              "stop",
              "stop_all",
              "stop_disable",
              "stop_disable_all",
              "end_deprecated",
              "end_all_deprecated",
            ].includes(kind)
          ? false
          : undefined;
      const timestamp =
        event.timestamp instanceof Date
          ? event.timestamp.getTime()
          : Date.parse(String(event.timestamp));
      return active === undefined || !Number.isFinite(timestamp)
        ? []
        : [{ at: (timestamp - start) / 1000, active }];
    })
    .sort((a, b) => a.at - b.at);
  if (!transitions.length || duration <= 0) return undefined;
  let active: boolean | undefined;
  let cursor = 0;
  const windows: TimerWindow[] = [];
  for (const event of transitions) {
    if (event.at > duration) break;
    if (event.at > cursor) {
      if (active === undefined) return undefined;
      if (active) windows.push({ from: cursor, to: event.at });
    }
    active = event.active;
    cursor = Math.max(0, event.at);
  }
  if (active === undefined) return undefined;
  if (active && cursor < duration) windows.push({ from: cursor, to: duration });
  const total = windows.reduce((sum, w) => sum + w.to - w.from, 0);
  // FIT event timestamps have second precision; reject larger timer disagreements.
  if (reportedTimer !== undefined && Math.abs(total - reportedTimer) > 1)
    return undefined;
  return windows;
}
