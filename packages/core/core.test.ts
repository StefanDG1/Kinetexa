import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  parseActivity,
  unpackArchive,
  duplicateConfidence,
  parseFitHealth,
} from "./import";
import { FitEncoder, FitBaseType } from "fit-file-parser";
import {
  analyze,
  bestDistances,
  bestDurations,
  fitness,
  zones,
} from "./analytics";
import { maskedRoute } from "./geo";
import type { Activity } from "./model";
const ride: Activity = {
  title: "Synthetic constant power ride",
  sport: "cycling",
  start: Date.UTC(2026, 0, 1),
  duration: 3600,
  distance: 36000,
  laps: [],
  samples: Array.from({ length: 3601 }, (_, t) => ({
    t,
    power: 200,
    hr: 150,
    speed: 10,
    distance: t * 10,
  })),
};
describe("retained source metadata", () => {
  it("reads quoted migration descriptions and matches filenames without changing bytes", () => {
    const bytes = strToU8("original activity bytes");
    const result = unpackArchive(
      zipSync({
        "activities/1.fit": bytes,
        "activities.csv": strToU8(
          'Activity ID,Activity Name,Activity Description,Filename,Activity Gear,Commute\n1,"Morning, ride","Two lines\nkept together",activities/1.fit,Road bike,true\n',
        ),
      }),
    );
    expect(result[0].bytes).toEqual(bytes);
    expect(result[0].metadata).toEqual({
      sourceRecordId: "1",
      title: "Morning, ride",
      notes: "Two lines\nkept together",
      gear: "Road bike",
      commute: true,
    });
  });
  it("extracts dated FIT resting heart rate without inventing an activity", async () => {
    const encoder = new FitEncoder();
    encoder.writeMessage(211, [
      {
        number: 253,
        size: 4,
        baseType: FitBaseType.Uint32,
        value: FitEncoder.toFitTimestamp(new Date("2026-09-01T07:00:00Z")),
      },
      { number: 0, size: 1, baseType: FitBaseType.Uint8, value: 48 },
    ]);
    const bytes = encoder.close();
    expect(await parseFitHealth(bytes)).toEqual([
      {
        at: Date.parse("2026-09-01T07:00:00Z"),
        kind: "restingHr",
        value: 48,
        unit: "bpm",
      },
    ]);
    await expect(parseActivity("health.fit", bytes)).rejects.toThrow(
      "No valid activity start",
    );
  });
});
describe("deterministic training calculations", () => {
  it("rejects distance records crossing a recording gap or distance reset", () => {
    for (const samples of [
      [
        { t: 0, distance: 0 },
        { t: 10, distance: 100 },
        { t: 100, distance: 900 },
        { t: 110, distance: 1100 },
      ],
      [
        { t: 0, distance: 0 },
        { t: 10, distance: 900 },
        { t: 20, distance: 0 },
        { t: 30, distance: 200 },
      ],
    ])
      expect(bestDistances(samples, [1000])[0].duration).toBeNull();
  });
  it("explains pace-derived load and enforces the full power duration minimum", () => {
    const running = analyze(
      { ...ride, sport: "running" },
      { thresholdSpeed: 10 },
    );
    expect(running.metrics.load.value).toBeCloseTo(100);
    expect(running.metrics.load.formula).toContain("threshold speed");
    expect(running.metrics.load.inputs.thresholdSpeed).toBe(10);
    expect(
      analyze({ ...ride, duration: 59, samples: ride.samples.slice(0, 60) })
        .metrics.weightedPower.value,
    ).toBeNull();
    expect(
      analyze({ ...ride, duration: 60, samples: ride.samples.slice(0, 61) })
        .metrics.weightedPower.value,
    ).toBeCloseTo(200);
  });
  it("computes one hour at FTP as 100 power-load points", () => {
    const a = analyze(ride, { ftp: 200 });
    expect(a.metrics.weightedPower.value).toBeCloseTo(200);
    expect(a.metrics.load.value).toBeCloseTo(100);
    expect(a.metrics.intensity.value).toBe(1);
    expect(a.metrics.variability.value).toBe(1);
  });
  it("does not invent load without thresholds or power when the stream is missing", () => {
    const a = analyze({
      ...ride,
      samples: ride.samples.map(({ t }) => ({ t })),
    });
    expect(a.metrics.load.value).toBeNull();
    expect(a.metrics.weightedPower.value).toBeNull();
    expect(a.hrZones).toBeNull();
  });
  it("does not fill recording gaps into best efforts", () => {
    expect(
      bestDurations(
        [
          { t: 0, power: 100 },
          { t: 600, power: 100 },
        ],
        "power",
        [60],
      )[0].value,
    ).toBeNull();
  });
  it("counts elapsed zone time, including zero power", () => {
    expect(
      zones(
        [
          { t: 0, power: 0 },
          { t: 10, power: 200 },
          { t: 20, power: 200 },
        ],
        "power",
        [100],
      ),
    ).toEqual([10, 10]);
  });
  it("interpolates the endpoint for distance records", () => {
    expect(bestDistances(ride.samples, [1000])[0].duration).toBeCloseTo(100);
  });
  it("uses exponential decay through a rest day", () => {
    const f = fitness([
      { date: "2026-01-01", load: 100 },
      { date: "2026-01-02", load: 0 },
    ]);
    expect(f[0].chronic).toBeCloseTo(100 * (1 - Math.exp(-1 / 42)));
    expect(f[1].chronic).toBeCloseTo(f[0].chronic * Math.exp(-1 / 42));
  });
});
describe("untrusted imports", () => {
  it("parses a real GPX representation, retaining missing HR", async () => {
    const a = await parseActivity(
      "run.gpx",
      strToU8(
        '<gpx><trk><name>Morning run</name><type>running</type><trkseg><trkpt lat="50" lon="8"><time>2026-01-01T10:00:00Z</time></trkpt><trkpt lat="50.0001" lon="8.0001"><time>2026-01-01T10:00:10Z</time></trkpt></trkseg></trk></gpx>',
      ),
    );
    expect(a.sport).toBe("running");
    expect(a.duration).toBe(10);
    expect(a.distance).toBeGreaterThan(10);
    expect(a.avgHr).toBeUndefined();
  });
  it("rejects malformed FIT and XML entities", async () => {
    await expect(
      parseActivity("x.fit", new Uint8Array([0, 1, 2])),
    ).rejects.toThrow();
    await expect(
      parseActivity("x.gpx", strToU8("<!DOCTYPE x><gpx/>")),
    ).rejects.toThrow("entities");
  });
  it("rejects traversal, nested archives and expansion bombs before decompression", () => {
    const cases: Record<string, Uint8Array>[] = [
      { "../x.fit": strToU8("bad") },
      { "nested.zip": strToU8("bad") },
      { "huge.gpx": new Uint8Array(2 * 1024 * 1024) },
    ];
    for (const files of cases)
      expect(() => unpackArchive(zipSync(files))).toThrow();
  });
  it("only suggests uncertain duplicates without merging records", () => {
    expect(
      duplicateConfidence(ride, { ...ride, start: ride.start + 5000 }),
    ).toBe(0.95);
    expect(duplicateConfidence(ride, { ...ride, distance: undefined })).toBe(
      0.7,
    );
  });
});
describe("public geometry", () => {
  it("splits private areas and checks sparse edges crossing a privacy zone", () => {
    expect(
      maskedRoute(
        [
          [-0.02, 0],
          [-0.01, 0],
          [0.01, 0],
          [0.02, 0],
        ],
        [{ lat: 0, lon: 0, radius: 500 }],
        0,
      ),
    ).toEqual([
      [
        [-0.02, 0],
        [-0.01, 0],
      ],
    ]);
  });
  it("trims endpoints even without a configured zone", () => {
    const r = maskedRoute(
      [
        [0, 0],
        [0.001, 0],
        [0.004, 0],
        [0.008, 0],
        [0.012, 0],
        [0.014, 0],
      ],
      [],
    );
    expect(r.flat()).not.toContainEqual([0, 0]);
    expect(r.flat()).not.toContainEqual([0.014, 0]);
  });
});
