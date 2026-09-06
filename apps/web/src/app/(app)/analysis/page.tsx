"use client";
import { useMutation, useQuery, useAction } from "convex/react";
import { useState, useEffect, useRef } from "react";
import { api } from "@convex/_generated/api";
import { querySchema, type AnalysisQuery } from "@core/query";
import { Chart, number } from "@/components/data-ui";
const initial: AnalysisQuery = {
  filters: [],
  metric: "distance",
  aggregate: "sum",
  group: "month",
  visual: "bar",
};
export default function AnalysisPage() {
  const initialized = useRef(false);
  const data = useQuery(api.workspace.overview),
    preview = useAction(api.queryActions.preview),
    save = useMutation(api.workspace.saveAnalysis),
    [q, setQ] = useState(initial),
    [name, setName] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
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
    } else if (data) {
      initialized.current = true;
      const saved = data.analyses.find((a) => a._id === params.get("selected"));
      if (saved) {
        setQ(querySchema.parse(saved.query));
        setName(saved.name);
      }
    }
  }, [data]);
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
            onChange={(e) => {
              const a = data?.analyses.find((a) => a._id === e.target.value);
              if (a) {
                setQ(a.query);
                setName(a.name);
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
      <form
        className="surface"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setRows(await preview({ query: q }));
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
              onChange={(e) =>
                setQ({
                  ...q,
                  from: e.target.value ? Date.parse(e.target.value) : undefined,
                })
              }
            />
          </label>
          <label>
            Through
            <input
              type="date"
              onChange={(e) =>
                setQ({
                  ...q,
                  to: e.target.value
                    ? Date.parse(e.target.value) + 86399999
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
        {rows.length ? (
          q.visual === "number" ? (
            rows.map((r) => (
              <p className="stat" key={r.label}>
                {r.label}
                <strong>{number(r.value)}</strong>
              </p>
            ))
          ) : q.visual === "table" ? (
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Value</th>
                  <th>Activities</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{number(r.value)}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Chart data={rows} bar={q.visual === "bar"} />
          )
        ) : (
          <p>No results yet. Run a query or broaden your filters.</p>
        )}
      </section>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await save({ name, query: q, pinned: f.get("pin") === "on" });
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
          <input name="pin" type="checkbox" /> Pin to dashboard
        </label>
        <button>Save analysis</button>
      </form>
    </>
  );
}
