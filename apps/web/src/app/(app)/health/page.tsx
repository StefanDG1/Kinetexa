"use client";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Chart } from "@/components/data-ui";
export default function Health() {
  const data = useQuery(api.workspace.overview);
  return (
    <>
      <h1>Recovery in context.</h1>
      <p>
        Health signals help explain training. Kinetexa does not diagnose medical
        conditions.
      </p>
      {["restingHr", "hrv", "sleep", "weight", "vo2max", "steps"].map(
        (kind) => {
          const rows =
            data?.health
              .filter((h) => h.kind === kind)
              .map((h) => ({ label: h.date, value: h.value })) ?? [];
          return (
            <section className="section" key={kind}>
              <h2>
                {
                  {
                    restingHr: "Resting heart rate",
                    hrv: "Heart-rate variability",
                    sleep: "Sleep duration",
                    weight: "Weight",
                    vo2max: "VO₂max estimate",
                    steps: "Steps",
                  }[kind]
                }
              </h2>
              {rows.length ? (
                <Chart data={rows} />
              ) : (
                <p className="muted">
                  No source supplying this measurement is connected. Garmin
                  health access is pending separately from activity access.
                </p>
              )}
            </section>
          );
        },
      )}
    </>
  );
}
