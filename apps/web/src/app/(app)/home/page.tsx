"use client";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import {
  ActivityList,
  Empty,
  Chart,
  number,
  duration,
  ranges,
  rangeStart,
} from "@/components/data-ui";
import { fitness } from "@core/analytics";
export default function Home() {
  const [range, setRange] = useState("28"),
    [sport, setSport] = useState("");
  const items = useQuery(api.activities.list, { sport: sport || undefined }),
    profile = useQuery(api.athletes.current),
    workspace = useQuery(api.workspace.overview);
  const selected = items?.filter((a) => a.start >= rangeStart(range));
  const curve = useMemo(() => {
    if (!items?.length) return [];
    const start = Math.max(
        Math.min(...items.map((a) => a.start)),
        Date.now() - 365 * 86400000,
      ),
      daily = [];
    for (let t = start; t <= Date.now(); t += 86400000) {
      const label = new Date(t).toISOString().slice(0, 10),
        day = items.filter(
          (a) => new Date(a.start).toISOString().slice(0, 10) === label,
        );
      daily.push({
        date: label,
        load: day.reduce((n, a) => n + (a.metrics.metrics.load.value ?? 0), 0),
      });
    }
    return fitness(daily)
      .filter((d) => Date.parse(d.date) >= rangeStart(range))
      .map((d) => ({ ...d, label: d.date }));
  }, [items, range]);
  const count = selected?.length ?? 0,
    totalDistance = selected?.reduce((n, a) => n + (a.distance ?? 0), 0),
    totalTime = selected?.reduce((n, a) => n + a.duration, 0) ?? 0;
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
            {ranges
              .filter((r) => r[0] !== "custom")
              .map(([v, l]) => (
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
            <option value="running">Running</option>
            <option value="cycling">Cycling</option>
          </select>
        </label>
        <Link href="/settings">Customize dashboard</Link>
      </div>
      {items === undefined ? (
        <p>Loading your history…</p>
      ) : !items.length ? (
        <Empty />
      ) : (
        <>
          <div className="period-summary">
            <div className="stat">
              <span>Distance</span>
              <strong>
                {number(totalDistance ? totalDistance / 1000 : null)}{" "}
                <small>km</small>
              </strong>
            </div>
            <div className="stat">
              <span>Training time</span>
              <strong>{duration(totalTime)}</strong>
            </div>
            <div className="stat">
              <span>Activities</span>
              <strong>{count}</strong>
            </div>
            <div className="stat">
              <span>Elevation gain</span>
              <strong>
                {number(
                  selected?.reduce(
                    (n, a) => n + (a.summary.elevationGain ?? 0),
                    0,
                  ),
                  0,
                )}{" "}
                <small>m</small>
              </strong>
            </div>
          </div>
          <div className="home-grid">
            <div>
              <section className="section">
                <div className="section-title">
                  <h2>Training over time</h2>
                  <Link href="/analysis">Explore your data</Link>
                </div>
                <Chart data={curve} keys={["chronic", "acute", "form"]} />
                <details>
                  <summary>Explain fitness, fatigue and form</summary>
                  <p>
                    Fitness uses 42-day exponential load decay. Fatigue uses 7
                    days. Form is prior-day fitness minus fatigue. Missing load
                    is treated as zero in this curve and can underestimate
                    training. Configure your heart-rate or power thresholds to
                    calculate load.
                  </p>
                  <Link href="/settings">Review thresholds</Link>
                </details>
              </section>
              <section className="section">
                <div className="section-title">
                  <h2>Recent sessions</h2>
                  <Link href="/activities">All activities</Link>
                </div>
                <ActivityList items={selected?.slice(0, 6) ?? []} />
              </section>
            </div>
            <aside>
              <section className="surface section">
                <h2>Make sense of the week</h2>
                <p>
                  {profile?.aiConsent
                    ? "Ask a question about your training. Answers include the activities and calculations used."
                    : "AI is off. Your calculations work independently. Enable AI in Settings when you want an explanation from the assistant."}
                </p>
                <Link href={profile?.aiConsent ? "/ask" : "/settings"}>
                  {profile?.aiConsent ? "Ask Kinetexa" : "AI privacy settings"}
                </Link>
              </section>
              <section className="section">
                <h2>Your goals</h2>
                {workspace?.goals.length ? (
                  workspace.goals.map((g) => (
                    <p key={g._id}>
                      <Link href="/goals">{g.title}</Link>
                    </p>
                  ))
                ) : (
                  <p>
                    No goals yet.{" "}
                    <Link href="/goals">Set your first target</Link>.
                  </p>
                )}
              </section>
              <section className="section">
                <h2>Where you moved</h2>
                <p>
                  Explore your recorded routes together and see where your
                  training takes you.
                </p>
                <Link className="button secondary" href="/maps">
                  Open your map
                </Link>
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
