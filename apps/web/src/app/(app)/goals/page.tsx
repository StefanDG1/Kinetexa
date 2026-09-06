"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { number, date } from "@/components/data-ui";
export default function GoalsPage() {
  const data = useQuery(api.workspace.overview),
    activities = useQuery(api.activities.list, {}),
    save = useMutation(api.workspace.saveGoal),
    [error, setError] = useState("");
  return (
    <>
      <h1>Something to work toward.</h1>
      <div className="collection section">
        {data?.goals.map((g) => {
          const rows =
            activities?.filter((a) => a.start >= g.start && a.start <= g.end) ??
            [];
          const current =
            g.kind === "custom" || g.kind === "raceTime" || g.kind === "event"
              ? (g.manualProgress ?? 0)
              : rows.reduce(
                  (n, a) =>
                    n +
                    (g.kind === "distance"
                      ? (a.distance ?? 0) / 1000
                      : g.kind === "duration"
                        ? a.duration / 3600
                        : g.kind === "elevation"
                          ? (a.summary.elevationGain ?? 0)
                          : 1),
                  0,
                );
          return (
            <article className="surface" key={g._id}>
              <h2>{g.title}</h2>
              <p>
                {number(current)} of {number(g.target)}{" "}
                {g.kind === "distance"
                  ? "km"
                  : g.kind === "duration"
                    ? "hours"
                    : g.kind === "elevation"
                      ? "m"
                      : g.kind === "raceTime"
                        ? "seconds"
                        : ""}
              </p>
              <progress value={current} max={g.target} />
              <p>
                {number((100 * current) / g.target, 0)}% ·{" "}
                {Math.max(0, Math.ceil((g.end - Date.now()) / 86400000))} days
                remaining
              </p>
              <p className="muted">
                {date(g.start)} to {date(g.end)}
              </p>
              {Date.now() > g.start && Date.now() < g.end && (
                <p>
                  Projected:{" "}
                  {number(
                    (current * (g.end - g.start)) / (Date.now() - g.start),
                  )}
                </p>
              )}
            </article>
          );
        })}
      </div>
      <section className="surface section">
        <h2>Set a goal</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await save({
                title: String(f.get("title")),
                kind: String(f.get("kind")),
                target: Number(f.get("target")),
                start: Date.parse(String(f.get("start"))),
                end: Date.parse(String(f.get("end"))) + 86399999,
                manualProgress: Number(f.get("progress") || 0),
              });
              setError("");
            } catch {
              setError("Check your target and dates.");
            }
          }}
        >
          <label>
            Goal name
            <input name="title" required placeholder="A consistent month" />
          </label>
          <div className="form-columns">
            <label>
              Measure
              <select name="kind">
                <option value="distance">Distance · km</option>
                <option value="duration">Training time · hours</option>
                <option value="elevation">Elevation · m</option>
                <option value="count">Activity count</option>
                <option value="event">Race / event date</option>
                <option value="raceTime">Target race time · seconds</option>
                <option value="custom">Custom numeric goal</option>
              </select>
            </label>
            <label>
              Target
              <input
                name="target"
                type="number"
                min="0.01"
                step="any"
                required
              />
            </label>
            <label>
              Start date
              <input
                name="start"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </label>
            <label>
              End / event date
              <input name="end" type="date" required />
            </label>
            <label>
              Current progress for custom/event goals
              <input name="progress" type="number" min="0" defaultValue="0" />
            </label>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button>Save goal</button>
        </form>
      </section>
    </>
  );
}
