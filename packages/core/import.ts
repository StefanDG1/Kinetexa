import FitParser from "fit-file-parser";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { unzipSync, gunzipSync } from "fflate";
import { parse as parseCsv } from "csv-parse/sync";
import {
  activitySchema,
  clean,
  type Activity,
  type Sample,
  type Sport,
} from "./model";
import { meters } from "./geo";
import { weighted } from "./analytics";

export const LIMITS = {
  fileBytes: 32 * 1024 * 1024,
  archiveBytes: 128 * 1024 * 1024,
  expandedBytes: 256 * 1024 * 1024,
  entries: 10000,
};
const list = <T>(x: T | T[] | undefined): T[] =>
  x === undefined ? [] : Array.isArray(x) ? x : [x];
const num = (v: unknown): number | undefined =>
  v === undefined || v === null || v === ""
    ? undefined
    : Number.isFinite(Number(v))
      ? Number(v)
      : undefined;
const timestamp = (v: unknown) =>
  v instanceof Date ? v.getTime() : Date.parse(String(v));
function sport(v: unknown): Sport {
  const s = String(v).toLowerCase();
  return /run/.test(s)
    ? "running"
    : /bik|cycl|bicy/.test(s)
      ? "cycling"
      : /swim/.test(s)
        ? "swimming"
        : /walk|hik/.test(s)
          ? "walking"
          : "other";
}
export function normalize(input: Activity): Activity {
  if (!Number.isFinite(input.start))
    throw new Error("No valid activity start time.");
  const samples = input.samples
    .filter((s) => Number.isFinite(s.t) && s.t >= 0)
    .sort((a, b) => a.t - b.t)
    .filter((s, i, a) => i === 0 || s.t !== a[i - 1].t);
  let distance = 0,
    gain = 0,
    loss = 0,
    moving = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i],
      p = samples[i - 1];
    if (s.lat !== undefined && Math.abs(s.lat) > 90) delete s.lat;
    if (s.lon !== undefined && Math.abs(s.lon) > 180) delete s.lon;
    if (p) {
      const dt = s.t - p.t;
      if (
        s.distance === undefined &&
        p.lat !== undefined &&
        p.lon !== undefined &&
        s.lat !== undefined &&
        s.lon !== undefined &&
        dt <= 30
      ) {
        const d = meters([p.lon, p.lat], [s.lon, s.lat]);
        if (d / dt < 35) distance += d;
      } else if (s.distance !== undefined)
        distance = Math.max(distance, s.distance);
      if (
        s.distance === undefined &&
        s.lat !== undefined &&
        s.lon !== undefined
      )
        s.distance = distance;
      if (
        s.speed === undefined &&
        s.distance !== undefined &&
        p.distance !== undefined &&
        dt <= 30
      )
        s.speed = Math.max(0, (s.distance - p.distance) / dt);
      if (s.speed !== undefined && s.speed > 0.5 && dt <= 30) moving += dt;
      if (s.altitude !== undefined && p.altitude !== undefined && dt <= 30) {
        const delta = s.altitude - p.altitude;
        if (Math.abs(delta) < 30) {
          gain += Math.max(0, delta);
          loss += Math.max(0, -delta);
        }
      }
    }
    if (s.distance === undefined && s.lat !== undefined) s.distance = distance;
    if (s.hr !== undefined && (s.hr < 20 || s.hr > 260)) delete s.hr;
    if (s.power !== undefined && (s.power < 0 || s.power > 3500))
      delete s.power;
    if (s.speed !== undefined && (s.speed < 0 || s.speed > 60)) delete s.speed;
  }
  const duration = input.duration || samples.at(-1)?.t || 0;
  if (duration > 172800)
    throw new Error(
      "An individual activity must be at most 48 hours. Split longer recordings before importing.",
    );
  return activitySchema.parse(
    clean({
      ...input,
      samples,
      duration,
      distance:
        input.distance ??
        (samples.some((s) => s.distance !== undefined) ? distance : undefined),
      movingDuration: input.movingDuration ?? (moving > 0 ? moving : undefined),
      elevationGain:
        input.elevationGain ??
        (samples.some((s) => s.altitude !== undefined) ? gain : undefined),
      elevationLoss:
        input.elevationLoss ??
        (samples.some((s) => s.altitude !== undefined) ? loss : undefined),
      avgHr: weighted(samples, "hr") ?? input.avgHr,
      maxHr:
        input.maxHr ??
        (samples.some((s) => s.hr !== undefined)
          ? samples.reduce((max, s) => Math.max(max, s.hr ?? 0), 0)
          : undefined),
      avgPower: weighted(samples, "power") ?? input.avgPower,
      avgCadence: weighted(samples, "cadence") ?? input.avgCadence,
      avgSpeed:
        weighted(samples, "speed") ??
        input.avgSpeed ??
        (input.distance && duration ? input.distance / duration : undefined),
    }),
  );
}
// Untrusted parser objects stop at this boundary and are validated into Activity.
type Xml = Record<string, any>;
async function decodeFit(bytes: Uint8Array): Promise<Xml> {
  if (bytes.length > LIMITS.fileBytes)
    throw new Error("Activity exceeds the 32 MiB file limit.");
  const parser = new FitParser({
    force: false,
    mode: "list",
    speedUnit: "m/s",
    lengthUnit: "m",
    temperatureUnit: "celsius",
  });
  return new Promise((resolve, reject) =>
    parser.parse(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      (err, data) =>
        err || !data
          ? reject(new Error("FIT file is invalid or its checksum failed."))
          : resolve(data),
    ),
  );
}
export type HealthSample = {
  at: number;
  kind: string;
  value: number;
  unit: string;
};
export async function parseFitHealth(
  bytes: Uint8Array,
): Promise<HealthSample[]> {
  const fit = await decodeFit(bytes),
    messages = fit.messages ?? {},
    out: HealthSample[] = [];
  const add = (
    rows: Xml[],
    kind: string,
    field: string,
    unit: string,
    min: number,
    max: number,
  ) => {
    for (const row of rows) {
      const at = timestamp(row.timestamp),
        value = num(row[field]);
      if (
        Number.isFinite(at) &&
        value !== undefined &&
        value >= min &&
        value <= max
      )
        out.push({ at, kind, value, unit });
    }
  };
  add(
    list(messages.monitoring_hr_data),
    "restingHr",
    "resting_heart_rate",
    "bpm",
    20,
    260,
  );
  add(
    list(messages.hrv_status_summary),
    "hrv",
    "last_night_average",
    "ms",
    0,
    500,
  );
  add(list(messages.weight_scale), "weight", "weight", "kg", 1, 700);
  return out;
}
export async function parseActivity(
  name: string,
  bytes: Uint8Array,
): Promise<Activity> {
  if (bytes.length > LIMITS.fileBytes)
    throw new Error("Activity exceeds the 32 MiB file limit.");
  const ext = name.split(".").at(-1)?.toLowerCase();
  if (ext === "fit") {
    const fit = await decodeFit(bytes);
    const session = list(fit.sessions)[0] ?? {},
      records: Xml[] = list(fit.records);
    const start = timestamp(session.start_time ?? records[0]?.timestamp);
    return normalize({
      title: name.replace(/\.[^.]+$/, ""),
      sport: sport(session.sport),
      subSport: session.sub_sport,
      start,
      duration: num(session.total_elapsed_time) ?? 0,
      movingDuration: num(session.total_timer_time),
      distance: num(session.total_distance),
      elevationGain: num(session.total_ascent),
      elevationLoss: num(session.total_descent),
      avgHr: num(session.avg_heart_rate),
      maxHr: num(session.max_heart_rate),
      avgPower: num(session.avg_power),
      avgCadence: num(session.avg_cadence),
      calories: num(session.total_calories),
      samples: records.map((r) => ({
        t: (timestamp(r.timestamp) - start) / 1000,
        lat: num(r.position_lat),
        lon: num(r.position_long),
        altitude: num(r.enhanced_altitude ?? r.altitude),
        distance: num(r.distance),
        speed: num(r.enhanced_speed ?? r.speed),
        hr: num(r.heart_rate),
        power: num(r.power),
        cadence: num(r.cadence),
        temperature: num(r.temperature),
        grade: num(r.grade),
      })),
      laps: list<Xml>(fit.laps).map((l) => ({
        start: (timestamp(l.start_time) - start) / 1000,
        duration: num(l.total_elapsed_time) ?? 0,
        distance: num(l.total_distance),
      })),
    });
  }
  if (ext !== "gpx" && ext !== "tcx")
    throw new Error("Choose a FIT, TCX or GPX activity.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("XML declarations with entities are not allowed.");
  if (XMLValidator.validate(text) !== true)
    throw new Error("XML is malformed.");
  const xml: Xml = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    processEntities: false,
    parseTagValue: false,
  }).parse(text);
  let points: Xml[] = [],
    title = name,
    start: number,
    s: Sport = "other",
    duration = 0,
    distance: number | undefined,
    laps: Activity["laps"] = [];
  if (ext === "gpx") {
    const tracks = list<Xml>(xml.gpx?.trk);
    title = tracks[0]?.name ?? name;
    s = sport(tracks[0]?.type);
    points = tracks.flatMap((t) =>
      list<Xml>(t.trkseg).flatMap((seg) => list<Xml>(seg.trkpt)),
    );
    start = timestamp(points[0]?.time);
    return normalize({
      title,
      sport: s,
      start,
      duration: 0,
      samples: points.map((p) => {
        const e = p.extensions?.TrackPointExtension ?? p.extensions ?? {};
        return {
          t: (timestamp(p.time) - start) / 1000,
          lat: num(p["@_lat"]),
          lon: num(p["@_lon"]),
          altitude: num(p.ele),
          hr: num(e.hr),
          cadence: num(e.cad),
          power: num(e.power ?? p.extensions?.power),
          temperature: num(e.atemp),
        };
      }),
      laps: [],
    });
  }
  const a = list<Xml>(xml.TrainingCenterDatabase?.Activities?.Activity)[0];
  if (!a) throw new Error("TCX contains no activity.");
  s = sport(a["@_Sport"]);
  const ls = list<Xml>(a.Lap);
  points = ls.flatMap((l) =>
    list<Xml>(l.Track).flatMap((t) => list<Xml>(t.Trackpoint)),
  );
  start = timestamp(a.Id ?? ls[0]?.["@_StartTime"] ?? points[0]?.Time);
  duration = ls.reduce((n, l) => n + (num(l.TotalTimeSeconds) ?? 0), 0);
  distance = ls.some((l) => l.DistanceMeters !== undefined)
    ? ls.reduce((n, l) => n + (num(l.DistanceMeters) ?? 0), 0)
    : undefined;
  laps = ls.map((l) => ({
    start: (timestamp(l["@_StartTime"]) - start) / 1000,
    duration: num(l.TotalTimeSeconds) ?? 0,
    distance: num(l.DistanceMeters),
  }));
  return normalize({
    title,
    sport: s,
    start,
    duration,
    distance,
    laps,
    samples: points.map((p) => ({
      t: (timestamp(p.Time) - start) / 1000,
      lat: num(p.Position?.LatitudeDegrees),
      lon: num(p.Position?.LongitudeDegrees),
      altitude: num(p.AltitudeMeters),
      distance: num(p.DistanceMeters),
      hr: num(p.HeartRateBpm?.Value),
      cadence: num(p.Cadence),
      speed: num(p.Extensions?.TPX?.Speed),
      power: num(p.Extensions?.TPX?.Watts),
    })),
  });
}
export function unpackArchive(
  bytes: Uint8Array,
): { name: string; bytes: Uint8Array; metadata?: MigrationMetadata }[] {
  if (bytes.length > LIMITS.archiveBytes)
    throw new Error(
      "Archive exceeds 128 MiB. Split the archive into smaller uploads.",
    );
  let count = 0,
    total = 0;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      if (++count > LIMITS.entries)
        throw new Error("Archive has too many entries.");
      const name = entry.name;
      if (
        name.includes("\\") ||
        name.startsWith("/") ||
        /^[A-Za-z]:/.test(name) ||
        name.split("/").includes("..")
      )
        throw new Error("Archive contains an unsafe path.");
      if (/\.(zip|7z|rar|tar)$/i.test(name))
        throw new Error("Nested archives are not supported.");
      total += entry.originalSize;
      if (
        total > LIMITS.expandedBytes ||
        entry.originalSize > LIMITS.fileBytes ||
        entry.originalSize > Math.max(1024 * 1024, entry.size * 200)
      )
        throw new Error("Archive expansion limit exceeded.");
      return (
        /\.(fit|tcx|gpx)(\.gz)?$/i.test(name) ||
        /(^|\/)activities\.csv$/i.test(name)
      );
    },
  });
  const metadata = new Map<string, MigrationMetadata>();
  for (const [name, data] of Object.entries(files))
    if (/(^|\/)activities\.csv$/i.test(name)) {
      const rows = parseCsv(data, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        max_record_size: 100000,
        relax_column_count: true,
      }) as Record<string, string>[];
      for (const row of rows) {
        const filename = row.Filename?.replaceAll("\\", "/").replace(
          /\.gz$/i,
          "",
        );
        if (!filename) continue;
        metadata.set(
          filename,
          clean({
            title: row["Activity Name"]?.slice(0, 240),
            notes: row["Activity Description"]?.slice(0, 10000),
            gear: row["Activity Gear"]?.slice(0, 100),
            sourceRecordId: row["Activity ID"]?.slice(0, 100),
            commute: row.Commute === "true" || row.Commute === "1",
          }),
        );
      }
    }
  const out: {
    name: string;
    bytes: Uint8Array;
    metadata?: MigrationMetadata;
  }[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (/\.csv$/i.test(name)) continue;
    const normalizedName = name.replace(/\.gz$/i, "");
    const row =
      metadata.get(normalizedName) ??
      [...metadata].find(([path]) => normalizedName.endsWith("/" + path))?.[1];
    if (/\.gz$/i.test(name)) {
      if (data.length < 4) throw new Error("Invalid compressed activity.");
      const size = new DataView(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      ).getUint32(data.length - 4, true);
      if (size > LIMITS.fileBytes)
        throw new Error("Compressed activity expansion limit exceeded.");
      const inflated = gunzipSync(data, { out: new Uint8Array(size) });
      total += inflated.length;
      if (total > LIMITS.expandedBytes)
        throw new Error("Archive expansion limit exceeded.");
      out.push({ name: name.slice(0, -3), bytes: inflated, metadata: row });
    } else out.push({ name, bytes: data, metadata: row });
  }
  if (!out.length)
    throw new Error("Archive contains no supported activity files.");
  return out;
}
export type MigrationMetadata = {
  title?: string;
  notes?: string;
  gear?: string;
  sourceRecordId?: string;
  commute?: boolean;
};
export { duplicateConfidence } from "./dedup";
