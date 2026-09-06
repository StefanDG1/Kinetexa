"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { WIDGETS } from "@core/dashboard";
import { useState } from "react";
export function DashboardSettings() {
  const p = useQuery(api.athletes.current),
    save = useMutation(api.workspace.settings),
    [error, setError] = useState("");
  if (!p) return null;
  const order = p.dashboard?.length ? p.dashboard : WIDGETS.map(([k]) => k),
    hidden = p.hiddenWidgets ?? [];
  async function update(dashboard: string[], hiddenWidgets = hidden) {
    try {
      await save({
        thresholds: p!.thresholds ?? {},
        dashboard,
        hiddenWidgets,
        insightConsent: p!.insightConsent ?? false,
      });
      setError("");
    } catch {
      setError("Could not save your layout.");
    }
  }
  return (
    <section className="surface section">
      <h2>Your dashboard layout</h2>
      <p>
        Move the views you use most to the top. Hidden widgets keep their data.
      </p>
      {order.map((id, i) => (
        <div className="job" key={id}>
          <label className="check">
            <input
              type="checkbox"
              checked={!hidden.includes(id)}
              onChange={() =>
                void update(
                  order,
                  hidden.includes(id)
                    ? hidden.filter((x) => x !== id)
                    : [...hidden, id],
                )
              }
            />
            {WIDGETS.find(([k]) => k === id)?.[1]}
          </label>
          <div className="tabs">
            <button
              disabled={i === 0}
              className="secondary"
              aria-label={`Move ${id} up`}
              onClick={() => {
                const next = [...order];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                void update(next);
              }}
            >
              Up
            </button>
            <button
              disabled={i === order.length - 1}
              className="secondary"
              aria-label={`Move ${id} down`}
              onClick={() => {
                const next = [...order];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                void update(next);
              }}
            >
              Down
            </button>
          </div>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      <button
        className="secondary"
        onClick={() =>
          void update(
            WIDGETS.map(([k]) => k),
            [],
          )
        }
      >
        Restore default layout
      </button>
    </section>
  );
}
