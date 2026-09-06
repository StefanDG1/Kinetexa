"use client";
import { useActivityHistory } from "@/components/activity-history";
import { use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Activity, Metric, Sample } from "@core/model";
import { Chart, number, duration, date } from "@/components/data-ui";
const RouteMap = dynamic(() => import("@/components/route-map"), {
  ssr: false,
});
export default function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    activityId = id as Id<"activities">,
    a = useQuery(api.activities.get, { id: activityId }),
    provenance = useQuery(api.activities.provenance, { id: activityId }),
    workspace = useQuery(api.workspace.overview),
    all = useActivityHistory({}),
    getStream = useAction(api.processing.stream),
    update = useMutation(api.activities.update),
    merge = useMutation(api.activities.merge);
  const [stream, setStream] = useState<Activity | null>(null),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState(0),
    [series, setSeries] = useState<keyof Sample>("hr"),
    [from, setFrom] = useState(0),
    [to, setTo] = useState(100),
    [comparison, setComparison] = useState("");
  const [otherStream, setOtherStream] = useState<Activity | null>(null);
  useEffect(() => {
    let active = true;
    setOtherStream(null);
    if (comparison)
      getStream({ id: comparison as Id<"activities"> })
        .then((s) => {
          if (active) setOtherStream(s);
        })
        .catch(() => setError("Comparison recording could not be loaded."));
    return () => {
      active = false;
    };
  }, [comparison, getStream]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        getStream({
          id: activityId,
          from: a ? (a.duration * from) / 100 : undefined,
          to: a ? (a.duration * to) / 100 : undefined,
        })
          .then((s) => {
            if (active) {
              setStream(s);
              setCursor(0);
            }
          })
          .catch(() =>
            setError("Sensor data could not be loaded. Reload to retry."),
          ),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activityId, getStream, from, to, a?.duration]);
  const routes = useMemo(
    () => (a ? [{ id: a._id, title: a.title, points: a.route }] : []),
    [a],
  );
  const points = stream?.samples ?? [],
    selected = points[cursor],
    chart = useMemo(() => {
      const step = Math.max(1, Math.ceil(points.length / 2000));
      return points
        .filter(
          (s, i) =>
            i % step === 0 &&
            s.t >= ((stream?.duration ?? 0) * from) / 100 &&
            s.t <= ((stream?.duration ?? 0) * to) / 100,
        )
        .map((s) => ({
          label: Math.round((s.t / 60) * 100) / 100,
          value: s[series] ?? null,
        }));
    }, [points, series, from, to, stream]);
  const comparisonChart = useMemo(() => {
    if (!stream || !otherStream) return [];
    const lookup = (samples: Sample[], t: number) => {
      let lo = 0,
        hi = samples.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (samples[mid].t <= t) lo = mid;
        else hi = mid - 1;
      }
      const s = samples[lo];
      return s && Math.abs(s.t - t) <= 30 ? (s[series] ?? null) : null;
    };
    const end = Math.max(stream.duration, otherStream.duration),
      step = Math.max(1, Math.ceil(end / 600));
    return Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => ({
      label: Math.round(((i * step) / 60) * 100) / 100,
      current: lookup(stream.samples, i * step),
      comparison: lookup(otherStream.samples, i * step),
    }));
  }, [stream, otherStream, series]);
  if (!a) return <p>Loading activity…</p>;
  const other = all?.find((x) => x._id === comparison),
    metrics = a.metrics.metrics as Record<string, Metric>;
  return (
    <>
      <p className="muted">
        {a.sport} · {date(a.start)} ·{" "}
        {new Date(a.start).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <h1>{a.title}</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="period-summary">
        <div className="stat">
          <span>Distance</span>
          <strong>
            {number(a.distance === undefined ? null : a.distance / 1000)} km
          </strong>
        </div>
        <div className="stat">
          <span>Elapsed time</span>
          <strong>{duration(a.duration)}</strong>
        </div>
        <div className="stat">
          <span>Moving time</span>
          <strong>
            {a.summary.movingDuration === undefined
              ? "Unavailable"
              : duration(a.summary.movingDuration)}
          </strong>
        </div>
        <div className="stat">
          <span>Elevation gain</span>
          <strong>{number(a.summary.elevationGain, 0)} m</strong>
        </div>
      </div>
      <div className="detail-grid">
        <div>
          {a.route.length ? (
            <RouteMap
              routes={routes}
              onPointSelect={(point) => {
                let nearest = 0,
                  best = Infinity;
                points.forEach((s, i) => {
                  if (s.lon === undefined || s.lat === undefined) return;
                  const d = (s.lon - point[0]) ** 2 + (s.lat - point[1]) ** 2;
                  if (d < best) {
                    best = d;
                    nearest = i;
                  }
                });
                setCursor(nearest);
              }}
              cursor={
                selected?.lon !== undefined && selected?.lat !== undefined
                  ? [selected.lon, selected.lat]
                  : undefined
              }
            />
          ) : (
            <p className="empty">This file has no recorded GPS route.</p>
          )}
          {points.length > 0 && (
            <label className="section">
              Explore the recording · {duration(selected?.t ?? 0)}
              <input
                aria-label="Synchronized recording cursor"
                type="range"
                min={0}
                max={points.length - 1}
                value={cursor}
                onChange={(e) => setCursor(Number(e.target.value))}
              />
              <span className="muted">
                HR {number(selected?.hr, 0)} bpm · Power{" "}
                {number(selected?.power, 0)} W · Speed{" "}
                {number(
                  selected?.speed === undefined
                    ? undefined
                    : selected.speed * 3.6,
                )}{" "}
                km/h
              </span>
            </label>
          )}
        </div>
        <div className="metrics-grid">
          {Object.values(metrics).map((m) => (
            <div className="metric" key={m.definition}>
              <span>{m.definition}</span>
              <strong>
                {number(m.value)}{" "}
                <small>{m.value === null ? "" : m.unit}</small>
              </strong>
              <details>
                <summary>Explain</summary>
                <p>{m.formula}</p>
                <p>{m.caveat}</p>
                <p>
                  Inputs:{" "}
                  {Object.entries(m.inputs)
                    .map(([k, v]) => `${k}: ${number(v)}`)
                    .join("; ")}
                </p>
                <p>Version {m.version}</p>
              </details>
            </div>
          ))}
        </div>
      </div>
      <section className="section">
        <h2>Sensor recording</h2>
        <div className="toolbar">
          <label>
            Measurement
            <select
              value={series}
              onChange={(e) => setSeries(e.target.value as keyof Sample)}
            >
              {[
                ["hr", "Heart rate · bpm"],
                ["power", "Power · W"],
                ["speed", "Speed · m/s"],
                ["cadence", "Cadence · rpm"],
                ["altitude", "Elevation · m"],
                ["temperature", "Temperature · °C"],
                ["grade", "Grade · %"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Interval start · %
            <input
              type="number"
              min={0}
              max={to - 1}
              value={from}
              onChange={(e) =>
                setFrom(Math.max(0, Math.min(to - 1, Number(e.target.value))))
              }
            />
          </label>
          <label>
            Interval end · %
            <input
              type="number"
              min={from + 1}
              max={100}
              value={to}
              onChange={(e) =>
                setTo(Math.min(100, Math.max(from + 1, Number(e.target.value))))
              }
            />
          </label>
        </div>
        {chart.some((r) => r.value !== null) ? (
          <Chart
            data={chart}
            onCursor={(minutes) => {
              let nearest = 0;
              for (let i = 1; i < points.length; i++)
                if (
                  Math.abs(points[i].t - minutes * 60) <
                  Math.abs(points[nearest].t - minutes * 60)
                )
                  nearest = i;
              setCursor(nearest);
            }}
          />
        ) : (
          <p className="empty">
            This measurement is unavailable in the selected interval.
          </p>
        )}
        <p className="muted">
          Horizontal axis: elapsed minutes. Use the recording cursor above to
          follow your position on the map.
        </p>
      </section>
      <section className="section">
        <h2>Laps and zones</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lap</th>
                <th>Duration</th>
                <th>Distance</th>
              </tr>
            </thead>
            <tbody>
              {a.summary.laps.map((l: any, i: number) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{duration(l.duration)}</td>
                  <td>
                    {number(
                      l.distance === undefined ? null : l.distance / 1000,
                    )}{" "}
                    km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!a.summary.laps.length && <p>No source laps were recorded.</p>}
        {(["hrZones", "powerZones", "paceZones"] as const).map((k) => (
          <div key={k}>
            <h3>
              {k === "hrZones"
                ? "Heart rate"
                : k === "powerZones"
                  ? "Power"
                  : "Pace"}{" "}
              zones
            </h3>
            {a.metrics[k] ? (
              <Chart
                data={a.metrics[k].map((s: number, i: number) => ({
                  label: `Zone ${i + 1}`,
                  value: s / 60,
                }))}
                bar
              />
            ) : (
              <p className="muted">
                Configure your zones in Settings. A matching sensor stream is
                required.
              </p>
            )}
          </div>
        ))}
      </section>
      <section className="section">
        <h2>Best efforts</h2>
        <div className="form-columns">
          <div>
            <h3>Power duration curve</h3>
            <Chart
              data={a.metrics.powerCurve.map((r: any) => ({
                label: duration(r.duration),
                value: r.value,
              }))}
            />
          </div>
          <div>
            <h3>Distance efforts</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Distance</th>
                    <th>Best time</th>
                  </tr>
                </thead>
                <tbody>
                  {a.metrics.bestDistances.map((r: any) => (
                    <tr key={r.distance}>
                      <td>{number(r.distance / 1000, 3)} km</td>
                      <td>
                        {r.duration === null
                          ? "Unavailable"
                          : `${Math.floor(r.duration / 60)}m ${Math.round(r.duration % 60)}s`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <h2>Compare a session</h2>
        <label>
          Other activity
          <select
            value={comparison}
            onChange={(e) => setComparison(e.target.value)}
          >
            <option value="">Choose an activity</option>
            {all
              ?.filter((x) => x._id !== id)
              .map((x) => (
                <option key={x._id} value={x._id}>
                  {x.title} · {date(x.start)}
                </option>
              ))}
          </select>
        </label>
        {other && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{a.title}</th>
                  <th>{other.title}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Duration</td>
                  <td>{duration(a.duration)}</td>
                  <td>{duration(other.duration)}</td>
                </tr>
                <tr>
                  <td>Distance · km</td>
                  <td>{number((a.distance ?? 0) / 1000)}</td>
                  <td>{number((other.distance ?? 0) / 1000)}</td>
                </tr>
                <tr>
                  <td>Mean heart rate · bpm</td>
                  <td>{number(a.summary.avgHr)}</td>
                  <td>{number(other.summary.avgHr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {other && (
          <>
            <p>
              Recordings aligned by elapsed minutes. Measurement follows the
              sensor selector above. Missing samples remain gaps; the current
              activity reflects its selected interval.
            </p>
            <Chart data={comparisonChart} keys={["current", "comparison"]} />
          </>
        )}
      </section>
      <section className="section surface">
        <h2>Notes and equipment</h2>
        <form
          key={a._id}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await update({
                id: activityId,
                title: String(f.get("title")),
                notes: String(f.get("notes")),
                tags: String(f.get("tags"))
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                gearIds: f.getAll("gear") as Id<"gear">[],
                excludedRecords: f.get("exclude") === "on",
              });
              setError("");
            } catch {
              setError("Could not save activity details.");
            }
          }}
        >
          <label>
            Title
            <input name="title" defaultValue={a.title} required />
          </label>
          <label>
            Private notes
            <textarea name="notes" defaultValue={a.notes} />
          </label>
          <label>
            Tags, separated by commas
            <input name="tags" defaultValue={a.tags.join(", ")} />
          </label>
          <div>
            {workspace?.gear.map((g) => (
              <label key={g._id} className="check">
                <input
                  type="checkbox"
                  name="gear"
                  value={g._id}
                  defaultChecked={a.gearIds.includes(g._id)}
                />
                {g.name}
              </label>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              name="exclude"
              defaultChecked={a.excludedRecords}
            />{" "}
            Exclude suspicious sensor/GPS records from personal bests
          </label>
          <button>Save activity</button>
        </form>
      </section>
      {a.duplicateOf && (
        <section className="privacy-note">
          <h2>Possible duplicate</h2>
          <p>
            Another activity has a similar sport, start time and duration. Both
            originals are preserved.
          </p>
          <Link href={`/activities/${a.duplicateOf}`}>
            Inspect the other activity
          </Link>
          <button
            className="secondary"
            onClick={() =>
              void merge({
                id: activityId,
                into: a.mergedInto ? undefined : a.duplicateOf,
              })
            }
          >
            {a.mergedInto ? "Undo merge" : "Merge into the other activity"}
          </button>
        </section>
      )}
      <details className="section">
        <summary>Original source and calculation history</summary>
        <p>
          Parser and normalizer: {a.version}. Imported {date(a.createdAt)}.
          Thresholds: {JSON.stringify(a.metrics.thresholds)}.
        </p>
        <Link href="/import">Download the original from import history</Link>
        {provenance?.source && (
          <dl>
            <dt>Original filename</dt>
            <dd>{provenance.source.name}</dd>
            <dt>SHA-256 checksum</dt>
            <dd className="checksum">{provenance.source.hash}</dd>
            <dt>Original bytes</dt>
            <dd>{provenance.source.bytes}</dd>
            <dt>Format</dt>
            <dd>{provenance.source.format ?? "Original source format"}</dd>
            <dt>Source record</dt>
            <dd>
              {provenance.source.importMetadata?.sourceRecordId ??
                "Uploaded file"}
            </dd>
            <dt>Parser</dt>
            <dd>{provenance.source.parserVersion}</dd>
          </dl>
        )}
        {provenance?.sources && provenance.sources.length > 1 && (
          <details>
            <summary>
              All contributing source files · {provenance.sources.length}
            </summary>
            {provenance.sources.map((s) => (
              <p key={s.id}>
                {s.name} · {s.status} · Source record{" "}
                {s.importMetadata?.sourceRecordId ?? "uploaded file"}
                <br />
                <span className="checksum">{s.hash}</span>
              </p>
            ))}
          </details>
        )}
        {provenance?.history.map((h) => (
          <details key={h._id}>
            <summary>
              Previous calculation · {new Date(h.at).toLocaleString()}
            </summary>
            <p>
              Version {h.metrics.version}. Thresholds{" "}
              {JSON.stringify(h.metrics.thresholds)}.
            </p>
            <p>Load {number(h.metrics.metrics?.load?.value)} points</p>
          </details>
        ))}
      </details>
      <Link href={`/ask?activity=${id}`}>Ask about this workout</Link> ·{" "}
      <Link href={`/sharing?activity=${id}`}>Share selected fields</Link>
    </>
  );
}
