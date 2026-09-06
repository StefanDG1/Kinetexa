import { it, expect } from "vitest";
import { parseActivity, activityPartCount } from "./import";
import { activityJsonChunks } from "./activity-json";
import type { Activity } from "./model";
const bytes = (text: string) => new TextEncoder().encode(text);
it("streams namespace-qualified XML, UTF-8, escaped text and extensions while preserving recording breaks", async () => {
  const point = (time: number) =>
    `<g:trkpt lat="45" lon="25"><g:time>2026-09-01T00:00:${String(time).padStart(2, "0")}Z</g:time><g:extensions><sensor:TrackPointExtension><sensor:hr>150</sensor:hr><sensor:cad>80</sensor:cad></sensor:TrackPointExtension><custom unit="widgets">7</custom></g:extensions></g:trkpt>`;
  const xml = bytes(
    `<g:gpx xmlns:g="urn:gpx" xmlns:sensor="urn:sensor"><!--${" ".repeat(65450)}--><g:trk><g:name>Râul &amp; pădurea</g:name><g:type>running</g:type><g:trkseg>${point(0)}${point(10)}</g:trkseg><g:trkseg>${point(11)}${point(20)}</g:trkseg></g:trk></g:gpx>`,
  );
  expect(await activityPartCount("run.gpx", xml)).toBe(1);
  const a = await parseActivity("run.gpx", xml);
  expect(a.title).toBe("Râul & pădurea");
  expect(a.samples.map((s) => s.t)).toEqual([0, 10, 11, 20]);
  expect(a.samples.map((s) => Boolean(s.breakBefore))).toEqual([
    true,
    false,
    true,
    false,
  ]);
  expect(a.samples[0]).toMatchObject({
    hr: 150,
    cadence: 80,
    sourceFields: { custom: { "@_unit": "widgets", "#text": "7" } },
  });
  const tcx = bytes(
    '<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>2026-09-01T00:00:00Z</Id><Lap StartTime="2026-09-01T00:00:00Z"><TotalTimeSeconds>20</TotalTimeSeconds><DistanceMeters>100</DistanceMeters><Track><Trackpoint><Time>2026-09-01T00:00:00Z</Time><Extensions><TPX><Watts>200</Watts><Speed>5</Speed></TPX></Extensions></Trackpoint></Track><Track><Trackpoint><Time>2026-09-01T00:00:20Z</Time><DistanceMeters>100</DistanceMeters></Trackpoint></Track></Lap><Creator><Name>Sensor</Name></Creator></Activity></Activities></TrainingCenterDatabase>',
  );
  const b = await parseActivity("ride.tcx", tcx);
  expect(b.sourceMetadata).toMatchObject({ creator: { Name: "Sensor" } });
  expect(b.laps).toEqual([{ start: 0, duration: 20, distance: 100 }]);
  expect(b.samples[0]).toMatchObject({ power: 200, speed: 5 });
  expect(b.samples[1].breakBefore).toBe(true);
});
it("rejects malformed XML, custom entities, excessive nesting and broken UTF-8 without exposing parser text", async () => {
  for (const xml of [
    "<gpx><trk></gpx>",
    '<!DOCTYPE gpx [<!ENTITY private "secret">]><gpx/>',
    "<gpx><trk><name>&private;</name></trk></gpx>",
    `<gpx>${"<x>".repeat(65)}${"</x>".repeat(65)}</gpx>`,
  ]) {
    await expect(parseActivity("bad.gpx", bytes(xml))).rejects.toThrow(
      /malformed|entities|nesting limit/,
    );
    await expect(activityPartCount("bad.gpx", bytes(xml))).rejects.toThrow(
      /malformed|entities|nesting limit/,
    );
  }
  await expect(
    parseActivity("bad.gpx", new Uint8Array([60, 103, 112, 120, 62, 255])),
  ).rejects.toThrow();
});
it("serializes canonical recordings across chunk boundaries without changing data or escaping", () => {
  const a: Activity = {
    title: 'Quotes " and café\n',
    sport: "running",
    start: 1,
    duration: 2000,
    timerWindows: Array.from({ length: 2001 }, (_, i) => ({
      from: i * 0.5,
      to: i * 0.5 + 0.25,
    })),
    laps: [],
    samples: Array.from({ length: 2001 }, (_, t) => ({
      t,
      sourceFields: { label: 'Line\n"quoted"', value: t },
    })),
  };
  const chunks = [...activityJsonChunks(a)];
  expect(chunks.length).toBeGreaterThan(3);
  expect(JSON.parse(chunks.join(""))).toEqual(a);
  expect(
    JSON.parse([...activityJsonChunks({ ...a, samples: [] })].join("")),
  ).toEqual({ ...a, samples: [] });
});
