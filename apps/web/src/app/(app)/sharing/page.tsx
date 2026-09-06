"use client";
import { useActivityHistory } from "@/components/activity-history";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SharedView } from "@/components/shared-view";
export default function Sharing() {
  const data = useQuery(api.workspace.overview),
    activities = useActivityHistory({}),
    create = useMutation(api.sharing.create),
    revoke = useMutation(api.sharing.revoke),
    [message, setMessage] = useState("");
  const [draft, setDraft] = useState<{
    kind: string;
    activityIds: Id<"activities">[];
    fields: string[];
    expires?: number;
  } | null>(null);
  const preview = useQuery(
    api.sharing.preview,
    draft
      ? {
          kind: draft.kind,
          activityIds: draft.activityIds,
          fields: draft.fields,
        }
      : "skip",
  );
  return (
    <>
      <h1>Share only what you choose.</h1>
      <p>
        Public links can be opened by anyone who has the link. Health data,
        notes, source files and exact private routes are excluded.
      </p>
      <section className="surface section">
        <form
          onChange={() => setDraft(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              if (!f.getAll("activities").length || !f.getAll("fields").length)
                throw new Error("Select fields");
              setDraft({
                kind: String(f.get("kind")),
                activityIds: f.getAll("activities") as Id<"activities">[],
                fields: f.getAll("fields").map(String),
                expires: f.get("expiry")
                  ? Date.parse(String(f.get("expiry"))) + 86399999
                  : undefined,
              });
              setMessage(
                "Preview the exact public fields below, then publish your link.",
              );
            } catch {
              setMessage("Check the selected activities and fields.");
            }
          }}
        >
          <label>
            Share type
            <select name="kind">
              <option value="activity">Activity</option>
              <option value="dashboard">Selected dashboard activities</option>
              <option value="statistics">Selected statistics</option>
              <option value="map">Map view</option>
            </select>
          </label>
          <fieldset>
            <legend>Activities to include</legend>
            {activities?.map((a) => (
              <label className="check" key={a._id}>
                <input type="checkbox" name="activities" value={a._id} />
                {a.title}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>These fields will be public</legend>
            {[
              ["title", "Activity title"],
              ["sport", "Sport"],
              ["date", "Date, without time"],
              ["distance", "Distance"],
              ["duration", "Duration"],
              ["elevation", "Elevation gain"],
              ["route", "Masked route with trimmed endpoints"],
            ].map(([k, l]) => (
              <label className="check" key={k}>
                <input type="checkbox" name="fields" value={k} />
                {l}
              </label>
            ))}
          </fieldset>
          <label>
            Optional expiry
            <input type="date" name="expiry" />
          </label>
          <button>Preview selected fields</button>
        </form>
      </section>
      {draft && preview && (
        <section className="surface section">
          <p className="privacy-note">
            Private preview. This link has not been published.
          </p>
          <SharedView data={preview} embedded />
          <button
            onClick={async () => {
              try {
                const bytes = crypto.getRandomValues(new Uint8Array(32)),
                  token = Array.from(bytes, (x) =>
                    x.toString(16).padStart(2, "0"),
                  ).join("");
                await create({ ...draft, token });
                setDraft(null);
                setMessage(`${location.origin}/share/${token}`);
              } catch {
                setMessage(
                  "The link could not be created. Check the expiry and try again.",
                );
              }
            }}
          >
            Publish this public link
          </button>
        </section>
      )}
      {message && (
        <p role="status" className="privacy-note">
          {message.startsWith("http") ? (
            <a href={message}>{message}</a>
          ) : (
            message
          )}
        </p>
      )}
      <section className="section">
        <h2>Your links</h2>
        {data?.shares.map((s) => (
          <div className="job" key={s._id}>
            <div>
              <a href={`/share/${s.token}`}>{s.kind} share</a>
              <p>{s.fields.join(", ")}</p>
              <p>
                {s.revoked
                  ? "Revoked"
                  : s.expires && s.expires < Date.now()
                    ? "Expired"
                    : "Active"}
              </p>
            </div>
            {!s.revoked && (
              <button
                className="secondary"
                onClick={() => void revoke({ id: s._id })}
              >
                Revoke link
              </button>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
