import { Chart, number } from "./data-ui";
import type { AnalysisQuery, runQuery } from "@core/query";

export function AnalysisResult({
  rows,
  visual,
}: {
  rows: ReturnType<typeof runQuery>;
  visual: AnalysisQuery["visual"];
}) {
  if (!rows.length) return <p>No matching measurements.</p>;
  if (visual === "number")
    return rows.map((r) => (
      <p className="stat" key={r.label}>
        {r.label}
        <strong>{number(r.value)}</strong>
      </p>
    ));
  if (visual === "table")
    return (
      <div className="table-wrap">
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
      </div>
    );
  return <Chart data={rows} bar={visual === "bar"} />;
}
