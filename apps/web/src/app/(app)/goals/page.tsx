"use client";
import { useActivityHistory } from "@/components/activity-history";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { number, date } from "@/components/data-ui";
import { goalProgress } from "@core/goals";
export default function GoalsPage() {
  const data = useQuery(api.workspace.overview),
    activities = useActivityHistory({}),
    save = useMutation(api.workspace.saveGoal);
  const [error, setError] = useState(""),
    [editing, setEditing] = useState<Doc<"goals"> | null>(null),
    [kind, setKind] = useState("distance");
  const units = (kind: string) =>
    ({
      distance: "km",
      duration: "hours",
      elevation: "m",
      raceTime: "seconds",
      count: "activities",
    })[kind] ?? "";
  return (
    <>
      <h1>Something to work toward.</h1>
      <div className="collection section">
        {data?.goals.map((g) => {
          const p = goalProgress(g, activities ?? []);
          return (
            <article className="surface" key={g._id}>
              <h2>{g.title}</h2>
              {g.kind === "event" ? (
                <p>
                  {date(g.end)} ·{" "}
                  {(p.current ?? 0) >= 1 ? "Completed" : "Upcoming event"}
                </p>
              ) : (
                <p>
                  {number(p.current)} {units(g.kind)} · Target{" "}
                  {number(g.target)} {units(g.kind)}
                  {g.kind === "raceTime" ? " or faster" : ""}
                </p>
              )}
              <progress
                aria-label={`${g.title} progress`}
                value={Math.min(100, p.percent ?? 0)}
                max={100}
              />
              <p>
                {number(p.percent, 0)}% · {p.daysLeft} days remaining
              </p>
              <p className="muted">
                {date(g.start)} to {date(g.end)}
              </p>
              {p.projected !== null && (
                <p>
                  Projected at current rate: {number(p.projected)}{" "}
                  {units(g.kind)}
                </p>
              )}
              <button
                className="secondary"
                onClick={() => {
                  setEditing(g);
                  setKind(g.kind);
                  document
                    .getElementById("goal-editor")
                    ?.scrollIntoView({ block: "start" });
                }}
              >
                Edit goal or progress
              </button>
            </article>
          );
        })}
      </div>
      <section className="surface section" id="goal-editor">
        <h2>{editing ? "Edit goal" : "Set a goal"}</h2>
        <form
          key={editing?._id ?? "new"}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await save({
                ...(editing ? { id: editing._id } : {}),
                title: String(f.get("title")),
                kind,
                target: kind === "event" ? 1 : Number(f.get("target")),
                start: Date.parse(String(f.get("start"))),
                end: Date.parse(String(f.get("end"))) + 86399999,
                manualProgress:
                  kind === "event"
                    ? f.get("complete") === "on"
                      ? 1
                      : 0
                    : Number(f.get("progress") || 0),
              });
              setError("Goal saved.");
              setEditing(null);
              setKind("distance");
            } catch {
              setError("Check your target and dates.");
            }
          }}
        >
          <label>
            Goal name
            <input
              name="title"
              defaultValue={editing?.title}
              required
              maxLength={120}
              placeholder="A consistent month"
            />
          </label>
          <div className="form-columns">
            <label>
              Measure
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="distance">Distance · km</option>
                <option value="duration">Training time · hours</option>
                <option value="elevation">Elevation · m</option>
                <option value="count">Activity count</option>
                <option value="event">Race / event date</option>
                <option value="raceTime">Target race time · seconds</option>
                <option value="custom">Custom numeric goal</option>
              </select>
            </label>
            {kind !== "event" && (
              <label>
                Target · {units(kind)}
                <input
                  name="target"
                  type="number"
                  defaultValue={editing?.target}
                  min="0.01"
                  step="any"
                  required
                />
              </label>
            )}
            <label>
              Start date
              <input
                name="start"
                type="date"
                defaultValue={new Date(editing?.start ?? Date.now())
                  .toISOString()
                  .slice(0, 10)}
                required
              />
            </label>
            <label>
              End / event date
              <input
                name="end"
                type="date"
                defaultValue={
                  editing
                    ? new Date(editing.end).toISOString().slice(0, 10)
                    : undefined
                }
                required
              />
            </label>
            {["custom", "raceTime"].includes(kind) && (
              <label>
                {kind === "raceTime"
                  ? "Current race time · seconds"
                  : "Current progress"}
                <input
                  name="progress"
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={editing?.manualProgress ?? 0}
                />
              </label>
            )}
            {kind === "event" && (
              <label className="check">
                <input
                  name="complete"
                  type="checkbox"
                  defaultChecked={(editing?.manualProgress ?? 0) >= 1}
                />
                I completed this event
              </label>
            )}
          </div>
          {error && <p role="status">{error}</p>}
          <button>Save goal</button>
          {editing && (
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setEditing(null);
                setKind("distance");
              }}
            >
              Cancel editing
            </button>
          )}
        </form>
      </section>
    </>
  );
}
