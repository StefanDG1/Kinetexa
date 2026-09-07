"use client";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function DeleteItem({
  id,
  label,
  onDeleted,
}: {
  id: Id<"goals"> | Id<"plans"> | Id<"analyses"> | Id<"privacyZones">;
  label: string;
  onDeleted?: () => void;
}) {
  const remove = useMutation(api.workspace.remove);
  const [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span>
      {!confirming ? (
        <button
          type="button"
          className="quiet"
          onClick={() => setConfirming(true)}
        >
          Delete {label}
        </button>
      ) : (
        <>
          <span>Delete {label}? This cannot be undone. </span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await remove({ id });
                onDeleted?.();
                setConfirming(false);
              } catch {
                setError("Could not delete this item. Please retry.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Confirm deletion"}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Keep {label}
          </button>
        </>
      )}
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
