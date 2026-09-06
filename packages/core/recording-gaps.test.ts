import { it, expect } from "vitest";
import { parseActivity } from "./import";
import { routeSegments, simplifySegments } from "./geo";
import { seconds, zones, bestDistances } from "./analytics";
it("preserves explicit GPX breaks in distance, route segments, sensor coverage and best-effort windows", async () => {
  const point = (second: number, lon: number) =>
    `<trkpt lat="0" lon="${lon}"><time>2026-09-06T12:00:${String(second).padStart(2, "0")}Z</time><extensions><power>100</power></extensions></trkpt>`;
  const xml = `<gpx><trk><type>running</type><trkseg>${point(0, 0)}${point(10, 0.0001)}</trkseg><trkseg>${point(11, 0.0002)}${point(21, 0.0003)}</trkseg></trk></gpx>`;
  const a = await parseActivity("segments.gpx", new TextEncoder().encode(xml));
  expect(a.distance).toBeCloseTo(22.2389853, 5);
  expect(a.samples[2].breakBefore).toBe(true);
  expect(routeSegments(a.samples)).toHaveLength(2);
  expect(seconds(a.samples, "power")[10]).toBeNull();
  expect(zones(a.samples, "power", [50])).toEqual([0, 20]);
  expect(bestDistances(a.samples, [15])[0].duration).toBeNull();
});
it("does not join missing GPS, long gaps or impossible jumps, including simplified geometry", () => {
  const samples = [
    { t: 0, lat: 0, lon: 0 },
    { t: 1, lat: 0, lon: 0.00001 },
    { t: 2 },
    { t: 3, lat: 0, lon: 0.00002 },
    { t: 4, lat: 0, lon: 0.00003 },
    { t: 100, lat: 0, lon: 0.00004 },
    { t: 101, lat: 0, lon: 0.00005 },
    { t: 102, lat: 1, lon: 1 },
    { t: 103, lat: 1, lon: 1.00001 },
  ];
  const segments = routeSegments(samples);
  expect(segments).toHaveLength(4);
  expect(simplifySegments(segments, 4)).toHaveLength(2);
  for (const segment of simplifySegments(segments, 4))
    expect(segments).toContainEqual(segment);
});
