"use client";
import { HistoryMore } from "@/components/history-more";
import { useWorkspaceCollection } from "@/components/workspace-collection";
import { useMutation, useQuery, useAction } from "convex/react";
import { useState, useEffect, useRef } from "react";
import { api } from "@convex/_generated/api";
import { querySchema, type AnalysisQuery } from "@core/query";
import { AnalysisResult } from "@/components/analysis-result";
import { dateBounds, calendarDate } from "@core/calendar";
import { DeleteItem } from "@/components/delete-item";
import type { Id } from "@convex/_generated/dataModel";
const initial: AnalysisQuery = {
  filters: [],
  metric: "distance",
  aggregate: "sum",
  group: "month",
  visual: "bar",
};
export default function AnalysisPage() {
  const initialized = useRef(false);
  const analyses = useWorkspaceCollection("analyses"),
    gear = useQuery(api.gear.list),
    profile = useQuery(api.athletes.current),
    data = { analyses: analyses.results, gear: gear ?? [] },
    preview = useAction(api.queryActions.preview),
    save = useMutation(api.workspace.saveAnalysis),
    [q, setQ] = useState(initial),
    [name, setName] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  const [editingId, setEditingId] = useState<Id<"analyses"> | undefined>(),
    [pinned, setPinned] = useState(false);
  const [resultQuery, setResultQuery] = useState("");
  const queryKey = JSON.stringify({ ...q, visual: undefined });
  useEffect(() => {
    if (initialized.current) return;
    const params = new URLSearchParams(window.location.search),
      raw = params.get("query");
    if (raw) {
      initialized.current = true;
      try {
        setQ(querySchema.parse(JSON.parse(raw)));
      } catch {
        setError("The linked query is invalid.");
      }
    } else if (analyses.status !== "LoadingFirstPage") {
      const saved = data.analyses.find((a) => a._id === params.get("selected"));
      if (saved) {
        initialized.current = true;
        setQ(querySchema.parse(saved.query));
        setName(saved.name);
        setEditingId(saved._id);
        setPinned(saved.pinned);
      }
    }
  }, [analyses.results, analyses.status]);
  const fields = [
    "duration",
    "distance",
    "elevationGain",
    "avgHr",
    "maxHr",
    "avgPower",
    "weightedPower",
    "avgSpeed",
  ];
  return (
    <>
      <h1>Ask your own questions.</h1>
      <p>
        Filter your workouts, choose a measure and save a view you can return
        to.
      </p>
      <div className="toolbar">
        <label>
          Saved analysis
          <select
            value={editingId ?? ""}
            onChange={(e) => {
              const a = data?.analyses.find((a) => a._id === e.target.value);
              if (a) {
                setQ(a.query);
                setName(a.name);
                setEditingId(a._id);
                setPinned(a.pinned);
                setRows([]);
              } else {
                setEditingId(undefined);
                setName("");
                setPinned(false);
                setQ(initial);
                setRows([]);
              }
            }}
          >
            <option value="">Choose a saved view</option>
            {data?.analyses.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <HistoryMore {...analyses} label="More saved analyses" />
      <form
        className="surface"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setRows(await preview({ query: q }));
            setResultQuery(queryKey);
            setError("");
          } catch {
            setError("Check your query and try again.");
          }
        }}
      >
        <div className="form-columns">
          <label>
            Sport
            <select
              value={q.sport ?? ""}
              onChange={(e) =>
                setQ({ ...q, sport: e.target.value || undefined })
              }
            >
              <option value="">All sports</option>
              {["running", "cycling", "swimming", "walking", "other"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Metric
            <select
              value={q.metric}
              onChange={(e) =>
                setQ({
                  ...q,
                  metric: e.target.value as AnalysisQuery["metric"],
                })
              }
            >
              {["count", ...fields, "load", "efficiency", "decoupling"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={
                q.from === undefined
                  ? ""
                  : calendarDate(
                      q.from,
                      q.timezone ?? profile?.timezone ?? "UTC",
                    )
              }
              onChange={(e) =>
                setQ({
                  ...q,
                  from: e.target.value
                    ? dateBounds(
                        e.target.value,
                        e.target.value,
                        q.timezone ?? profile?.timezone ?? "UTC",
                      ).from
                    : undefined,
                })
              }
            />
          </label>
          <label>
            Through
            <input
              type="date"
              value={
                q.to === undefined
                  ? ""
                  : calendarDate(q.to, q.timezone ?? profile?.timezone ?? "UTC")
              }
              onChange={(e) =>
                setQ({
                  ...q,
                  to: e.target.value
                    ? dateBounds(
                        e.target.value,
                        e.target.value,
                        q.timezone ?? profile?.timezone ?? "UTC",
                      ).to
                    : undefined,
                })
              }
            />
          </label>
          <label>
            Aggregation
            <select
              value={q.aggregate}
              onChange={(e) =>
                setQ({
                  ...q,
                  aggregate: e.target.value as AnalysisQuery["aggregate"],
                })
              }
            >
              {["count", "sum", "average", "min", "max", "median"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Group by
            <select
              value={q.group}
              onChange={(e) =>
                setQ({ ...q, group: e.target.value as AnalysisQuery["group"] })
              }
            >
              {["day", "week", "month", "year", "sport", "gear", "none"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Show as
            <select
              value={q.visual}
              onChange={(e) =>
                setQ({
                  ...q,
                  visual: e.target.value as AnalysisQuery["visual"],
                })
              }
            >
              {["number", "line", "bar", "table"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Tag
            <input
              value={q.tag ?? ""}
              onChange={(e) => setQ({ ...q, tag: e.target.value || undefined })}
            />
          </label>
          <label>
            Gear
            <select
              value={q.gear ?? ""}
              onChange={(e) =>
                setQ({ ...q, gear: e.target.value || undefined })
              }
            >
              <option value="">All gear</option>
              {data?.gear.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          Numeric filters use metres, seconds, metres per second, watts and
          beats per minute.
        </p>
        {q.filters.map((f, i) => (
          <div className="toolbar" key={i}>
            <label>
              Measure
              <select
                value={f.field}
                onChange={(e) =>
                  setQ({
                    ...q,
                    filters: q.filters.map((x, j) =>
                      j === i
                        ? { ...x, field: e.target.value as typeof f.field }
                        : x,
                    ),
                  })
                }
              >
                {fields.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Condition
              <select
                value={f.op}
                onChange={(e) =>
                  setQ({
                    ...q,
                    filters: q.filters.map((x, j) =>
                      j === i ? { ...x, op: e.target.value as typeof f.op } : x,
                    ),
                  })
                }
              >
                <option value="gt">Greater than</option>
                <option value="lt">Less than</option>
                <option value="eq">Equal to</option>
              </select>
            </label>
            <label>
              Value
              <input
                type="number"
                step="any"
                value={f.value}
                onChange={(e) =>
                  setQ({
                    ...q,
                    filters: q.filters.map((x, j) =>
                      j === i ? { ...x, value: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setQ({ ...q, filters: q.filters.filter((_, j) => j !== i) })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setQ({
              ...q,
              filters: [
                ...q.filters,
                { field: "distance", op: "gt", value: 30000 },
              ],
            })
          }
        >
          Add filter
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button>Run analysis</button>
      </form>
      <section className="section">
        <h2>Results</h2>
        {q.group === "gear" && (
          <p>
            Each assigned item has its own group. One activity can contribute to
            several items; gear totals are not additive.
          </p>
        )}
        <AnalysisResult
          rows={resultQuery === queryKey ? rows : []}
          visual={q.visual}
          labels={Object.fromEntries(data.gear.map((g) => [g._id, g.name]))}
        />
      </section>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            setEditingId(await save({ id: editingId, name, query: q, pinned }));
            setError("");
          } catch {
            setError("Could not save the analysis.");
          }
        }}
      >
        <label>
          Analysis name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="check">
          <input
            name="pin"
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />{" "}
          Pin to dashboard
        </label>
        <button>{editingId ? "Update analysis" : "Save analysis"}</button>
        {editingId && (
          <>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                try {
                  setEditingId(
                    await save({
                      name: `${name} copy`,
                      query: q,
                      pinned: false,
                    }),
                  );
                  setName(`${name} copy`);
                  setPinned(false);
                  setError("");
                } catch {
                  setError("Could not save a copy.");
                }
              }}
            >
              Save a copy
            </button>
            <DeleteItem
              id={editingId}
              label="analysis"
              onDeleted={() => {
                setEditingId(undefined);
                setName("");
                setPinned(false);
                setRows([]);
              }}
            />
          </>
        )}
      </form>
    </>
  );
}
