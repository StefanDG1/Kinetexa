"use client";
import { createContext, useContext, useEffect, useMemo } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
const History = createContext<Doc<"activities">[] | null>(null);
export function ActivityHistory({ children }: { children: React.ReactNode }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.activities.page,
    {},
    { initialNumItems: 100 },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(100);
  }, [status, loadMore]);
  if (status !== "Exhausted")
    return (
      <section className="loading" role="status">
        <h2>Opening your training history</h2>
        <p>
          {results.length
            ? `${results.length.toLocaleString()} activities loaded. Preparing complete totals…`
            : "Loading your activities…"}
        </p>
      </section>
    );
  return <History.Provider value={results}>{children}</History.Provider>;
}
export function useActivityHistory(
  args: { from?: number; to?: number; sport?: string } = {},
) {
  const rows = useContext(History);
  if (!rows)
    throw new Error(
      "Activity history is unavailable outside the private workspace.",
    );
  return useMemo(
    () =>
      rows.filter(
        (a) =>
          (args.from === undefined || a.start >= args.from) &&
          (args.to === undefined || a.start <= args.to) &&
          (!args.sport || a.sport === args.sport),
      ),
    [rows, args.from, args.to, args.sport],
  );
}
