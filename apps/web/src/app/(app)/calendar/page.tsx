"use client";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { date, duration } from "@/components/data-ui";
export default function CalendarPage() {
  const data = useQuery(api.workspace.overview),
    activities = useQuery(api.activities.list, {}),
    save = useMutation(api.workspace.savePlan),
    [view, setView] = useState("month"),
    [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10)),
    [error, setError] = useState("");
  const start = new Date(`${anchor}T00:00:00`);
  if (view === "month") start.setDate(1);
  if (view === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const count =
    view === "day"
      ? 1
      : view === "week"
        ? 7
        : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  return (
    <>
      <h1>Your training calendar</h1>
      <div className="toolbar">
        <label>
          Date
          <input
            type="date"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
          />
        </label>
        <label>
          View
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
      </div>
      <div className={view === "day" ? "" : "calendar-grid"}>
        {days.map((d) => {
          const from = d.getTime(),
            to = from + 86400000;
          return (
            <div
              className="calendar-day"
              key={from}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain"),
                  plan = data?.plans.find((p) => p._id === id);
                if (plan) {
                  const {
                    _id,
                    _creationTime: _c,
                    athleteId: _a,
                    ...fields
                  } = plan;
                  await save({ id: _id, ...fields, start: from });
                }
              }}
            >
              <strong>{date(from)}</strong>
              {activities
                ?.filter((a) => a.start >= from && a.start < to)
                .map((a) => (
                  <Link href={`/activities/${a._id}`} key={a._id}>
                    {a.sport} · {duration(a.duration)} · Completed
                  </Link>
                ))}
              {data?.plans
                .filter((p) => p.start >= from && p.start < to)
                .map((p) => (
                  <div
                    draggable
                    key={p._id}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", p._id)
                    }
                  >
                    <p>
                      {p.title} · {duration(p.duration)} · Planned
                    </p>
                    <label>
                      Move to
                      <input
                        type="date"
                        defaultValue={new Date(p.start)
                          .toISOString()
                          .slice(0, 10)}
                        onChange={async (e) => {
                          const {
                            _id,
                            _creationTime: _c,
                            athleteId: _a,
                            ...fields
                          } = p;
                          await save({
                            id: _id,
                            ...fields,
                            start: Date.parse(e.target.value),
                          });
                        }}
                      />
                    </label>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      <section className="surface section">
        <h2>Plan a workout</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await save({
                title: String(f.get("title")),
                sport: String(f.get("sport")),
                start: Date.parse(String(f.get("start"))),
                duration: Number(f.get("duration")) * 60,
                description: String(f.get("description")),
                intensity: String(f.get("intensity")),
              });
              setError("");
            } catch {
              setError("Check the workout details.");
            }
          }}
        >
          <label>
            Title
            <input name="title" required />
          </label>
          <div className="form-columns">
            <label>
              Sport
              <select name="sport">
                <option>running</option>
                <option>cycling</option>
                <option>swimming</option>
                <option>walking</option>
                <option>other</option>
              </select>
            </label>
            <label>
              Date and time
              <input name="start" type="datetime-local" required />
            </label>
            <label>
              Duration · minutes
              <input name="duration" type="number" min="1" required />
            </label>
            <label>
              Target intensity
              <input
                name="intensity"
                placeholder="Easy, conversational effort"
              />
            </label>
          </div>
          <label>
            Description
            <textarea name="description" />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button>Plan workout</button>
        </form>
      </section>
    </>
  );
}
