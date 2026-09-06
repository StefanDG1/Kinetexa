"use client";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { number } from "@/components/data-ui";
export default function Ask() {
  const p = useQuery(api.athletes.current),
    data = useQuery(api.workspace.overview),
    ask = useAction(api.aiActions.ask),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <h1>Ask Kinetexa</h1>
      <p>
        Explore your training through its recorded evidence. Exact routes and
        raw health records stay out of the model context.
      </p>
      {!p?.aiConsent ? (
        <div className="empty">
          <h2>AI is off</h2>
          <p>
            Enable optional AI processing in Settings to ask questions. Your
            deterministic analytics work without it.
          </p>
          <Link href="/settings">Review AI consent</Link>
        </div>
      ) : (
        <>
          <div>
            {data?.messages.map((m) => (
              <article key={m._id} className={`message ${m.role}`}>
                <strong>{m.role === "user" ? "You" : "Kinetexa"}</strong>
                <p>{m.content}</p>
                {m.evidence?.length > 0 && (
                  <details open>
                    <summary>Supporting evidence</summary>
                    <table>
                      <thead>
                        <tr>
                          <th>Measurement</th>
                          <th>Value</th>
                          <th>Period</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.evidence.map((e: any) => (
                          <tr key={e.id}>
                            <td>{e.label}</td>
                            <td>
                              {number(e.value)} {e.unit}
                            </td>
                            <td>
                              {e.from} to {e.to}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p>
                      {[
                        ...new Set<string>(
                          m.evidence.flatMap((e: any) => e.activityIds),
                        ),
                      ]
                        .slice(0, 20)
                        .map((id) => (
                          <Link key={id} href={`/activities/${id}`}>
                            Source activity{" "}
                          </Link>
                        ))}
                    </p>
                  </details>
                )}
              </article>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                question = String(new FormData(form).get("question"));
              setBusy(true);
              setError("");
              try {
                await ask({ question });
                form.reset();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not answer. Try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Your question
              <textarea
                name="question"
                required
                maxLength={1500}
                placeholder="How much did I train this month?"
              />
            </label>
            {busy && <p role="status">Reading your training evidence…</p>}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy}>Ask about my training</button>
          </form>
        </>
      )}
    </>
  );
}
