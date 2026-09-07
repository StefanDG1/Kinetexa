import { it, expect } from "vitest";
import { FitEncoder, FitBaseType } from "fit-file-parser";
import {
  parseActivity,
  activityPartCount,
  normalize,
  decodeFit,
  parseFitHealth,
} from "./import";
import { explicitOffset, withTimeContext } from "./time-context";
import { analyzeInterval } from "./interval";
import type { Activity } from "./model";
it("records local starts with DST-aware athlete fallback and preserves explicit source offsets", () => {
  const activity: Activity = {
    title: "Run",
    sport: "running",
    start: Date.parse("2026-03-29T00:30:00Z"),
    duration: 60,
    samples: [],
    laps: [],
  };
  expect(withTimeContext(activity, "Europe/Berlin", 1)).toMatchObject({
    localStart: "2026-03-29T01:30:00.000",
    utcOffsetMinutes: 60,
    timezoneSource: "athlete-preference",
    processedAt: 1,
  });
  expect(
    withTimeContext(
      { ...activity, start: activity.start + 3600000 },
      "Europe/Berlin",
      1,
    ),
  ).toMatchObject({
    localStart: "2026-03-29T03:30:00.000",
    utcOffsetMinutes: 120,
  });
  expect(
    withTimeContext(
      { ...activity, utcOffsetMinutes: 345, timezoneSource: "file-offset" },
      "America/New_York",
      1,
    ),
  ).toMatchObject({
    localStart: "2026-03-29T06:15:00.000",
    timezone: "UTC+05:45",
    utcOffsetMinutes: 345,
    timezoneSource: "file-offset",
  });
  expect(explicitOffset("2026-01-01T00:00:00Z")).toBeUndefined();
  expect(explicitOffset("2026-01-01T00:00:00-03:30")).toBe(-210);
});
it("separates FIT sessions, preserves sensor fields and uses each session's distance origin", async () => {
  const e = new FitEncoder(),
    at = FitEncoder.toFitTimestamp(new Date("2026-09-01T00:00:00Z"));
  const uint = (number: number, value: number) => ({
    number,
    value,
    size: 4,
    baseType: FitBaseType.Uint32,
  });
  for (let part = 0; part < 2; part++) {
    e.writeMessage(18, [
      uint(253, at + part * 100 + 20),
      uint(2, at + part * 100),
      { number: 5, value: part + 1, size: 1, baseType: FitBaseType.Enum },
      uint(7, 20000),
      uint(9, 10000),
    ]);
    for (let t = 0; t <= 20; t += 10)
      e.writeMessage(20, [
        uint(253, at + part * 100 + t),
        uint(5, (part * 100 + t * 5) * 100),
        { number: 6, size: 2, baseType: FitBaseType.Uint16, value: 5000 },
        { number: 7, size: 2, baseType: FitBaseType.Uint16, value: 250 },
        { number: 32, size: 2, baseType: FitBaseType.Sint16, value: -500 },
        { number: 39, size: 2, baseType: FitBaseType.Uint16, value: 850 },
        { number: 41, size: 2, baseType: FitBaseType.Uint16, value: 2400 },
        { number: 43, size: 1, baseType: FitBaseType.Uint8, value: 160 },
        { number: 31, size: 1, baseType: FitBaseType.Uint8, value: 3 },
      ]);
  }
  const bytes = e.close();
  const decoded = await decodeFit(bytes);
  expect(await parseFitHealth(bytes, decoded)).toEqual([]);
  expect(await activityPartCount("multi.fit", bytes, decoded)).toBe(2);
  await expect(parseActivity("multi.fit", bytes)).rejects.toThrow(
    "multiple sessions",
  );
  const run = await parseActivity("multi.fit", bytes, 0, decoded),
    ride = await parseActivity("multi.fit", bytes, 1);
  await expect(parseActivity("multi.fit", bytes, 1, decoded)).rejects.toThrow(
    "already been consumed",
  );
  await expect(parseFitHealth(bytes, decoded)).rejects.toThrow(
    "already been consumed",
  );
  expect(run.sport).toBe("running");
  expect(ride.sport).toBe("cycling");
  for (const a of [run, ride]) {
    expect(a.samples.map((s) => s.t)).toEqual([0, 10, 20]);
    expect(a.samples.map((s) => s.distance)).toEqual([0, 50, 100]);
    expect(a.distance).toBe(100);
    expect(a.samples[0]).toMatchObject({
      verticalSpeed: -0.5,
      runningDynamics: { vertical_oscillation: 85, stance_time: 240 },
      cyclingDynamics: { left_torque_effectiveness: 80 },
      sourceFields: { gps_accuracy: 3 },
    });
  }
  expect(run.samples[0]).toMatchObject({
    runningPower: 250,
    paceSecondsPerKm: 200,
  });
  expect(ride.samples[0].runningPower).toBeUndefined();
  expect(ride.sourceMetadata).toMatchObject({
    sessionIndex: 1,
    sessionCount: 2,
  });
});
it("keeps XML extensions and every GPX track or TCX activity", async () => {
  const track = (name: string, hour: string) =>
    `<trk><name>${name}</name><type>running</type><trkseg><trkpt lat="45" lon="25"><time>2026-09-01T${hour}:00:00+03:00</time><extensions><custom><value>8</value><units>widgets</units></custom></extensions></trkpt><trkpt lat="45.0001" lon="25"><time>2026-09-01T${hour}:00:10+03:00</time></trkpt></trkseg></trk>`;
  const bytes = new TextEncoder().encode(
    `<gpx>${track("One", "10")}${track("Two", "11")}</gpx>`,
  );
  expect(await activityPartCount("multi.gpx", bytes)).toBe(2);
  await expect(parseActivity("multi.gpx", bytes)).rejects.toThrow(
    "multiple tracks",
  );
  expect(await parseActivity("multi.gpx", bytes, 1)).toMatchObject({
    title: "Two",
    utcOffsetMinutes: 180,
    timezoneSource: "file-offset",
    duration: 10,
    samples: [
      { sourceFields: { custom: { value: "8", units: "widgets" } } },
      {},
    ],
  });
  const tcx = new TextEncoder().encode(
    '<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-09-01T00:00:00Z</Id><Lap StartTime="2026-09-01T00:00:00Z"><TotalTimeSeconds>30</TotalTimeSeconds><DistanceMeters>100</DistanceMeters></Lap></Activity><Activity Sport="Biking"><Id>2026-09-02T00:00:00Z</Id><Lap StartTime="2026-09-02T00:00:00Z"><TotalTimeSeconds>60</TotalTimeSeconds><DistanceMeters>200</DistanceMeters></Lap></Activity></Activities></TrainingCenterDatabase>',
  );
  expect(await activityPartCount("multi.tcx", tcx)).toBe(2);
  expect(await parseActivity("multi.tcx", tcx, 1)).toMatchObject({
    sport: "cycling",
    duration: 60,
    distance: 200,
  });
});
it("derives vertical speed only over recorded intervals and distinguishes pace from speed", () => {
  const a = normalize({
    title: "Run",
    sport: "running",
    start: 1,
    duration: 60,
    distance: 150,
    laps: [],
    samples: [
      { t: 0, altitude: 100, speed: 2.5 },
      { t: 10, altitude: 105, speed: 2.5 },
      { t: 60, altitude: 200 },
    ],
  });
  expect(a.samples[1]).toMatchObject({
    verticalSpeed: 0.5,
    paceSecondsPerKm: 400,
  });
  expect(a.samples[2].verticalSpeed).toBeUndefined();
  expect(a.avgPaceSecondsPerKm).toBe(400);
});
it("distinguishes stationary movement from missing or rejected speed and refuses sparse extrapolation", () => {
  const base = {
    title: "Movement",
    sport: "running" as const,
    start: 1,
    duration: 10,
    laps: [],
  };
  const stationary = normalize({
    ...base,
    samples: [
      { t: 0, speed: 0 },
      { t: 10, speed: 0 },
    ],
  });
  expect(stationary).toMatchObject({
    movingDuration: 0,
    movingDurationSource: "speed-estimate",
    movingDurationCoverageSeconds: 10,
  });
  expect(normalize(stationary)).toEqual(stationary);
  for (const samples of [
    [{ t: 0 }, { t: 10 }],
    [
      { t: 0, speed: 70 },
      { t: 10, speed: 70 },
    ],
    [{ t: 0, speed: 2 }, { t: 1, speed: 2 }, { t: 10 }],
    [
      { t: 0, speed: 2 },
      { t: 10, speed: 2, breakBefore: true },
    ],
  ])
    expect(normalize({ ...base, samples }).movingDuration).toBeUndefined();
  const moving = normalize({
    ...base,
    samples: [
      { t: 0, speed: 2 },
      { t: 10, speed: 2 },
    ],
  });
  expect(moving.movingDuration).toBe(10);
  expect(
    normalize({
      ...base,
      duration: 5,
      samples: [
        { t: 0, speed: 2 },
        { t: 10, speed: 2 },
      ],
    }).movingDuration,
  ).toBe(5);
});
it("preserves distinct FIT elapsed, timer and supplied moving durations without treating paused time as movement", async () => {
  const at = FitEncoder.toFitTimestamp(new Date("2026-09-01T00:00:00Z"));
  const uint = (number: number, value: number) => ({
    number,
    value,
    size: 4,
    baseType: FitBaseType.Uint32,
  });
  async function read(moving?: number, events = false) {
    const e = new FitEncoder();
    e.writeMessage(18, [
      uint(253, at + 10),
      uint(2, at),
      uint(7, 10000),
      uint(8, 8000),
      { number: 5, value: 1, size: 1, baseType: FitBaseType.Enum },
      ...(moving === undefined ? [] : [uint(59, moving * 1000)]),
    ]);
    for (const t of [0, 2, 4, 6, 8, 10])
      e.writeMessage(20, [
        uint(253, at + t),
        { number: 6, value: 2000, size: 2, baseType: FitBaseType.Uint16 },
      ]);
    if (events)
      for (const [t, type] of [
        [0, 0],
        [4, 1],
        [6, 0],
        [10, 4],
      ])
        e.writeMessage(21, [
          uint(253, at + t),
          { number: 0, value: 0, size: 1, baseType: FitBaseType.Enum },
          { number: 1, value: type, size: 1, baseType: FitBaseType.Enum },
        ]);
    return parseActivity("timers.fit", e.close());
  }
  expect(await read(2)).toMatchObject({
    duration: 10,
    timerDuration: 8,
    movingDuration: 2,
    movingDurationSource: "source",
  });
  expect((await read()).movingDuration).toBeUndefined();
  expect((await read(0)).movingDuration).toBe(0);
  expect((await read(9)).movingDuration).toBeUndefined();
  const paused = await read(undefined, true);
  expect(paused).toMatchObject({
    timerDuration: 8,
    movingDuration: 8,
    movingDurationSource: "speed-estimate",
    movingDurationCoverageSeconds: 8,
    timerWindows: [
      { from: 0, to: 4 },
      { from: 6, to: 10 },
    ],
  });
  expect(analyzeInterval(paused, 2, 8, {}).summary).toMatchObject({
    duration: 6,
    timerDuration: 4,
    movingDuration: 4,
  });
  expect(analyzeInterval(paused, 4, 6, {}).summary).toMatchObject({
    duration: 2,
    timerDuration: 0,
    movingDuration: 0,
  });
  expect(
    analyzeInterval(await read(), 2, 8, {}).summary?.movingDuration,
  ).toBeUndefined();
});
