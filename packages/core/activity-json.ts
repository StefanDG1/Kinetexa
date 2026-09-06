import type { Activity } from "./model";

// Emit standard JSON without keeping a second full recording as a string/buffer.
export function* activityJsonChunks(activity: Activity): Generator<string> {
  const { samples, ...metadata } = activity;
  yield JSON.stringify(metadata).slice(0, -1) + ',"samples":[';
  for (let offset = 0; offset < samples.length; offset += 1000) {
    if (offset) yield ",";
    yield JSON.stringify(samples.slice(offset, offset + 1000)).slice(1, -1);
  }
  yield "]}";
}
