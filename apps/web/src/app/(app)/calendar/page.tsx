"use client";
import { HistoryMore } from "@/components/history-more";
import Link from "next/link";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { DeleteItem } from "@/components/delete-item";
import {
  calendarDate,
  dateBounds,
  localInput,
  localTimestamp,
  moveToDate,
} from "@core/calendar";
import { parseDate } from "@internationalized/date";
import { date, duration, number } from "@/components/data-ui";
export default function CalendarPage() {
  const save = useMutation(api.workspace.savePlan),
    profile = useQuery(api.athletes.current),
    [view, setView] = useState("month"),
    [chosenAnchor, setAnchor] = useState<string | null>(null),
    [error, setError] = useState("");
  const timezone = profile?.timezone ?? "UTC";
  const [editing, setEditing] = useState<Doc<"plans"> | null>(null);
  const anchor = chosenAnchor ?? calendarDate(Date.now(), timezone);
  let start = parseDate(anchor);
  if (view === "month") start = start.set({ day: 1 });
  if (view === "week")
    start = start.subtract({ days: (new Date(anchor).getUTCDay() + 6) % 7 });
  const count =
    view === "day"
      ? 1
      : view === "week"
        ? 7
        : start.calendar.getDaysInMonth(start);
  const days = Array.from({ length: count }, (_, i) =>
    start.add({ days: i }).toString(),
  );
  const bounds = dateBounds(days[0], days.at(-1)!, timezone),
    history = usePaginatedQuery(
      api.activities.browse,
      { ...bounds, view: "picker" },
      { initialNumItems: 50 },
    ),
    plans = usePaginatedQuery(
      api.workspace.page,
      { ...bounds, table: "plans" },
      { initialNumItems: 50 },
    ),
    activities = history.results,
    data = { plans: plans.results as Doc<"plans">[] };
  async function move(plan: Doc<"plans">, day: string) {
    const { _id, _creationTime: _c, athleteId: _a, ...fields } = plan;
    try {
      await save({
        id: _id,
        ...fields,
        start: moveToDate(plan.start, day, timezone),
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the workout.");
    }
  }
  return (
    <>
      <h1>Your training calendar</h1>
      <p>
        Dates and times use {timezone}. Moving a workout preserves its local
        time. A repeated clock hour uses its first occurrence.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="toolbar">
        <label>
          Date
          <input
            type="date"
            value={anchor}
            onChange={(e) => {
              if (e.target.value) setAnchor(e.target.value);
            }}
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
          const bounds = dateBounds(d, d, timezone),
            from = bounds.from,
            to = bounds.to + 1;
          return (
            <div
              className="calendar-day"
              key={from}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain"),
                  plan = data?.plans.find((p) => p._id === id);
                if (plan) await move(plan, d);
              }}
            >
              <strong>{d}</strong>
              {activities
                ?.filter((a) => a.start >= from && a.start < to)
                .map((a) => (
                  <Link href={`/activities/${a._id}`} key={a._id}>
                    {a.sport} · {duration(a.duration)} · Load {number(a.load)} ·
                    Completed
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
                        defaultValue={calendarDate(p.start, timezone)}
                        onChange={(e) => {
                          if (e.target.value) void move(p, e.target.value);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => setEditing(p)}
                    >
                      Edit workout
                    </button>
                    <DeleteItem
                      id={p._id}
                      label="workout"
                      onDeleted={() => {
                        if (editing?._id === p._id) setEditing(null);
                      }}
                    />
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      <HistoryMore
        {...history}
        label="More completed workouts in this period"
      />
      <HistoryMore {...plans} label="More planned workouts in this period" />
      <section className="surface section">
        <h2>{editing ? "Edit planned workout" : "Plan a workout"}</h2>
        <form
          key={editing?._id ?? "new"}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await save({
                id: editing?._id,
                title: String(f.get("title")),
                sport: String(f.get("sport")),
                start: localTimestamp(String(f.get("start")), timezone),
                duration: Number(f.get("duration")) * 60,
                description: String(f.get("description")),
                intensity: String(f.get("intensity")),
              });
              setError("");
              setEditing(null);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Check the workout details.",
              );
            }
          }}
        >
          <label>
            Title
            <input name="title" required defaultValue={editing?.title ?? ""} />
          </label>
          <div className="form-columns">
            <label>
              Sport
              <select name="sport" defaultValue={editing?.sport ?? "running"}>
                <option>running</option>
                <option>cycling</option>
                <option>swimming</option>
                <option>walking</option>
                <option>other</option>
              </select>
            </label>
            <label>
              Date and time
              <input
                name="start"
                type="datetime-local"
                required
                defaultValue={
                  editing ? localInput(editing.start, timezone) : undefined
                }
              />
            </label>
            <label>
              Duration · minutes
              <input
                name="duration"
                type="number"
                min="1"
                required
                defaultValue={editing ? editing.duration / 60 : undefined}
              />
            </label>
            <label>
              Target intensity
              <input
                name="intensity"
                defaultValue={editing?.intensity ?? ""}
                placeholder="Easy, conversational effort"
              />
            </label>
          </div>
          <label>
            Description
            <textarea
              name="description"
              defaultValue={editing?.description ?? ""}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button>{editing ? "Save workout" : "Plan workout"}</button>
          {editing && (
            <button
              type="button"
              className="quiet"
              onClick={() => setEditing(null)}
            >
              Cancel editing
            </button>
          )}
        </form>
      </section>
    </>
  );
}
