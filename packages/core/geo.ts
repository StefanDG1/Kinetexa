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
  const points = samples
    .filter((s) => s.lat !== undefined && s.lon !== undefined)
    .map((s) => [s.lon!, s.lat!] as Point);
  const step = Math.max(1, Math.ceil(points.length / limit));
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
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
