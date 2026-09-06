"use client";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
export function ExportJob({ job }: { job: Doc<"lifecycleJobs"> }) {
  const [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState("");
  const multipart = (job.partCount ?? 1) > 1,
    parts = useQuery(
      api.exports.list,
      job.status === "complete" && multipart ? { id: job._id, cursor } : "skip",
    );
  const download = useAction(api.lifecycleActions.download),
    part = useAction(api.exportActions.downloadPart),
    retry = useMutation(api.exports.retry);
  async function open(index?: number) {
    try {
      window.location.assign(
        await (index === undefined
          ? download({ id: job._id })
          : part({ id: job._id, index })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download unavailable.");
    }
  }
  return (
    <div className="section">
      <p>
        Export: {job.status}
        {job.partCount ? ` · ${job.partCount} completed parts` : ""}
      </p>
      {job.status === "complete" && (
        <>
          <button className="secondary" onClick={() => void open()}>
            {multipart ? "Download manifest" : "Download ZIP"}
          </button>
          {multipart && (
            <p>
              Download every part and extract them together. Downloads expire
              seven days after the request.
            </p>
          )}
          {parts?.page.map((p) => (
            <button
              key={p._id}
              className="secondary"
              onClick={() => void open(p.index)}
            >
              Download part {p.index + 1}
            </button>
          ))}
          {parts && !parts.isDone && (
            <button
              className="secondary"
              onClick={() => setCursor(parts.continueCursor)}
            >
              Next parts
            </button>
          )}
          {cursor && (
            <button className="secondary" onClick={() => setCursor(null)}>
              First parts
            </button>
          )}
        </>
      )}
      {job.status === "failed" && (
        <button
          onClick={() =>
            void retry({ id: job._id }).catch((e) =>
              setError(e instanceof Error ? e.message : "Retry unavailable."),
            )
          }
        >
          Resume export
        </button>
      )}
      {(error || job.error) && <p role="alert">{error || job.error}</p>}
    </div>
  );
}
