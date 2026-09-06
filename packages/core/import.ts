import FitParser from "fit-file-parser";
import { scanActivityXml } from "./xml-records";
import { unzipSync } from "fflate";
import { gunzipSync } from "node:zlib";
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
import { explicitOffset } from "./time-context";

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
    if (p && !s.breakBefore) {
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
        if (s.verticalSpeed === undefined) s.verticalSpeed = delta / dt;
        if (Math.abs(delta) < 30) {
          gain += Math.max(0, delta);
          loss += Math.max(0, -delta);
        }
      }
    }
    if (s.distance !== undefined) distance = Math.max(distance, s.distance);
    if (s.distance === undefined && s.lat !== undefined) s.distance = distance;
    if (s.hr !== undefined && (s.hr < 20 || s.hr > 260)) delete s.hr;
    if (s.power !== undefined && (s.power < 0 || s.power > 3500))
      delete s.power;
    if (s.speed !== undefined && (s.speed < 0 || s.speed > 60)) delete s.speed;
    if (s.speed && ["running", "walking"].includes(input.sport))
      s.paceSecondsPerKm = 1000 / s.speed;
    if (input.sport === "running" && s.power !== undefined)
      s.runningPower = s.power;
  }
  const duration = input.duration || samples.at(-1)?.t || 0;
  const totalDistance =
    input.distance ??
    (samples.some((s) => s.distance !== undefined) ? distance : undefined);
  if (duration > 172800)
    throw new Error(
      "An individual activity must be at most 48 hours. Split longer recordings before importing.",
    );
  return activitySchema.parse({
    ...input,
    samples,
    duration,
    distance: totalDistance,
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
    avgPaceSecondsPerKm:
      ["running", "walking"].includes(input.sport) && totalDistance && duration
        ? (duration / totalDistance) * 1000
        : undefined,
  });
}
// Untrusted parser objects stop at this boundary and are validated into Activity.
type Xml = Record<string, any>;
const numericFields = (row: Xml, names: string[]) =>
  Object.fromEntries(
    names
      .filter((name) => num(row[name]) !== undefined)
      .map((name) => [name, num(row[name])!]),
  );
