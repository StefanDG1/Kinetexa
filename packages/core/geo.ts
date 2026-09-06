import type { Sample } from "./model";
export type Zone = { lat: number; lon: number; radius: number };
export type Point = [number, number];
export function meters(a: Point, b: Point) {
  const r = Math.PI / 180;
  const d =
    Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
    Math.cos(a[1] * r) *
      Math.cos(b[1] * r) *
      Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, d)));
}
export function route(samples: Sample[], limit = 1200): Point[] {
  return routeSegments(samples, limit).flat();
}
export function simplifySegments(segments: Point[][], limit = 1200): Point[][] {
  const nonempty = segments.filter((s) => s.length > 1);
  const maxSegments = Math.max(1, Math.floor(limit / 2));
  const selected =
    nonempty.length <= maxSegments
      ? nonempty
      : Array.from(
          { length: maxSegments },
          (_, i) =>
            nonempty[
              Math.floor(
                (i * (nonempty.length - 1)) / Math.max(1, maxSegments - 1),
              )
            ],
        );
  const total = selected.reduce((n, s) => n + s.length, 0),
    spare = Math.max(0, limit - selected.length * 2);
  return selected.map((points) => {
    const count = Math.min(
      points.length,
      2 + Math.floor((spare * points.length) / Math.max(1, total)),
    );
    return count >= points.length
      ? points
      : Array.from(
          { length: count },
          (_, i) => points[Math.round((i * (points.length - 1)) / (count - 1))],
        );
  });
}
export function routeSegments(samples: Sample[], limit = 1200): Point[][] {
  const segments: Point[][] = [];
  let current: Point[] = [];
  let previous: Sample | undefined;
  for (const sample of samples) {
    const located = sample.lat !== undefined && sample.lon !== undefined;
    const point: Point | undefined = located
      ? [sample.lon!, sample.lat!]
      : undefined;
    const dt = previous ? sample.t - previous.t : 0;
    const disconnected =
      sample.breakBefore ||
      !point ||
      !previous ||
      previous.lat === undefined ||
      previous.lon === undefined ||
      dt <= 0 ||
      dt > 30 ||
      meters([previous.lon, previous.lat], point) / dt > 60;
    if (disconnected) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    if (point) current.push(point);
    previous = sample;
  }
  if (current.length > 1) segments.push(current);
  return simplifySegments(segments, limit);
}
// Split at every hidden point. Never connect visible points across a private zone.
// A safety buffer reduces precision at the zone boundary; public endpoints are trimmed too.
export function maskedRoute(
  points: Point[],
  zones: Zone[],
  trim = 200,
): Point[][] {
  if (points.length < 2) return [];
  const hidden = (p: Point) =>
    zones.some((z) => meters(p, [z.lon, z.lat]) <= z.radius + 100) ||
    meters(p, points[0]) < trim ||
    meters(p, points[points.length - 1]) < trim;
  const segments: Point[][] = [];
  let current: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let blocked = hidden(p);
    // Check the entire connecting edge so sparse recordings cannot bridge a zone.
    if (!blocked && i > 0) {
      const prev = points[i - 1],
        steps = Math.ceil(meters(prev, p) / 25);
      if (steps > 2000) blocked = true;
      else
        for (let j = 1; j < steps; j++)
          if (
            hidden([
              prev[0] + ((p[0] - prev[0]) * j) / steps,
              prev[1] + ((p[1] - prev[1]) * j) / steps,
            ])
          ) {
            blocked = true;
            break;
          }
    }
    if (blocked) {
      if (current.length > 1) segments.push(current);
      current = [];
    } else current.push(p);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}
