"use client";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { Doc } from "@convex/_generated/dataModel";
export type ActivityDoc = Doc<"activities">;
export function number(n: number | undefined | null, digits = 1) {
  return n === undefined || n === null
    ? "Unavailable"
    : n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
export function duration(n: number) {
  const h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${Math.round(n)}s`;
}
export function date(n: number) {
  return new Date(n).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function RouteThumb({ points }: { points: number[][] }) {
  if (points.length < 2)
    return <div className="route-thumb" aria-label="No recorded route" />;
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    minX = Math.min(...xs),
    minY = Math.min(...ys),
    sx = Math.max(...xs) - minX || 1,
    sy = Math.max(...ys) - minY || 1;
  return (
    <svg
      className="route-thumb"
      viewBox="0 0 90 60"
      aria-label="Recorded route"
    >
      <polyline
        points={points
          .map(
            (p) =>
              `${8 + ((p[0] - minX) / sx) * 74},${52 - ((p[1] - minY) / sy) * 44}`,
          )
          .join(" ")}
        fill="none"
        stroke="#147d92"
        strokeWidth="2"
      />
    </svg>
  );
}
export function ActivityList({ items }: { items: ActivityDoc[] }) {
  return (
    <div className="activity-list">
      {items.map((a) => (
        <Link
          className="activity-row"
          href={`/activities/${a._id}`}
          key={a._id}
        >
          <RouteThumb points={a.route} />
          <div>
            <h3>{a.title}</h3>
            <p>
              {a.sport} · {date(a.start)}
            </p>
          </div>
          <div className="number">
            <strong>
              {a.distance === undefined
                ? "Distance unavailable"
                : `${number(a.distance / 1000)} km`}
            </strong>
            <p>{duration(a.duration)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function Empty({
  title = "Your history starts here",
  text = "Import your FIT, TCX or GPX files to see your own routes and training.",
  action = true,
}: {
  title?: string;
  text?: string;
  action?: boolean;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <Link className="button" href="/import">
          Import activities
        </Link>
      )}
    </div>
  );
}
export function Chart({
  data,
  keys = ["value"],
  bar = false,
  onCursor,
}: {
  data: Record<string, any>[];
  keys?: string[];
  bar?: boolean;
  onCursor?: (label: number) => void;
}) {
  const colors = ["#147d92", "#bd3e1d", "#16384b"];
  return (
    <>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          {bar ? (
            <BarChart data={data}>
              <CartesianGrid vertical={false} stroke="#dce7eb" />
              <XAxis dataKey="label" minTickGap={30} />
              <YAxis width={45} />
              <Tooltip />
              {keys.map((k, i) => (
                <Bar
                  key={k}
                  dataKey={k}
                  fill={colors[i % 3]}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart
              data={data}
              onMouseMove={(state) => {
                if (state.activeLabel !== undefined)
                  onCursor?.(Number(state.activeLabel));
              }}
            >
              <CartesianGrid vertical={false} stroke="#dce7eb" />
              <XAxis dataKey="label" minTickGap={30} />
              <YAxis width={45} />
              <Tooltip />
              {keys.length > 1 && <Legend />}
              {keys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={colors[i % 3]}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray={i === 2 ? "4 3" : undefined}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <details>
        <summary>View chart data</summary>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Chart data table"
        >
          <table>
            <thead>
              <tr>
                <th>Period</th>
                {keys.map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td>{r.label}</td>
                  {keys.map((k) => (
                    <td key={k}>{number(r[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export const ranges = [
  ["7", "7 days"],
  ["28", "4 weeks"],
  ["90", "3 months"],
  ["180", "6 months"],
  ["ytd", "Year to date"],
  ["365", "1 year"],
  ["all", "All time"],
  ["custom", "Custom range"],
];
export function rangeStart(range: string) {
  return range === "all"
    ? 0
    : range === "ytd"
      ? new Date(new Date().getFullYear(), 0, 1).getTime()
      : Date.now() - Number(range) * 86400000;
}
