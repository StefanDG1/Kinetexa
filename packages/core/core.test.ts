import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { gzipSync } from "node:zlib";
import {
  parseActivity,
  unpackArchive,
  duplicateConfidence,
  parseFitHealth,
  LIMITS,
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
import { goalProgress } from "./goals";
import { dashboardData } from "./dashboard";
import { aggregateHealthFile, dailyHealth } from "./health";
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
  it("reads quoted migration descriptions and matches filenames without changing bytes", async () => {
    const bytes = strToU8("original activity bytes");
    const result = await unpackArchive(
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
  it("decodes source-provided HRV, weight, VO2, steps and closed sleep intervals with their units", async () => {
    const encoder = new FitEncoder(),
      at = FitEncoder.toFitTimestamp(new Date("2026-09-02T06:00:00Z")),
      time = (number = 253, value = at) => ({
        number,
        size: 4,
        baseType: FitBaseType.Uint32,
        value,
      });
    encoder.writeMessage(370, [
      time(),
      { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 50 * 128 },
    ]);
    encoder.writeMessage(30, [
      time(),
      { number: 0, size: 2, baseType: FitBaseType.Uint16, value: 70 * 100 },
    ]);
    encoder.writeMessage(229, [
      time(0),
      { number: 2, size: 2, baseType: FitBaseType.Uint16, value: 55 * 10 },
    ]);
    encoder.writeMessage(55, [
      time(),
      { number: 3, size: 4, baseType: FitBaseType.Uint32, value: 2000 },
      { number: 5, size: 1, baseType: FitBaseType.Enum, value: 1 },
    ]);
    encoder.writeMessage(275, [
      time(253, at - 8 * 3600),
      { number: 0, size: 1, baseType: FitBaseType.Enum, value: 2 },
    ]);
    encoder.writeMessage(275, [
      time(),
      { number: 0, size: 1, baseType: FitBaseType.Enum, value: 1 },
    ]);
    const rows = await parseFitHealth(encoder.close());
    expect(rows.map((r) => [r.kind, r.value, r.unit])).toEqual(
      expect.arrayContaining([
        ["hrv", 50, "ms"],
        ["weight", 70, "kg"],
        ["vo2max", 55, "ml/kg/min"],
        ["steps", 2000, "steps"],
        ["sleep", 28800, "seconds"],
      ]),
    );
    const open = new FitEncoder();
    open.writeMessage(275, [
      time(),
      { number: 0, size: 1, baseType: FitBaseType.Enum, value: 2 },
    ]);
    expect(await parseFitHealth(open.close())).toEqual([]);
    const file = aggregateHealthFile(
      [
        {
          at: Date.parse("2026-09-02T01:00:00Z"),
          kind: "steps",
          value: 1000,
          unit: "steps",
        },
        {
          at: Date.parse("2026-09-02T03:00:00Z"),
          kind: "steps",
          value: 2000,
          unit: "steps",
        },
      ],
      "Europe/Berlin",
    );
    expect(file).toHaveLength(1);
    expect(file[0].value).toBe(2000);
    expect(
      dailyHealth([
        { date: "2026-09-02", kind: "steps", value: 2000 },
        { date: "2026-09-02", kind: "steps", value: 1500 },
      ])[0].value,
    ).toBe(2000);
  });
});
describe("deterministic training calculations", () => {
  it("assigns late-UTC Sunday training to the athlete's Monday and handles lower-is-better race targets", () => {
    const row = {
      ...ride,
      _id: "fixture",
      start: Date.parse("2026-09-06T22:30:00Z"),
      gearIds: [],
      tags: [],
      summary: { ...ride },
      metrics: analyze(ride, { ftp: 200 }),
    };
    const d = dashboardData(
      [row],
      Date.parse("2026-09-01"),
      Date.parse("2026-09-07T12:00:00Z"),
      "Europe/Berlin",
    );
    expect(d.currentWeek.count).toBe(1);
    expect(d.previousWeek.count).toBe(0);
    expect(d.curve.at(-1)?.date).toBe("2026-09-07");
    const goal = {
      kind: "raceTime",
      target: 240,
      start: 0,
      end: 1000,
      manualProgress: 300,
    };
    expect(goalProgress(goal, [], 500).percent).toBe(80);
    expect(
      goalProgress({ ...goal, manualProgress: 230 }, [], 500).percent,
    ).toBe(100);
    expect(goalProgress(goal, [], 500).projected).toBeNull();
  });
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
    expect(f[1].chronic).toBeCloseTo(f[0].chronic! * Math.exp(-1 / 42));
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
  it("rejects traversal, nested archives and expansion bombs before decompression", async () => {
    const cases: Record<string, Uint8Array>[] = [
      { "../x.fit": strToU8("bad") },
      { "nested.zip": strToU8("bad") },
      { "huge.gpx": new Uint8Array(2 * 1024 * 1024) },
    ];
    for (const files of cases)
      await expect(unpackArchive(zipSync(files))).rejects.toThrow();
  });
  it("validates gzip CRC and length and bounds actual output even when its footer lies", async () => {
    const bytes = strToU8("<gpx></gpx>"),
      compressed = gzipSync(bytes);
    const archive = (data: Uint8Array) =>
      zipSync({ "activity.gpx.gz": data }, { level: 0 });
    expect((await unpackArchive(archive(compressed)))[0].bytes).toEqual(bytes);
    const crc = Uint8Array.from(compressed);
    crc[crc.length - 8] ^= 1;
    await expect(unpackArchive(archive(crc))).rejects.toThrow();
    const length = Uint8Array.from(compressed);
    length[length.length - 4] = 1;
    await expect(unpackArchive(archive(length))).rejects.toThrow();
    const bomb = gzipSync(new Uint8Array(LIMITS.fileBytes + 1));
    bomb.writeUInt32LE(1, bomb.length - 4);
    await expect(unpackArchive(archive(bomb))).rejects.toThrow();
    const members = Buffer.concat([
      gzipSync(strToU8("<gpx>")),
      gzipSync(strToU8("</gpx>")),
    ]);
    expect((await unpackArchive(archive(members)))[0].bytes).toEqual(bytes);
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
