"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { number, duration } from "@/components/data-ui";
export default function GearPage() {
  const data = useQuery(api.workspace.overview),
    activities = useQuery(api.activities.list, {}),
    save = useMutation(api.workspace.saveGear),
    [error, setError] = useState("");
  return (
    <>
      <h1>The kit that carries you.</h1>
      <div className="collection section">
        {data?.gear.map((g) => {
          const rows =
              activities?.filter((a) => a.gearIds.includes(g._id)) ?? [],
            km = rows.reduce((n, a) => n + (a.distance ?? 0) / 1000, 0),
            time = rows.reduce((n, a) => n + a.duration, 0),
            since = rows.filter((a) => a.start >= g.servicedAt),
            serviceKm = since.reduce((n, a) => n + (a.distance ?? 0) / 1000, 0),
            hours = since.reduce((n, a) => n + a.duration / 3600, 0),
            due =
              (g.maintenanceKm && serviceKm >= g.maintenanceKm) ||
              (g.maintenanceHours && hours >= g.maintenanceHours);
          const { _id, _creationTime: _c, athleteId: _a, ...fields } = g;
          return (
            <article className="surface" key={g._id}>
              <h2>{g.name}</h2>
              <p>
                {g.kind}
                {g.retired ? " · Retired" : ""}
              </p>
              <p>
                {number(km)} km · {duration(time)} · {rows.length} activities
              </p>
              {due && (
                <p className="privacy-note">
                  Maintenance is due. {number(serviceKm)} km and {number(hours)}{" "}
                  hours since the last service.
                </p>
              )}
              <div className="tabs">
                <button
                  className="secondary"
                  onClick={() =>
                    void save({ id: _id, ...fields, servicedAt: Date.now() })
                  }
                >
                  Mark serviced
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void save({ id: _id, ...fields, retired: !g.retired })
                  }
                >
                  {g.retired ? "Restore" : "Retire"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <section className="surface section">
        <h2>Add equipment</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await save({
                name: String(f.get("name")),
                kind: String(f.get("kind")),
                retired: false,
                servicedAt: Date.now(),
                maintenanceKm: f.get("km") ? Number(f.get("km")) : undefined,
                maintenanceHours: f.get("hours")
                  ? Number(f.get("hours"))
                  : undefined,
              });
              setError("");
            } catch {
              setError("Check the equipment name and service interval.");
            }
          }}
        >
          <label>
            Name
            <input name="name" required placeholder="Road shoes" />
          </label>
          <div className="form-columns">
            <label>
              Type
              <select name="kind">
                <option>running shoe</option>
                <option>bicycle</option>
                <option>equipment</option>
              </select>
            </label>
            <label>
              Remind me every · km
              <input name="km" type="number" min="1" />
            </label>
            <label>
              Or every · hours
              <input name="hours" type="number" min="1" />
            </label>
          </div>
          <p className="muted">
            Assign equipment from an activity. Retiring gear keeps its history.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button>Add gear</button>
        </form>
      </section>
    </>
  );
}
