import { expect, it } from "vitest";
import { dateBounds, localTimestamp, moveToDate, localInput } from "./calendar";
it("uses athlete calendar boundaries and preserves workout clock time across DST", () => {
  const spring = dateBounds("2026-03-29", "2026-03-29", "Europe/Berlin");
  const fall = dateBounds("2026-10-25", "2026-10-25", "Europe/Berlin");
  expect(spring.to - spring.from + 1).toBe(23 * 3600000);
  expect(fall.to - fall.from + 1).toBe(25 * 3600000);
  expect(() => localTimestamp("2026-03-29T02:30", "Europe/Berlin")).toThrow(
    "does not exist",
  );
  const moved = moveToDate(
    Date.parse("2026-03-28T09:00Z"),
    "2026-03-29",
    "Europe/Berlin",
  );
  expect(localInput(moved, "Europe/Berlin")).toBe("2026-03-29T10:00");
  expect(new Date(moved).toISOString()).toBe("2026-03-29T08:00:00.000Z");
});
