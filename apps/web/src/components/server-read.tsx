"use client";
import { useAction } from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { useEffect, useRef, useState } from "react";

// Fetch on input change or explicit refresh. Reuse a pending read during React's effect replay.
export function useServerRead<T extends FunctionReference<"action">>(
  reference: T,
  args: FunctionArgs<T> | "skip",
) {
  const action = useAction(reference),
    serialized = JSON.stringify(args);
  const [revision, setRevision] = useState(0);
  const key = `${revision}:${serialized}`;
  const pending = useRef<{
    key: string;
    promise: Promise<FunctionReturnType<T>>;
  } | null>(null);
  const [result, setResult] = useState<{
    key: string;
    data?: FunctionReturnType<T>;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (serialized === '"skip"') return;
    let active = true;
    if (pending.current?.key !== key)
      pending.current = { key, promise: action(JSON.parse(serialized)) };
    pending.current.promise.then(
      (data) => {
        if (active) setResult({ key, data });
      },
      (e) => {
        if (active)
          setResult({
            key,
            error:
              e instanceof Error ? e.message : "Could not load this result.",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [action, serialized, key]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: args !== "skip" && result?.key !== key,
    refresh: () => setRevision((r) => r + 1),
  };
}
