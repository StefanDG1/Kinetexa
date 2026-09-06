"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
const RouteMap = dynamic(() => import("./route-map"), { ssr: false });
export function SharedView({
  data,
}: {
  data: { kind: string; activities: Record<string, unknown>[] };
}) {
  const routes = useMemo(
    () =>
      data.activities.flatMap(
        (a, i) =>
          (a.route as number[][][] | undefined)?.map((points, j) => ({
            id: `${i}-${j}`,
            title: "Shared route",
            points,
          })) ?? [],
      ),
    [data],
  );
  return (
    <main className="holding" style={{ paddingBlock: 40 }}>
      <Link className="wordmark" href="/">
        kinetexa.
      </Link>
      <h1>Shared training</h1>
      <p>The athlete chose the fields below. Route privacy masks apply.</p>
      {routes.length > 0 && <RouteMap routes={routes} />}
      <div className="collection section">
        {data.activities.map((a, i) => (
          <article className="surface" key={i}>
            {Object.entries(a)
              .filter(([k]) => k !== "route")
              .map(([k, v]) => (
                <p key={k}>
                  <strong>{k}</strong>: {v === null ? "Unavailable" : String(v)}
                </p>
              ))}
          </article>
        ))}
      </div>
    </main>
  );
}
