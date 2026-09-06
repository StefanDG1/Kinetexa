"use client";
import Link from "next/link";
import type { Evidence } from "@core/ai";
import { number, Chart } from "./data-ui";
export function AiEvidence({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  const notices = [...new Set(evidence.flatMap((e) => e.caveats ?? []))];
  return (
    <div className="ai-evidence">
      {notices.length > 0 && (
        <ul>
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <details open>
        <summary>Measurements and sources</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Measurement</th>
                <th>Recorded value</th>
                <th>Period</th>
                <th>Comparison</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.id}>
                  <th scope="row">{e.label}</th>
                  <td>
                    {e.value === null
                      ? "Unavailable"
                      : `${number(e.value)} ${e.unit}`}
                  </td>
                  <td>
                    {e.from} – {e.to}
                  </td>
                  <td>
                    {e.comparison ? (
                      <>
                        {e.comparison.value === null
                          ? "Unavailable"
                          : `${number(e.comparison.value)} ${e.unit}`}
                        <br />
                        {e.comparison.from} – {e.comparison.to}
                        {e.comparison.percent !== null && (
                          <>
                            <br />
                            {e.comparison.percent > 0 ? "+" : ""}
                            {number(e.comparison.percent)}%
                          </>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {evidence.map((e) => (
          <details key={e.id}>
            <summary>{e.label}: calculation and sources</summary>
            {e.method && (
              <p>
                {e.method.definition}. {e.method.formula} Version{" "}
                {e.method.version}.
              </p>
            )}
            {e.series && e.series.length > 0 && (
              <Chart
                data={e.series.map((p) => ({ label: p.date, value: p.value }))}
                keys={["value"]}
              />
            )}
            <p>
              {e.sourceCount ?? e.activityIds.length} contributing activities
              {e.sourcesComplete === false
                ? "; direct links below are a sample"
                : ""}
              .
            </p>
            <div className="toolbar">
              {e.activityIds.map((id, i) => (
                <Link key={id} href={`/activities/${id}`}>
                  Activity {i + 1}
                </Link>
              ))}
            </div>
            {e.query && (
              <p>
                <Link
                  href={`/analysis?query=${encodeURIComponent(JSON.stringify(e.query))}`}
                >
                  Open the source query
                </Link>
              </p>
            )}
            {e.comparisonQuery && (
              <p>
                <Link
                  href={`/analysis?query=${encodeURIComponent(JSON.stringify(e.comparisonQuery))}`}
                >
                  Open comparison-period sources
                </Link>
              </p>
            )}
            {e.comparisonActivityIds?.map((id) => (
              <p key={id}>
                <Link href={`/activities/${id}`}>Comparison activity</Link>
              </p>
            ))}
            {e.link &&
              /^\/(activities\/|analysis|health|goals|gear|maps|records)/.test(
                e.link,
              ) && (
                <p>
                  <Link href={e.link}>Open related view</Link>
                </p>
              )}
          </details>
        ))}
      </details>
    </div>
  );
}
