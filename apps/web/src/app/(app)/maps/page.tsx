"use client";
import { HistoryMore } from "@/components/history-more";
import { selectedRange } from "@core/calendar";
import { useQuery, usePaginatedQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@convex/_generated/api";
import { ranges, rangeStart, Empty } from "@/components/data-ui";
const RouteMap = dynamic(() => import("@/components/route-map"), {
  ssr: false,
});
export default function MapsPage() {
  const [sport, setSport] = useState(""),
    [range, setRange] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [selection, setSelection] = useState<string[]>([]),
    profile = useQuery(api.athletes.current),
    router = useRouter();
  const bounds = useMemo(() => {
    try {
      return selectedRange(
        range,
        from,
        to,
        profile?.timezone ?? "UTC",
        Date.now(),
      );
    } catch {
      return null;
    }
  }, [range, from, to, profile?.timezone]);
  const history = usePaginatedQuery(
    api.activities.browse,
    bounds && profile
      ? { ...bounds, sport: sport || undefined, view: "map" }
      : "skip",
    { initialNumItems: 50 },
  );
  const items = history.results;
  const routes = useMemo(
    () =>
      items
        .filter((a) => !selection.length || selection.includes(a._id))
        .map((a) => ({
          id: a._id,
          title: a.title,
          points: a.route,
          segments: a.routeSegments,
        })),
    [items, selection],
  );
  const select = useCallback(
    (id: string) => router.push(`/activities/${id}`),
    [router],
  );
  return (
    <>
      <h1>Your movement, mapped.</h1>
      <p>
        Repeated routes build a stronger line. Select a route to open the
        workout behind it.
      </p>
      <div className="toolbar">
        <label>
          Sport
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">All sports</option>
            <option value="running">Running</option>
            <option value="cycling">Cycling</option>
            <option value="walking">Walking</option>
            <option value="swimming">Swimming</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Period
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {ranges.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {range === "custom" && (
          <>
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
          </>
        )}
      </div>
      <details className="section">
        <summary>
          Select activities ·{" "}
          {selection.length
            ? `${selection.length} selected`
            : "All matching activities"}
        </summary>
        <button className="quiet" onClick={() => setSelection([])}>
          Show all
        </button>
        <div className="map-selection">
          {items
            ?.filter((a) => a.route.length)
            .map((a) => (
              <label className="check" key={a._id}>
                <input
                  type="checkbox"
                  checked={selection.includes(a._id)}
                  onChange={(e) =>
                    setSelection(
                      e.target.checked
                        ? [...selection, a._id]
                        : selection.filter((id) => id !== a._id),
                    )
                  }
                />
                {a.title}
              </label>
            ))}
        </div>
      </details>
      {!bounds && <p>Choose an ordered date range.</p>}
      <HistoryMore {...history} label="Load earlier matching routes" />
      {routes.length ? (
        <RouteMap routes={routes} onSelect={select} large />
      ) : (
        <Empty
          title="No routes in this period"
          text="Import an activity with GPS data or widen the date range."
        />
      )}
      <p className="muted">
        {routes.length} loaded routes
        {history.status !== "Exhausted" ? "; more history is available" : ""}.
        This map is private. Shared routes use server-side privacy masking.
      </p>
    </>
  );
}
