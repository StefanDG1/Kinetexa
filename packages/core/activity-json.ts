import type { Activity } from "./model";

// Emit standard JSON without keeping a second full recording as a string/buffer.
export function* activityJsonChunks(activity: Activity): Generator<string> {
  const { samples, timerWindows, ...metadata } = activity;
  yield JSON.stringify(metadata).slice(0, -1);
  for (const [key, rows] of [
    ["timerWindows", timerWindows],
    ["samples", samples],
  ] as const) {
    if (rows === undefined) continue;
    yield `,"${key}":[`;
    for (let offset = 0; offset < rows.length; offset += 1000) {
      if (offset) yield ",";
      yield JSON.stringify(rows.slice(offset, offset + 1000)).slice(1, -1);
    }
    yield "]";
  }
  yield "}";
}
