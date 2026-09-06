"use client";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
export default function Billing() {
  const billing = useQuery(api.billing.current),
    checkout = useAction(api.billingActions.checkout),
    portal = useAction(api.billingActions.portal),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function go(action: () => Promise<string>) {
    setBusy(true);
    try {
      window.location.assign(await action());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Billing is temporarily unavailable.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Your plan</h1>
      <p>
        Your core training analytics stay available on Free. Downgrading
        preserves your activity history.
      </p>
      <p>
        Current plan:{" "}
        <strong>
          {billing && ["active", "trialing"].includes(billing.status)
            ? "Premium"
            : "Free"}
        </strong>
        {billing && ` · ${billing.status}`}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="collection section">
        <article className="surface">
          <h2>Free</h2>
          <p className="stat">
            <strong>€0</strong>
          </p>
          <p>
            Core analytics, maps, goals, gear, imports and exports. 10 AI
            questions per month when you opt in.
          </p>
        </article>
        <article className="surface">
          <h2>Premium monthly</h2>
          <p className="stat">
            <strong>
              €35 <small>/ month</small>
            </strong>
          </p>
          <p>
            Higher managed AI allowance: 200 questions per month. Your training
            analytics stay open.
          </p>
          <button
            disabled={busy}
            onClick={() => void go(() => checkout({ interval: "monthly" }))}
          >
            Choose monthly
          </button>
        </article>
        <article className="surface">
          <h2>Premium annual</h2>
          <p className="stat">
            <strong>
              €180 <small>/ year</small>
            </strong>
          </p>
          <p>
            Charged upfront each year. Same Premium access, with a lower annual
            price.
          </p>
          <button
            disabled={busy}
            onClick={() => void go(() => checkout({ interval: "annual" }))}
          >
            Choose annual
          </button>
        </article>
      </div>
      {billing && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void go(() => portal({}))}
        >
          Manage payment and cancellation
        </button>
      )}
      <p className="muted">
        Automatic provider connections remain unavailable pending provider
        approval.
      </p>
    </>
  );
}
