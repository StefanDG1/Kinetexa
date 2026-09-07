"use client";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { number, duration, date } from "@/components/data-ui";
import { calendarDate, dateBounds } from "@core/calendar";
import { useServerRead } from "@/components/server-read";

export default function GearPage() {
  const profile = useQuery(api.athletes.current),
    status = useServerRead(api.gear.status, {}),
    history = usePaginatedQuery(api.gear.history, {}, { initialNumItems: 20 }),
    save = useMutation(api.workspace.saveGear),
    saveReminder = useMutation(api.gear.saveReminder),
    convertLegacy = useMutation(api.gear.convertLegacyReminder),
    service = useMutation(api.gear.completeService);
  const [editing, setEditing] = useState<Doc<"gear"> | null>(null),
    [reminder, setReminder] = useState<Doc<"gearReminders"> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function attempt(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      status.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Your equipment and maintenance</h1>
      <button
        className="quiet"
        onClick={status.refresh}
        disabled={status.loading}
      >
        Refresh usage
      </button>
      {status.loading && <p role="status">Calculating equipment usage…</p>}
      {(error || status.error) && <p role="alert">{error || status.error}</p>}
      <div className="collection section">
        {status.data?.gear.map((g) => (
          <article className="surface" key={g._id}>
            <h2>{g.name}</h2>
            <p>
              {g.kind}
              {g.retired ? " · Retired" : ""}
            </p>
            <p>
              {number(g.usage.distanceKm)} km ·{" "}
              {duration(g.usage.durationHours * 3600)} · {g.usage.activityCount}{" "}
              activities
            </p>
            {g.usage.distanceMeasuredCount < g.usage.activityCount && (
              <p>
                Distance is partial:{" "}
                {g.usage.activityCount - g.usage.distanceMeasuredCount}{" "}
                activities have no recorded distance.
              </p>
            )}
            <button className="quiet" onClick={() => setEditing(g)}>
              Edit equipment
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void attempt(() =>
                  save({
                    id: g._id,
                    name: g.name,
                    kind: g.kind,
                    retired: !g.retired,
                    servicedAt: g.servicedAt,
                    maintenanceKm: g.maintenanceKm,
                    maintenanceHours: g.maintenanceHours,
                  }),
                )
              }
            >
              {g.retired ? "Restore" : "Retire"}
            </button>
            {(g.maintenanceKm || g.maintenanceHours) && (
              <p>
                Earlier service interval:{" "}
                {g.maintenanceKm ? `${g.maintenanceKm} km` : ""}{" "}
                {g.maintenanceHours ? `${g.maintenanceHours} hours` : ""}.{" "}
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void attempt(() => convertLegacy({ id: g._id }))
                  }
                >
                  Convert to service-history reminder
                </button>{" "}
                The interval and last-service baseline are preserved.
              </p>
            )}
            {status.data?.reminders
              .filter((r) => r.gearId === g._id)
              .map((r) => (
                <section className="section" key={r._id}>
                  <h3>{r.title}</h3>
                  <p>
                    {r.retired
                      ? "Equipment retired"
                      : r.disabled
                        ? "Reminder disabled"
                        : r.due
                          ? "Maintenance due"
                          : "Not due"}
                    . Last service {date(r.servicedAt)}.
                  </p>
                  <p>
                    {number(r.usage.distanceKm)} km ·{" "}
                    {number(r.usage.durationHours)} hours since service
                    {r.distanceKm ? `; interval ${r.distanceKm} km` : ""}
                    {r.durationHours
                      ? `; interval ${r.durationHours} hours`
                      : ""}
                    {r.dueAt ? `; due ${date(r.dueAt)}` : ""}.
                  </p>
                  <button className="quiet" onClick={() => setReminder(r)}>
                    Edit reminder
                  </button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void attempt(() =>
                        service({
                          id: r._id,
                          note: String(f.get("note")),
                        }),
                      );
                    }}
                  >
                    <label>
                      Service note{" "}
                      <input
                        name="note"
                        maxLength={2000}
                        placeholder="What was maintained or replaced?"
                      />
                    </label>
                    <button disabled={busy}>Record completed service</button>
                  </form>
                </section>
              ))}
          </article>
        ))}
      </div>
      {status.data?.gear.length === 0 && (
        <p>No equipment yet. Add it below, then assign it from an activity.</p>
      )}
      <section className="surface section">
        <h2>{editing ? "Edit equipment" : "Add equipment"}</h2>
        <form
          key={editing?._id ?? "new-gear"}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void attempt(async () => {
              await save({
                id: editing?._id,
                name: String(f.get("name")),
                kind: String(f.get("kind")),
                retired: editing?.retired ?? false,
                servicedAt: editing?.servicedAt,
                maintenanceKm: editing?.maintenanceKm,
                maintenanceHours: editing?.maintenanceHours,
              });
              setEditing(null);
            });
          }}
        >
          <label>
            Name{" "}
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={editing?.name ?? ""}
            />
          </label>
          <label>
            Type{" "}
            <select name="kind" defaultValue={editing?.kind ?? "running shoe"}>
              <option>running shoe</option>
              <option>bicycle</option>
              <option>equipment</option>
            </select>
          </label>
          <button disabled={busy}>Save equipment</button>
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
      <section className="surface section">
        <h2>
          {reminder ? "Edit maintenance reminder" : "Add maintenance reminder"}
        </h2>
        <form
          key={reminder?._id ?? "new-reminder"}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void attempt(async () => {
              await saveReminder({
                id: reminder?._id,
                gearId: String(f.get("gear")) as Id<"gear">,
                title: String(f.get("title")),
                distanceKm: f.get("km") ? Number(f.get("km")) : undefined,
                durationHours: f.get("hours")
                  ? Number(f.get("hours"))
                  : undefined,
                dueAt: f.get("due")
                  ? dateBounds(
                      String(f.get("due")),
                      String(f.get("due")),
                      profile?.timezone ?? "UTC",
                    ).to
                  : undefined,
                disabled: f.get("disabled") === "on",
              });
              setReminder(null);
            });
          }}
        >
          <label>
            Equipment{" "}
            <select name="gear" required defaultValue={reminder?.gearId}>
              {status.data?.gear
                .filter((g) => !reminder || reminder.gearId === g._id)
                .map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Task{" "}
            <input
              name="title"
              required
              maxLength={120}
              defaultValue={reminder?.title ?? ""}
              placeholder="Chain replacement"
            />
          </label>
          <label>
            Every kilometre interval{" "}
            <input
              name="km"
              type="number"
              min="0.1"
              step="any"
              defaultValue={reminder?.distanceKm}
            />
          </label>
          <label>
            Every hour interval{" "}
            <input
              name="hours"
              type="number"
              min="0.1"
              step="any"
              defaultValue={reminder?.durationHours}
            />
          </label>
          <label>
            Or due date{" "}
            <input
              name="due"
              type="date"
              defaultValue={
                reminder?.dueAt
                  ? calendarDate(reminder.dueAt, profile?.timezone ?? "UTC")
                  : ""
              }
            />
          </label>
          <label className="check">
            <input
              name="disabled"
              type="checkbox"
              defaultChecked={reminder?.disabled ?? false}
            />{" "}
            Disable reminder
          </label>
          <button disabled={busy || !status.data?.gear.length}>
            Save reminder
          </button>
          {reminder && (
            <button
              type="button"
              className="quiet"
              onClick={() => setReminder(null)}
            >
              Cancel editing
            </button>
          )}
        </form>
      </section>
      <section className="section">
        <h2>Service history</h2>
        {history.results.map((event) => (
          <p key={event._id}>
            {date(event.at)} ·{" "}
            {status.data?.gear.find((g) => g._id === event.gearId)?.name ??
              "Equipment"}{" "}
            · {event.note || "Service completed"}
          </p>
        ))}
        {!history.results.length && history.status === "Exhausted" && (
          <p>No services recorded.</p>
        )}
        {history.status === "CanLoadMore" && (
          <button onClick={() => history.loadMore(20)}>Earlier services</button>
        )}
        {["LoadingFirstPage", "LoadingMore"].includes(history.status) && (
          <p role="status">Loading service history…</p>
        )}
      </section>
    </>
  );
}
