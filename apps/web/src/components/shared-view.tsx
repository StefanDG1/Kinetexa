"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { number, duration } from "./data-ui";
const RouteMap = dynamic(() => import("./route-map"), { ssr: false });
export function SharedView({
  data,
  embedded = false,
}: {
  data: {
    kind: string;
    activities: Record<string, unknown>[];
    totals: Record<
      string,
      {
        value: number | null;
        measuredCount: number;
        missingCount: number;
        unit: string;
      }
    >;
  };
  embedded?: boolean;
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
  const format = (key: string, value: unknown) =>
    value === null
      ? "Unavailable"
      : key === "distance"
        ? `${number(Number(value) / 1000)} km`
        : key === "duration"
          ? duration(Number(value))
          : key === "elevation"
            ? `${number(Number(value), 0)} m`
            : String(value);
  const labels: Record<string, string> = {
    title: "Activity",
    sport: "Sport",
    date: "Date",
    distance: "Distance",
    duration: "Training time",
    elevation: "Elevation gain",
  };
  const summary = Object.entries(data.totals).map(([key, total]) => ({
    key,
    ...total,
  }));
  const Container = embedded ? "section" : "main",
    Heading = embedded ? "h2" : "h1";
  return (
    <Container
      className={embedded ? "share-preview" : "holding"}
      style={{ paddingBlock: 40 }}
    >
      <Link className="wordmark" href="/">
        kinetexa.
      </Link>
      <Heading>
        {data.kind === "statistics"
          ? "Training in numbers"
          : data.kind === "map"
            ? "A shared training map"
            : "Shared training"}
      </Heading>
      <p>The athlete chose the fields below. Route privacy masks apply.</p>
      {routes.length > 0 && <RouteMap routes={routes} />}
      {["statistics", "dashboard"].includes(data.kind) && (
        <div className="period-summary section">
          {summary.map(({ key, value, measuredCount, missingCount }) => (
            <div className="stat" key={key}>
              <span>Total {labels[key].toLowerCase()}</span>
              <strong>{format(key, value)}</strong>
              <small>
                {measuredCount} measured activities
                {missingCount > 0
                  ? `; ${missingCount} missing measurements, total is partial`
                  : ""}
                .
              </small>
            </div>
          ))}
        </div>
      )}
      <div className="collection section">
        {data.activities.map((a, i) => (
          <article className="surface" key={i}>
            {Object.entries(a)
              .filter(([k]) => k !== "route")
              .map(([k, v]) => (
                <p key={k}>
                  <strong>{labels[k] ?? k}</strong>: {format(k, v)}
                </p>
              ))}
          </article>
        ))}
      </div>
    </Container>
  );
}
