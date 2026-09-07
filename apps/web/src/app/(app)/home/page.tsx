"use client";
import { AnalysisResult } from "@/components/analysis-result";
import { MetricExplanation } from "@/components/metric-explanation";
import { useServerRead } from "@/components/server-read";
import { selectedRange } from "@core/calendar";
import { useQuery, useMutation } from "convex/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api } from "@convex/_generated/api";
import {
  ActivityList,
  Chart,
  number,
  duration,
  ranges,
} from "@/components/data-ui";
import { WIDGETS } from "@core/dashboard";
import { AiEvidence } from "@/components/ai-evidence";
const RouteMap = dynamic(() => import("@/components/route-map"), {
  ssr: false,
});
export default function Home() {
  const insights = useQuery(api.ai.insights),
    dismiss = useMutation(api.ai.dismiss);
  const [range, setRange] = useState("28"),
    [sport, setSport] = useState(""),
    [customFrom, setCustomFrom] = useState(""),
    [customTo, setCustomTo] = useState("");
  const profile = useQuery(api.athletes.current);
  const bounds = useMemo(() => {
    try {
      return selectedRange(
        range,
        customFrom,
        customTo,
        profile?.timezone ?? "UTC",
        Date.now(),
      );
    } catch {
      return null;
    }
  }, [range, customFrom, customTo, profile?.timezone]);
  const read = useServerRead(
    api.analytics.dashboard,
    bounds && profile ? { ...bounds, sport: sport || undefined } : "skip",
  );
  const recent = useQuery(
    api.activities.browse,
    bounds && profile
      ? {
          ...bounds,
          sport: sport || undefined,
          view: "list",
          paginationOpts: { numItems: 6, cursor: null },
        }
      : "skip",
  );
  const d = read.data,
    items = recent?.page ?? [],
    routes = items
      .filter((a) => a.route.length)
      .map((a) => ({
        id: a._id,
        title: a.title,
        points: a.route,
        segments: a.routeSegments,
      }));
  const order = profile?.dashboard?.length
      ? profile.dashboard
      : WIDGETS.map(([id]) => id),
    hidden = profile?.hiddenWidgets ?? [],
    latest = d?.curve.at(-1);
  function widget(id: string) {
    if (!d) return null;
    switch (id) {
      case "timeline":
        return (
          <>
            <div className="period-summary">
              <div className="stat">
                <span>Fitness</span>
                <strong>{number(latest?.fitness)}</strong>
              </div>
              <div className="stat">
                <span>Fatigue</span>
                <strong>{number(latest?.fatigue)}</strong>
              </div>
              <div className="stat">
                <span>Form</span>
                <strong>{number(latest?.form)}</strong>
              </div>
            </div>
            <Chart data={d.curve} keys={["fitness", "fatigue", "form"]} />
            <MetricExplanation metric={d.explanations.fitness} />
            <Link href="/activities">View contributing activities</Link>
          </>
        );
      case "weekly":
        return (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>This week</th>
                  <th>Last week</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {(["count", "distance", "duration", "elevation"] as const).map(
                  (k) => (
                    <tr key={k}>
                      <td>
                        {
                          {
                            count: "Activities",
                            distance: "Distance · km",
                            duration: "Time · hours",
                            elevation: "Elevation · m",
                          }[k]
                        }
                      </td>
                      <td>
                        {number(
                          d.currentWeek[k] === null
                            ? null
                            : d.currentWeek[k]! /
                                (k === "distance"
                                  ? 1000
                                  : k === "duration"
                                    ? 3600
                                    : 1),
                        )}
                      </td>
                      <td>
                        {number(
                          d.previousWeek[k] === null
                            ? null
                            : d.previousWeek[k]! /
                                (k === "distance"
                                  ? 1000
                                  : k === "duration"
                                    ? 3600
                                    : 1),
                        )}
                      </td>
                      <td>
                        {d.previousWeek[k] && d.currentWeek[k] !== null
                          ? `${number((100 * (d.currentWeek[k]! - d.previousWeek[k]!)) / d.previousWeek[k]!)}%`
                          : "No baseline"}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <p className="muted">Current week is incomplete.</p>
          </div>
        );
      case "recent":
        return <ActivityList items={items} />;
      case "sports":
        return (
          <>
            <Chart data={d.sports} bar />
            <p className="muted">Training hours by sport</p>
          </>
        );
      case "zones":
        return d.zones.length ? (
          <>
            <Chart data={d.zones} bar />
            <p className="muted">
              Minutes in configured HR zones. Each activity uses the thresholds
              stored with its calculation.
            </p>
          </>
        ) : (
          <p>
            Heart-rate zone data is unavailable. Configure zone boundaries in
            Settings.
          </p>
        );
      case "load":
        return (
          <>
            <Chart
              data={d.curve.map((x) => ({ label: x.date, value: x.load }))}
              bar
            />
            <p>
              Weekly monotony: {number(d.monotony)}. Strain: {number(d.strain)}.
            </p>
            <MetricExplanation metric={d.explanations.monotony} />
            <MetricExplanation metric={d.explanations.strain} />
          </>
        );
      case "records":
        return (
          <>
            <p>
              Personal bests come from complete sensor and distance windows.
              Excluded records stay out of these rankings.
            </p>
            <Link href="/records">View all-time, year and period records</Link>
          </>
        );
      case "goals":
        return d.goals.length ? (
          d.goals.map((g) => {
            const { current, percent } = g.progress;
            return (
              <div key={g._id}>
                <Link href="/goals">{g.title}</Link>
                <p>
                  {number(current)} / {number(g.target)} · {number(percent, 0)}%
                </p>
                <progress
                  aria-label={`${g.title} progress`}
                  value={Math.min(percent ?? 0, 100)}
                  max={100}
                />
              </div>
            );
          })
        ) : (
          <p>
            No goals yet. <Link href="/goals">Set a target</Link>.
          </p>
        );
      case "consistency":
        return (
          <>
            <p className="stat">
              <strong>{d.activeDays} active days</strong>
              <span>{d.streak}-day current streak</span>
            </p>
            <p className="muted">
              A streak counts consecutive days with an activity, ending today or
              yesterday. Rest days are useful too.
            </p>
          </>
        );
      case "map":
        return routes.length ? (
          <>
            <RouteMap routes={routes} />
            <Link href="/maps">
              Explore all routes. This preview shows recent sessions.
            </Link>
          </>
        ) : (
          <p>No recorded GPS routes in this period.</p>
        );
      case "insight":
        if (insights?.length)
          return insights.map((i) => (
            <article key={i._id}>
              <p>{i.content}</p>
              <AiEvidence evidence={i.evidence} />
              <button
                className="secondary"
                onClick={() => void dismiss({ id: i._id })}
              >
                Dismiss this insight
              </button>
            </article>
          ));
        return (
          <>
            <p>
              {profile?.aiConsent
                ? profile.insightConsent
                  ? "No supported automatic observation yet. Insights appear when comparable recorded training supports a meaningful change."
                  : "Automatic insights are off. You can enable them in Settings or ask a question here."
                : "AI is off. Your calculations work independently. You can enable optional AI explanations in Settings."}
            </p>
            <Link href={profile?.aiConsent ? "/ask" : "/settings"}>
              {profile?.aiConsent ? "Ask Kinetexa" : "AI privacy settings"}
            </Link>
          </>
        );
      case "analyses":
        return d.analyses.map((a) => {
          const result = a.results;
          return (
            <div key={a.id}>
              <h3>{a.name}</h3>
              {a.error && <p role="alert">{a.error}</p>}
              <AnalysisResult
                rows={result}
                visual={a.query.visual}
                labels={d.gearNames}
              />
              <Link href={`/analysis?selected=${a.id}`}>Edit analysis</Link>
            </div>
          );
        });
      default:
        return null;
    }
  }
  return (
    <>
      <h1>
        {profile?.displayName
          ? `${profile.displayName}'s training`
          : "Your training"}
      </h1>
      <div className="toolbar">
        <label>
          Period
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {ranges.map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sport
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">All sports</option>
            {["running", "cycling", "swimming", "walking", "other"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {range === "custom" && (
          <>
            <label>
              From
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        )}
        <Link href="/settings">Customize dashboard</Link>
      </div>
      <button className="quiet" onClick={read.refresh} disabled={read.loading}>
        Refresh dashboard
      </button>
      {read.error && <p role="alert">{read.error}</p>}
      {!bounds && <p>Choose an ordered date range.</p>}
      {!d ? (
        <p>
          {read.loading
            ? "Calculating your dashboard…"
            : "Choose a valid period or retry the dashboard."}
        </p>
      ) : (
        <>
          <div className="period-summary">
            <div className="stat">
              <span>Distance</span>
              <strong>
                {number(
                  d.totals.distance === null ? null : d.totals.distance / 1000,
                )}{" "}
                <small>km</small>
              </strong>
            </div>
            <div className="stat">
              <span>Training time</span>
              <strong>{duration(d.totals.duration)}</strong>
            </div>
            <div className="stat">
              <span>Activities</span>
              <strong>{d.totals.count}</strong>
            </div>
            <div className="stat">
              <span>Elevation gain</span>
              <strong>
                {number(d.totals.elevation, 0)} <small>m</small>
              </strong>
            </div>
          </div>
          <div className="dashboard-widgets">
            {order
              .filter((id) => !hidden.includes(id))
              .map((id) => (
                <section className={`section widget-${id}`} key={id}>
                  <div className="section-title">
                    <h2>{WIDGETS.find(([k]) => k === id)?.[1]}</h2>
                    {id === "recent" && (
                      <Link href="/activities">All activities</Link>
                    )}
                  </div>
                  {widget(id)}
                </section>
              ))}
          </div>
        </>
      )}
    </>
  );
}
