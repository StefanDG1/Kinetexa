"use client";
import Link from "next/link";
import {
  useAction,
  useQuery,
  usePaginatedQuery,
  useMutation,
} from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AiEvidence } from "@/components/ai-evidence";
export default function Ask() {
  const profile = useQuery(api.athletes.current),
    usage = useQuery(api.ai.usage),
    messages = usePaginatedQuery(api.ai.messages, {}, { initialNumItems: 20 }),
    ask = useAction(api.aiActions.ask),
    feedback = useMutation(api.ai.feedback);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <h1>Ask Kinetexa</h1>
      <p>
        Explore your training through recorded evidence. Compare periods,
        inspect a workout or follow up on a previous question.
      </p>
      {!profile?.aiConsent ? (
        <div className="empty">
          <h2>AI is off</h2>
          <p>
            Your deterministic analytics work independently. Enable optional AI
            processing to ask questions.
          </p>
          <Link href="/settings">Review AI consent</Link>
        </div>
      ) : (
        <>
          {usage && (
            <p>
              {Math.max(0, usage.limit - usage.used)} of {usage.limit} requests
              available this month. Automatic insights share this allowance.
            </p>
          )}
          {messages.status === "CanLoadMore" && (
            <button className="secondary" onClick={() => messages.loadMore(20)}>
              Load earlier conversation
            </button>
          )}
          {messages.status === "LoadingMore" && (
            <p role="status">Loading earlier questions…</p>
          )}
          <div aria-live="polite">
            {[...messages.results].reverse().map((m) => (
              <article key={m._id} className={`message ${m.role}`}>
                <strong>{m.role === "user" ? "You" : "Kinetexa"}</strong>
                <p>{m.content}</p>
                <AiEvidence evidence={m.evidence ?? []} />
                {m.role === "assistant" &&
                  m.runId &&
                  m.evidence?.length > 0 && (
                    <div aria-label="Answer feedback">
                      {[true, false].map((helpful) => (
                        <button
                          key={String(helpful)}
                          type="button"
                          className="quiet"
                          aria-pressed={m.feedback?.helpful === helpful}
                          onClick={() =>
                            void feedback({
                              messageId: m._id,
                              helpful:
                                m.feedback?.helpful === helpful
                                  ? null
                                  : helpful,
                            }).catch(() =>
                              setError(
                                "Could not save your feedback. Please retry.",
                              ),
                            )
                          }
                        >
                          {helpful ? "Helpful" : "Not helpful"}
                        </button>
                      ))}
                    </div>
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
                const id = new URLSearchParams(window.location.search).get(
                  "activity",
                );
                await ask({
                  question,
                  activityId: id ? (id as Id<"activities">) : undefined,
                });
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
                placeholder="How did my training load change this month?"
              />
            </label>
            {busy && (
              <p role="status">
                Calculating and checking your training evidence…
              </p>
            )}
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
