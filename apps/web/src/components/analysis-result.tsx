import { Chart, number } from "./data-ui";
import type { AnalysisQuery, runQuery } from "@core/query";
import Link from "next/link";
import { useState } from "react";

function Contributions({ row }: { row: ReturnType<typeof runQuery>[number] }) {
  const [limit, setLimit] = useState(20);
  return (
    <details>
      <summary>
        {row.measuredCount} measured / {row.count} activities
      </summary>
      <ul>
        {row.activityIds.slice(0, limit).map((id, i) => (
          <li key={id}>
            <Link href={`/activities/${id}`}>
              Contributing activity {i + 1}
            </Link>
          </li>
        ))}
      </ul>
      {limit < row.activityIds.length && (
        <button
          type="button"
          className="quiet"
          onClick={() => setLimit(limit + 20)}
        >
          Show more contributions
        </button>
      )}
    </details>
  );
}

export function AnalysisResult({
  rows: rawRows,
  visual,
  labels = {},
}: {
  rows: ReturnType<typeof runQuery>;
  visual: AnalysisQuery["visual"];
  labels?: Record<string, string>;
}) {
  const rows = rawRows.map((row) => ({
    ...row,
    groupKey: row.label,
    label: labels[row.label] ?? row.label,
  }));
  if (!rows.length) return <p>No matching measurements.</p>;
  if (visual === "number")
    return rows.map((r) => (
      <div className="stat" key={r.groupKey}>
        {r.label}
        <strong>{number(r.value)}</strong>
        <Contributions row={r} />
      </div>
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
              <tr key={r.groupKey}>
                <td>{r.label}</td>
                <td>{number(r.value)}</td>
                <td>
                  <Contributions row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <>
      <Chart data={rows} bar={visual === "bar"} />
      <details>
        <summary>Measurements and contributing activities</summary>
        {rows.map((row) => (
          <div key={row.groupKey}>
            <h3>{row.label}</h3>
            <Contributions row={row} />
          </div>
        ))}
      </details>
    </>
  );
}
