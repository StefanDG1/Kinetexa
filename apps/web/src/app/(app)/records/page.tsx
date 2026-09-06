"use client";
import { useActivityHistory } from "@/components/activity-history";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import {
  number,
  duration,
  Chart,
  rangeStart,
  ranges,
} from "@/components/data-ui";
export default function Records() {
  const items = useActivityHistory({}),
    [range, setRange] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const rows =
    items?.filter(
      (a) =>
        !a.excludedRecords &&
        a.start >=
          (range === "custom" ? Date.parse(from) || 0 : rangeStart(range)) &&
        a.start <=
          (range === "custom"
            ? Date.parse(to) + 86399999 || Date.now()
            : Date.now()),
    ) ?? [];
  const power = [5, 15, 30, 60, 300, 1200, 3600].map((d) => {
    const best = rows
      .map((a) => ({
        a,
        value: a.metrics.powerCurve.find((r: any) => r.duration === d)?.value,
      }))
      .filter((x) => x.value !== null && x.value !== undefined)
      .sort((a, b) => b.value - a.value)[0];
    return {
      label: duration(d) || `${d}s`,
      value: best?.value ?? null,
      id: best?.a._id,
      title: best?.a.title,
    };
  });
  return (
    <>
      <h1>Your personal bests</h1>
      <p>
        Calculated from your recordings. Exclude suspicious records from the
        activity page.
      </p>
      <div className="toolbar">
        <label>
          Period
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {ranges.map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {range === "custom" && (
          <>
            <label>
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <section className="section">
        <h2>Running distances</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Distance</th>
                <th>Best time</th>
                <th>Source activity</th>
              </tr>
            </thead>
            <tbody>
              {[400, 1000, 1609.344, 5000, 10000, 21097.5, 42195].map(
                (distance) => {
                  const best = rows
                    .filter((a) => a.sport === "running")
                    .map((a) => ({
                      a,
                      e: a.metrics.bestDistances.find(
                        (e: any) => e.distance === distance,
                      ),
                    }))
                    .filter(
                      (x) =>
                        x.e?.duration !== null && x.e?.duration !== undefined,
                    )
                    .sort((a, b) => a.e.duration - b.e.duration)[0];
                  return (
                    <tr key={distance}>
                      <td>{number(distance / 1000, 3)} km</td>
                      <td>
                        {best
                          ? `${Math.floor(best.e.duration / 60)}m ${Math.round(best.e.duration % 60)}s`
                          : "Unavailable"}
                      </td>
                      <td>
                        {best && (
                          <Link href={`/activities/${best.a._id}`}>
                            {best.a.title}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <h2>Power-duration curve</h2>
        <Chart data={power} />
        <table>
          <thead>
            <tr>
              <th>Duration</th>
              <th>Power · W</th>
              <th>Source activity</th>
            </tr>
          </thead>
          <tbody>
            {power.map((p) => (
              <tr key={p.label}>
                <td>{p.label}</td>
                <td>{number(p.value)}</td>
                <td>
                  {p.id && <Link href={`/activities/${p.id}`}>{p.title}</Link>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="section">
        <h2>Running speed-duration curve</h2>
        <Chart
          data={[5, 15, 30, 60, 300, 1200, 3600].map((d) => {
            const values = rows
              .filter((a) => a.sport === "running")
              .map(
                (a) =>
                  a.metrics.paceCurve.find((r: any) => r.duration === d)?.value,
              )
              .filter((v) => v !== null && v !== undefined);
            return {
              label: d < 60 ? `${d}s` : duration(d),
              value: values.length ? Math.max(...values) * 3.6 : null,
            };
          })}
        />
        <p className="muted">
          Speed in km/h. Complete elapsed-time windows only.
        </p>
      </section>
    </>
  );
}
