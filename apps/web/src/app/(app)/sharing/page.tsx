"use client";
import { useWorkspaceCollection } from "@/components/workspace-collection";
import { HistoryMore } from "@/components/history-more";
import { dateBounds, calendarDate } from "@core/calendar";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { useState, useEffect } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SharedView } from "@/components/shared-view";
export default function Sharing() {
  const [linkedId, setLinkedId] = useState<string | null>(null);
  useEffect(
    () =>
      setLinkedId(new URLSearchParams(window.location.search).get("activity")),
    [],
  );
  const linked = useQuery(
    api.activities.selection,
    linkedId ? { id: linkedId } : "skip",
  );
  const shares = useWorkspaceCollection("shares"),
    history = usePaginatedQuery(
      api.activities.browse,
      { view: "picker" },
      { initialNumItems: 50 },
    ),
    activities = history.results,
    profile = useQuery(api.athletes.current),
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
                throw new Error(
                  "Select at least one activity and public field",
                );
              setDraft({
                kind: String(f.get("kind")),
                activityIds: f.getAll("activities") as Id<"activities">[],
                fields: f.getAll("fields").map(String),
                expires: f.get("expiry")
                  ? dateBounds(
                      String(f.get("expiry")),
                      String(f.get("expiry")),
                      profile?.timezone ?? "UTC",
                    ).to
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
            {linkedId && linked === null && (
              <p role="alert">The linked activity is unavailable.</p>
            )}
            {linked && !activities.some((a) => a._id === linked._id) && (
              <label className="check">
                <input
                  type="checkbox"
                  name="activities"
                  value={linked._id}
                  defaultChecked
                />
                {linked.title}
              </label>
            )}
            {activities?.map((a) => (
              <label className="check" key={a._id}>
                <input
                  key={`${a._id}-${linkedId ?? ""}`}
                  type="checkbox"
                  name="activities"
                  value={a._id}
                  defaultChecked={a._id === linkedId}
                />
                {a.title}
              </label>
            ))}
          </fieldset>
          <HistoryMore {...history} label="Load earlier activities" />
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
        <HistoryMore {...shares} label="Earlier share links" />
        {shares.results.map((s) => (
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
