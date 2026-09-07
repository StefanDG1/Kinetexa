"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useServerRead } from "@/components/server-read";
import { number, Chart } from "@/components/data-ui";
export default function Records() {
  const [scope, setScope] = useState<"all-time" | "current-year" | "period">(
      "all-time",
    ),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const result = useServerRead(
    api.analytics.records,
    scope === "period" && (!from || !to || from > to)
      ? "skip"
      : { scope, ...(scope === "period" ? { from, to } : {}) },
  );
  return (
    <>
      <h1>Your personal bests</h1>
      <p>
        Records use your profile timezone and exclude future or excluded
        efforts. Open a source activity to inspect or exclude it.
      </p>
      <div className="toolbar">
        <label>
          Period{" "}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="all-time">All time</option>
            <option value="current-year">Current year</option>
            <option value="period">Custom period</option>
          </select>
        </label>
        {scope === "period" && (
          <>
            <label>
              From{" "}
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Through{" "}
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <button onClick={result.refresh} disabled={result.loading}>
          Refresh records
        </button>
      </div>
      {result.loading && <p role="status">Calculating records…</p>}
      {result.error && <p role="alert">{result.error}</p>}
      {scope === "period" && (!from || !to || from > to) && (
        <p>Choose an ordered date range.</p>
      )}
      {result.data &&
        (["distance", "power", "pace"] as const).map((kind) => (
          <section className="section" key={kind}>
            <h2>
              {
                {
                  distance: "Running distance records",
                  power: "Cycling power-duration curve",
                  pace: "Running speed-duration curve",
                }[kind]
              }
            </h2>
            <Chart
              data={result.data![kind].map((r) => ({
                label: r.label,
                value: r.value,
              }))}
            />
            <table>
              <thead>
                <tr>
                  <th>Effort</th>
                  <th>Result</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {result.data![kind].map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>
                      {number(r.value, 2)} {r.unit}
                    </td>
                    <td>
                      {r.activityIds.map((id) => (
                        <Link key={id} href={`/activities/${id}`}>
                          Open activity
                        </Link>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details>
              <summary>Calculation details</summary>
              {result.data![kind][0]?.caveats.map((c) => (
                <p key={c}>{c}</p>
              ))}
            </details>
          </section>
        ))}
    </>
  );
}