function fitMetadata(fit: Xml) {
  return clean({
    devices: list(fit.device_infos),
    files: list(fit.file_ids),
    developerFields: list(fit.field_descriptions),
    developerApplications: list(fit.developer_data_ids),
  });
}
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
  add(
    list(messages.max_met_data).map((r) => ({
      ...r,
      timestamp: r.update_time,
    })),
    "vo2max",
    "vo2_max",
    "ml/kg/min",
    5,
    100,
  );
  // Monitoring cycles are stored in half-step units by the FIT profile. Only walking/running records count as steps.
  for (const row of list(messages.monitoring)) {
    const at = timestamp(row.timestamp),
      cycles = num(row.cycles);
    if (
      ["walking", "running"].includes(row.activity_type) &&
      Number.isFinite(at) &&
      cycles !== undefined &&
      cycles >= 0 &&
      cycles <= 100000
    )
      out.push({
        at,
        kind: "steps",
        value: Math.round(cycles * 2),
        unit: "steps",
      });
  }
  // Derive only a closed, observed sleep-state interval. An open final segment or unknown state is not extrapolated.
  const stages = list(messages.sleep_level)
    .filter((r) => Number.isFinite(timestamp(r.timestamp)))
    .sort((a, b) => timestamp(a.timestamp) - timestamp(b.timestamp));
  let duration = 0,
    valid = true;
  for (let i = 0; i < stages.length - 1; i++) {
    const row = stages[i],
      next = stages[i + 1],
      seconds = (timestamp(next.timestamp) - timestamp(row.timestamp)) / 1000;
    if (seconds <= 0 || seconds > 12 * 3600) {
      duration = 0;
      valid = false;
      continue;
    }
    if (["light", "deep", "rem"].includes(row.sleep_level)) duration += seconds;
    else if (row.sleep_level === "awake") {
      duration = 0;
      valid = true;
    } else valid = false;
    if (next.sleep_level === "awake") {
      if (valid && duration > 0 && duration <= 16 * 3600)
        out.push({
          at: timestamp(next.timestamp),
          kind: "sleep",
          value: duration,
          unit: "seconds",
        });
      duration = 0;
      valid = true;
    }
  }
  return out;
}
export async function parseActivity(
  name: string,
  bytes: Uint8Array,
  partIndex?: number,
): Promise<Activity> {
  if (bytes.length > LIMITS.fileBytes)
    throw new Error("Activity exceeds the 32 MiB file limit.");
  const ext = name.split(".").at(-1)?.toLowerCase();
  if (ext === "fit") {
    const fit = await decodeFit(bytes);
    const sessions = list<Xml>(fit.sessions);
    if (sessions.length > 1 && partIndex === undefined)
      throw new Error(
        "File contains multiple sessions. Import every session independently.",
      );
    if (
      partIndex !== undefined &&
      (!Number.isSafeInteger(partIndex) ||
        partIndex < 0 ||
        partIndex >= Math.max(1, sessions.length))
    )
      throw new Error("Invalid source session index.");
    const session = sessions[partIndex ?? 0] ?? {};
    let records: Xml[] = list(fit.records);
    const start = timestamp(session.start_time ?? records[0]?.timestamp);
    const end =
      num(session.total_elapsed_time) === undefined
        ? timestamp(session.timestamp)
        : start + num(session.total_elapsed_time)! * 1000;
    const nextStart = Math.min(
      ...sessions.map((s) => timestamp(s.start_time)).filter((t) => t > start),
    );
    if (sessions.length > 1)
      records = records.filter((r) => {
        const at = timestamp(r.timestamp);
        return (
          at >= start && at < nextStart && (!Number.isFinite(end) || at <= end)
        );
      });
    const distanceBase =
      sessions.length > 1 ? (num(records[0]?.distance) ?? 0) : 0;
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
      device:
        list<Xml>(fit.device_infos)
          .map((d) =>
            [d.manufacturer, d.product_name ?? d.garmin_product ?? d.product]
              .filter((x) => x !== undefined)
              .join(" "),
          )
          .filter(Boolean)
          .join("; ") || undefined,
      sourceMetadata: {
        ...fitMetadata(fit),
        sessionIndex: partIndex ?? 0,
        sessionCount: Math.max(1, sessions.length),
        session: clean(session),
      },
      samples: records.map((r) => ({
        t: (timestamp(r.timestamp) - start) / 1000,
        lat: num(r.position_lat),
        lon: num(r.position_long),
        altitude: num(r.enhanced_altitude ?? r.altitude),
        distance:
          num(r.distance) === undefined
            ? undefined
            : Math.max(0, num(r.distance)! - distanceBase),
        speed: num(r.enhanced_speed ?? r.speed),
        hr: num(r.heart_rate),
        power: num(r.power),
        cadence: num(r.cadence),
        temperature: num(r.temperature),
        grade: num(r.grade),
        verticalSpeed: num(r.vertical_speed),
        runningDynamics: numericFields(r, [
          "vertical_oscillation",
          "stance_time",
          "stance_time_percent",
          "stance_time_balance",
          "vertical_ratio",
          "step_length",
        ]),
        cyclingDynamics: Object.fromEntries(
          Object.entries(r).filter(([key]) =>
            /^(left_|right_|total_hemoglobin|saturated_hemoglobin)/.test(key),
          ),
        ),
        sourceFields: clean(r),
      })),
      laps: list<Xml>(fit.laps)
        .filter(
          (l) =>
            sessions.length <= 1 ||
            (timestamp(l.start_time) >= start &&
              timestamp(l.start_time) < nextStart &&
              (!Number.isFinite(end) || timestamp(l.start_time) < end)),
        )
        .map((l) => ({
          start: (timestamp(l.start_time) - start) / 1000,
          duration: num(l.total_elapsed_time) ?? 0,
          distance: num(l.total_distance),
        })),
    });
  }
  if (ext !== "gpx" && ext !== "tcx")
    throw new Error("Choose a FIT, TCX or GPX activity.");
  const samples: Sample[] = [];
  let firstTime: unknown;
  const { count, part } = scanActivityXml(
    bytes,
    ext,
    partIndex ?? 0,
    (p, breakBefore) => {
      if (samples.length >= 500000)
        throw new Error("Activity sample limit exceeded.");
      const time = ext === "gpx" ? p.time : p.Time;
      if (firstTime === undefined) firstTime = time;
      const e = p.extensions?.TrackPointExtension ?? p.extensions ?? {};
      const sample: Sample =
        ext === "gpx"
          ? {
              t: timestamp(time),
              breakBefore: breakBefore || undefined,
              lat: num(p["@_lat"]),
              lon: num(p["@_lon"]),
              altitude: num(p.ele),
              hr: num(e.hr),
              cadence: num(e.cad),
              power: num(e.power ?? p.extensions?.power),
              temperature: num(e.atemp),
              sourceFields: p.extensions ? clean(p.extensions) : undefined,
            }
          : {
              t: timestamp(time),
              breakBefore: breakBefore || undefined,
              lat: num(p.Position?.LatitudeDegrees),
              lon: num(p.Position?.LongitudeDegrees),
              altitude: num(p.AltitudeMeters),
              distance: num(p.DistanceMeters),
              hr: num(p.HeartRateBpm?.Value),
              cadence: num(p.Cadence),
              speed: num(p.Extensions?.TPX?.Speed),
              power: num(p.Extensions?.TPX?.Watts),
              sourceFields: p.Extensions ? clean(p.Extensions) : undefined,
            };
      samples.push(
        Object.fromEntries(
          Object.entries(sample).filter(([, value]) => value !== undefined),
        ) as Sample,
      );
    },
  );
  if (count > 1 && partIndex === undefined)
    throw new Error(
      ext === "gpx"
        ? "File contains multiple tracks. Import every track independently."
        : "File contains multiple activities. Import every activity independently.",
    );
  if (!part)
    throw new Error(
      ext === "gpx" ? "No valid GPX track." : "TCX contains no activity.",
    );
  const ls = ext === "tcx" ? list<Xml>(part.Lap) : [];
  const startTime =
    ext === "gpx"
      ? firstTime
      : (part.Id ?? ls[0]?.["@_StartTime"] ?? firstTime);
  const start = timestamp(startTime),
    utcOffsetMinutes = explicitOffset(startTime);
  for (const sample of samples) sample.t = (sample.t - start) / 1000;
  return normalize({
    title: ext === "gpx" ? (part.name ?? name) : name,
    sport: sport(ext === "gpx" ? part.type : part["@_Sport"]),
    start,
    utcOffsetMinutes,
    timezoneSource: utcOffsetMinutes === undefined ? undefined : "file-offset",
    sourceMetadata:
      ext === "tcx" ? clean({ creator: part.Creator ?? null }) : undefined,
    duration: ls.reduce((n, l) => n + (num(l.TotalTimeSeconds) ?? 0), 0),
    distance: ls.some((l) => l.DistanceMeters !== undefined)
      ? ls.reduce((n, l) => n + (num(l.DistanceMeters) ?? 0), 0)
      : undefined,
    samples,
    laps: ls.map((l) => ({
      start: (timestamp(l["@_StartTime"]) - start) / 1000,
      duration: num(l.TotalTimeSeconds) ?? 0,
      distance: num(l.DistanceMeters),
    })),
  });
}
export async function activityPartCount(name: string, bytes: Uint8Array) {
  if (bytes.length > LIMITS.fileBytes)
    throw new Error("Activity exceeds the 32 MiB file limit.");
  if (/\.fit$/i.test(name))
    return Math.max(1, list((await decodeFit(bytes)).sessions).length);
  if (!/\.(gpx|tcx)$/i.test(name))
    throw new Error("Choose a FIT, TCX or GPX activity.");
  return Math.max(
    1,
    scanActivityXml(bytes, /\.gpx$/i.test(name) ? "gpx" : "tcx", -1).count,
  );
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
      const inflated = new Uint8Array(
        gunzipSync(data, { maxOutputLength: LIMITS.fileBytes }),
      );
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
