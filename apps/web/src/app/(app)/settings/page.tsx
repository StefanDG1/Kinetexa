"use client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { DashboardSettings } from "@/components/dashboard-settings";
import { ExportJob } from "@/components/export-job";
export default function Settings() {
  const profile = useQuery(api.athletes.current),
    data = useQuery(api.workspace.overview),
    update = useMutation(api.athletes.updateProfile),
    settings = useMutation(api.workspace.settings),
    zone = useMutation(api.workspace.saveZone),
    exportData = useMutation(api.lifecycle.requestExport),
    deleteData = useMutation(api.lifecycle.requestDeletion),
    [message, setMessage] = useState("");
  if (!profile) return <p>Loading settings…</p>;
  async function attempt(fn: () => Promise<unknown>) {
    try {
      await fn();
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save. Try again.");
    }
  }
  return (
    <>
      <h1>Make Kinetexa yours.</h1>
      <DashboardSettings />
      {message && (
        <p role="status" className="privacy-note">
          {message}
        </p>
      )}
      <section className="surface section">
        <h2>Profile and consent</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void attempt(() =>
              update({
                displayName: String(f.get("name")),
                timezone: String(f.get("timezone")),
                units: String(f.get("units")) as "metric" | "imperial",
                aiConsent: f.get("ai") === "on",
                analyticsConsent: f.get("analytics") === "on",
              }),
            );
          }}
        >
          <div className="form-columns">
            <label>
              Name
              <input
                name="name"
                defaultValue={profile.displayName}
                required
                maxLength={80}
              />
            </label>
            <label>
              Time zone
              <input name="timezone" defaultValue={profile.timezone} required />
            </label>
            <label>
              Units
              <select name="units" defaultValue={profile.units}>
                <option value="metric">Metric</option>
              </select>
            </label>
          </div>
          <label className="check">
            <input
              name="ai"
              type="checkbox"
              defaultChecked={profile.aiConsent}
            />{" "}
            Allow optional AI processing of relevant fitness summaries. Turning
            this off stops new AI requests.
          </label>
          <label className="check">
            <input
              name="analytics"
              type="checkbox"
              defaultChecked={profile.analyticsConsent}
            />{" "}
            Allow privacy-preserving product usage events.
          </label>
          <p>
            Your profile, activities, maps and recovery data are private.
            Sharing requires explicit selected fields.
          </p>
          <button>Save profile and consent</button>
        </form>
      </section>
      <section className="surface section">
        <h2>Your training thresholds</h2>
        <p>
          Use thresholds you know. Kinetexa leaves threshold-dependent metrics
          unavailable until you configure them.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              thresholds: Record<string, unknown> = {};
            for (const k of ["restHr", "maxHr", "ftp", "thresholdSpeed"])
              if (f.get(k)) thresholds[k] = Number(f.get(k));
            for (const k of ["hrZones", "powerZones", "paceZones"])
              if (f.get(k))
                thresholds[k] = String(f.get(k)).split(",").map(Number);
            void attempt(() =>
              settings({
                thresholds,
                dashboard: profile!.dashboard ?? [],
                hiddenWidgets: profile!.hiddenWidgets ?? [],
                insightConsent: f.get("insights") === "on",
              }),
            );
          }}
        >
          <div className="form-columns">
            {[
              ["restHr", "Resting heart rate · bpm"],
              ["maxHr", "Maximum heart rate · bpm"],
              ["ftp", "Cycling FTP · watts"],
              ["thresholdSpeed", "Threshold running speed · m/s"],
            ].map(([k, l]) => (
              <label key={k}>
                {l}
                <input
                  name={k}
                  type="number"
                  step="any"
                  defaultValue={profile.thresholds?.[k] ?? ""}
                />
              </label>
            ))}
            {[
              ["hrZones", "Heart-rate zone boundaries · bpm"],
              ["powerZones", "Power zone boundaries · watts"],
              ["paceZones", "Pace-zone speed boundaries · m/s"],
            ].map(([k, l]) => (
              <label key={k}>
                {l}
                <input
                  name={k}
                  placeholder="Increasing values, separated by commas"
                  defaultValue={profile.thresholds?.[k]?.join(", ") ?? ""}
                />
              </label>
            ))}
          </div>
          <label className="check">
            <input
              name="insights"
              type="checkbox"
              defaultChecked={profile.insightConsent}
            />{" "}
            Allow automatic AI insight cards when AI consent is enabled
          </label>
          <button>Save thresholds</button>
        </form>
      </section>
      <section className="surface section">
        <h2>Privacy zones</h2>
        <p>
          Public routes hide these areas, add a safety buffer and trim their
          endpoints. Your private map keeps the original recording.
        </p>
        {data?.privacyZones.map((z) => (
          <p key={z._id}>
            {z.name} · {z.radius} m radius
          </p>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void attempt(() =>
              zone({
                name: String(f.get("name")),
                lat: Number(f.get("lat")),
                lon: Number(f.get("lon")),
                radius: Number(f.get("radius")),
              }),
            );
          }}
        >
          <label>
            Zone name
            <input name="name" required placeholder="Home" />
          </label>
          <div className="form-columns">
            <label>
              Latitude
              <input
                name="lat"
                type="number"
                step="any"
                min="-90"
                max="90"
                required
              />
            </label>
            <label>
              Longitude
              <input
                name="lon"
                type="number"
                step="any"
                min="-180"
                max="180"
                required
              />
            </label>
            <label>
              Radius · metres
              <input
                name="radius"
                type="number"
                min="100"
                max="10000"
                defaultValue="500"
                required
              />
            </label>
          </div>
          <button>Add privacy zone</button>
        </form>
        <p>
          <Link href="/sharing">Manage public links</Link>
        </p>
      </section>
      <section className="surface section">
        <h2>Connected sources</h2>
        <p>
          Garmin: pending developer approval. Historical and new-activity
          synchronization are unavailable until access is approved.
        </p>
        <p>
          Strava direct connection: unavailable pending permitted-use review.
          Your own Strava export can be imported now.
        </p>
        <Link href="/import">Import files or an archive</Link>
      </section>
      <section className="surface section">
        <h2>Export your data</h2>
        <p>
          Export your canonical data, settings, goals, gear, analyses and
          original files. Large exports contain several ZIP parts. Processing
          continues after you leave; completed downloads remain available for
          seven days. Avoid importing or editing during export if you need a
          stable copy.
        </p>
        <button onClick={() => void attempt(() => exportData({}))}>
          Request full export
        </button>
        {data?.jobs
          .filter((j) => j.kind === "export")
          .map((j) => (
            <ExportJob key={j._id} job={j} />
          ))}
      </section>
      <section className="surface section">
        <h2>Delete account and data</h2>
        <p>
          This locks your account immediately. After 15 minutes, Kinetexa
          removes application records, original files, AI conversations and
          public links, cancels any active subscription and deletes your login.
          Payment records Stripe must retain are handled separately. This
          request cannot be undone in the app.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const confirmation = String(
              new FormData(e.currentTarget).get("confirmation"),
            );
            try {
              await deleteData({ confirmation });
              window.location.assign("/sign-out");
            } catch {
              setMessage(
                "Deletion could not be requested. Check the confirmation text.",
              );
            }
          }}
        >
          <label>
            Type DELETE MY ACCOUNT
            <input name="confirmation" required autoComplete="off" />
          </label>
          <button>Delete my account</button>
        </form>
      </section>
      <p>
        Support and privacy:{" "}
        <a href="mailto:contact@exponentialeducation.ro">
          contact@exponentialeducation.ro
        </a>
      </p>
    </>
  );
}
