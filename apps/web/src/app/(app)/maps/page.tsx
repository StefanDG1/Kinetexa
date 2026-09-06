"use client";
import { useQuery } from "convex/react";
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
    items = useQuery(api.activities.list, { sport: sport || undefined }),
    router = useRouter();
  const routes = useMemo(
    () =>
      items
        ?.filter((a) => a.start >= rangeStart(range) && a.route.length)
        .map((a) => ({ id: a._id, title: a.title, points: a.route })) ?? [],
    [items, range],
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
          </select>
        </label>
        <label>
          Period
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {ranges
              .filter(([v]) => v !== "custom")
              .map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
          </select>
        </label>
      </div>
      {routes.length ? (
        <RouteMap routes={routes} onSelect={select} large />
      ) : (
        <Empty
          title="No routes in this period"
          text="Import an activity with GPS data or widen the date range."
        />
      )}
      <p className="muted">
        {routes.length} recorded routes. This map is private. Shared routes use
        server-side privacy masking.
      </p>
    </>
  );
}
