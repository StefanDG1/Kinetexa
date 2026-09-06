"use client";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { Chart } from "@/components/data-ui";
import { HEALTH_METRICS, dailyHealth } from "@core/health";
export default function Health() {
  const [from, setFrom] = useState(() =>
      new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(() => new Date().toISOString().slice(0, 10)),
    [error, setError] = useState("");
  const status = useQuery(api.health.status),
    setProcessing = useMutation(api.health.setProcessing);
  const valid = Boolean(from && to && from <= to),
    history = usePaginatedQuery(
      api.health.page,
      valid ? { from, to } : "skip",
      { initialNumItems: 100 },
    );
  useEffect(() => {
    if (history.status === "CanLoadMore") history.loadMore(100);
  }, [history.status, history.loadMore]);
  const daily = useMemo(() => dailyHealth(history.results), [history.results]);
  const loading = valid && (!status || history.status !== "Exhausted");
  return (
    <>
      <h1>Recovery in context.</h1>
      <p>
        Read your health signals alongside training. These measurements and
        estimates do not diagnose medical conditions.
      </p>
      <div className="toolbar">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={status?.enabled ?? true}
          disabled={!status}
          onChange={async (e) => {
            try {
              await setProcessing({ enabled: e.target.checked });
              setError("");
            } catch {
              setError("Could not save processing preference.");
            }
          }}
        />
        Process health measurements from future imports
      </label>
      <p className="muted">
        Changing this preference preserves recorded history. AI processing has a
        separate consent setting.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!valid && <p role="alert">Choose an ordered date range.</p>}
      {loading && (
        <p role="status">Loading all health measurements in this period…</p>
      )}
      {valid &&
        !loading &&
        Object.entries(HEALTH_METRICS).map(([kind, metric]) => {
          const rows = daily.filter((h) => h.kind === kind),
            message = !status?.enabled
              ? "Health processing is disabled for future imports."
              : !status.hasSource
                ? "No health source has been imported or connected."
                : status.available.some((s) => s.kind === kind && s.available)
                  ? "There is no recorded measurement for this date range."
                  : "The imported sources have not supplied this measurement.";
          return (
            <section className="section" key={kind}>
              <h2>{metric.label}</h2>
              {rows.length ? (
                <>
                  <p className="muted">
                    {kind === "sleep"
                      ? "Hours of observed sleep intervals that end with an awake record. Open or unknown intervals are omitted; this may be less than a complete night's sleep."
                      : kind === "steps"
                        ? "Highest recorded daily step counter. Different devices are not added together."
                        : `Latest recorded daily value · ${metric.unit}`}
                  </p>
                  <Chart
                    data={rows.map((h) => ({
                      label: h.date,
                      value: kind === "sleep" ? h.value / 3600 : h.value,
                    }))}
                  />
                  <details>
                    <summary>Source records</summary>
                    <ul>
                      {rows.map((h) => (
                        <li key={h._id}>
                          {h.date}: {h.source}
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              ) : (
                <p className="muted">{message}</p>
              )}
            </section>
          );
        })}
      <p>
        <Link href="/import">Import a health-capable FIT file</Link>. Direct
        Garmin health access remains subject to approval.
      </p>
    </>
  );
}
