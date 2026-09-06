import { expect, it } from "vitest";
import { timerWindows } from "./timer";

it("requires a known initial timer state and rejects schedules inconsistent with the source summary", () => {
  const start = Date.parse("2026-09-01T00:00:00Z");
  const event = (t: number, event_type: string) => ({
    event: "timer",
    event_type,
    timestamp: new Date(start + t * 1000),
  });
  expect(
    timerWindows([event(3, "stop"), event(5, "start")], start, 10, 8),
  ).toBeUndefined();
  expect(
    timerWindows([event(0, "start"), event(4, "stop_all")], start, 10, 8),
  ).toBeUndefined();
  expect(
    timerWindows(
      [event(-2, "start"), event(4, "stop_disable_all"), event(6, "start")],
      start,
      10,
      8,
    ),
  ).toEqual([
    { from: 0, to: 4 },
    { from: 6, to: 10 },
  ]);
  expect(
    timerWindows([event(0, "start"), event(4, "stop_all")], start, 10),
  ).toEqual([{ from: 0, to: 4 }]);
});
