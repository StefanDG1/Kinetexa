export function MetricExplanation({
  metric,
}: {
  metric: {
    definition: string;
    formula: string;
    version: string;
    inputs: Record<string, unknown>;
    caveat?: string;
  };
}) {
  return (
    <details>
      <summary>{metric.definition}</summary>
      <p>{metric.formula}</p>
      <dl>
        {Object.entries(metric.inputs).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              {value === null
                ? "Unavailable"
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p>{metric.caveat}</p>
      <p>Calculation version {metric.version}</p>
    </details>
  );
}
