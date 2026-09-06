"use client";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
export default function ImportPage() {
  const prepare = useAction(api.processing.prepare),
    enqueue = useMutation(api.imports.enqueue),
    download = useAction(api.processing.original),
    jobs = useQuery(api.imports.list),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const [i, f] of Array.from(files).entries()) {
        setProgress(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
        const { id, url } = await prepare({ name: f.name, bytes: f.size });
        const res = await fetch(url, {
          method: "PUT",
          body: f,
          headers: { "Content-Type": "application/octet-stream" },
        });
        if (!res.ok)
          throw new Error("Upload failed. Check your connection and retry.");
        await enqueue({ id: id as Id<"sources"> });
      }
      setProgress(
        "Uploads received. Processing continues if you close this page.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Bring your training home.</h1>
      <p>
        Upload your original workouts or migrate your Strava export. Your files
        stay private and are preserved unchanged.
      </p>
      <div className="upload-drop">
        <label>
          Activity files or Strava archive
          <input
            type="file"
            accept=".fit,.tcx,.gpx,.zip"
            multiple
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
        <p className="muted">
          FIT, TCX and GPX up to 32 MiB each. ZIP up to 128 MiB. Split larger
          archives before upload.
        </p>
      </div>
      {progress && <p role="status">{progress}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <details className="section">
        <summary>How to migrate from Strava</summary>
        <p>
          Request your data archive in Strava account settings. Download the
          archive, then upload the ZIP here. Direct Strava API access is not
          required. Garmin connection is pending approval; exported Garmin
          activity files work here.
        </p>
      </details>
      <section className="section">
        <h2>Import history</h2>
        <div className="progress-list">
          {jobs?.map((j) => (
            <div className="job" key={j._id}>
              <div>
                <strong>{j.name}</strong>
                <p className="muted">
                  {(j.bytes / 1024).toFixed(0)} KiB · Attempt {j.attempts}
                </p>
                {j.error && <p>{j.error}</p>}
                {j.childIds && (
                  <p>
                    {j.completedChildren ?? 0} of {j.childIds.length} files
                    ready · {j.failedChildren ?? 0} failed. Review individual
                    files below.
                  </p>
                )}
                {j.activityId && (
                  <Link href={`/activities/${j.activityId}`}>
                    Open activity
                  </Link>
                )}
              </div>
              <div>
                <p className="status">{j.status.replaceAll("-", " ")}</p>
                {j.status === "failed" && (
                  <button
                    className="secondary"
                    onClick={() => void enqueue({ id: j._id })}
                  >
                    Retry
                  </button>
                )}
                {j.status !== "awaiting-upload" && (
                  <button
                    className="quiet"
                    onClick={async () => {
                      try {
                        window.location.assign(await download({ id: j._id }));
                      } catch {
                        setError("Original is temporarily unavailable.");
                      }
                    }}
                  >
                    Original file
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {jobs?.length === 0 && <p className="muted">No imports yet.</p>}
      </section>
    </>
  );
}
