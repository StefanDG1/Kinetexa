import { z } from "zod";

export const VERSION = "0.2.0-alpha.1";
export const sportSchema = z.enum([
  "running",
  "cycling",
  "swimming",
  "walking",
  "other",
]);
export type Sport = z.infer<typeof sportSchema>;
export const sampleSchema = z.object({
  t: z.number().nonnegative(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  altitude: z.number().optional(),
  distance: z.number().nonnegative().optional(),
  hr: z.number().min(20).max(260).optional(),
  power: z.number().min(0).max(3500).optional(),
  cadence: z.number().min(0).max(300).optional(),
  speed: z.number().min(0).max(60).optional(),
  temperature: z.number().optional(),
  grade: z.number().optional(),
});
export type Sample = z.infer<typeof sampleSchema>;
export const activitySchema = z.object({
  title: z.string().max(240),
  sport: sportSchema,
  subSport: z.string().optional(),
  start: z.number().finite(),
  timezone: z.string().optional(),
  duration: z.number().nonnegative(),
  movingDuration: z.number().nonnegative().optional(),
  distance: z.number().nonnegative().optional(),
  elevationGain: z.number().nonnegative().optional(),
  elevationLoss: z.number().nonnegative().optional(),
  avgHr: z.number().optional(),
  maxHr: z.number().optional(),
  avgPower: z.number().optional(),
  avgCadence: z.number().optional(),
  avgSpeed: z.number().optional(),
  calories: z.number().optional(),
  device: z.string().optional(),
  samples: z.array(sampleSchema).max(500000),
  laps: z.array(
    z.object({
      start: z.number(),
      duration: z.number(),
      distance: z.number().optional(),
    }),
  ),
});
export type Activity = z.infer<typeof activitySchema>;
export const thresholdsSchema = z
  .object({
    restHr: z.number().min(25).max(120).optional(),
    maxHr: z.number().min(100).max(250).optional(),
    ftp: z.number().min(30).max(700).optional(),
    thresholdSpeed: z.number().min(1).max(10).optional(),
    hrZones: z.array(z.number().min(20).max(260)).max(10).optional(),
    powerZones: z.array(z.number().nonnegative()).max(10).optional(),
    paceZones: z.array(z.number().nonnegative()).max(10).optional(),
  })
  .refine(
    (t) =>
      ["hrZones", "powerZones", "paceZones"].every((k) => {
        const a = t[k as "hrZones"];
        return !a || a.every((v, i) => i === 0 || v > a[i - 1]);
      }),
    "Zone boundaries must be increasing.",
  );
export type Thresholds = z.infer<typeof thresholdsSchema>;
export type Metric = {
  value: number | null;
  unit: string;
  definition: string;
  formula: string;
  caveat: string;
  version: string;
  inputs: Record<string, number | null>;
};
export function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
