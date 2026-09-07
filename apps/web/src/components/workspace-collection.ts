"use client";
import { usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
type Collection =
  | "plans"
  | "goals"
  | "gear"
  | "analyses"
  | "privacyZones"
  | "shares"
  | "lifecycleJobs"
  | "messages";
export function useWorkspaceCollection<T extends Collection>(table: T) {
  const page = usePaginatedQuery(
    api.workspace.page,
    { table },
    { initialNumItems: 50 },
  );
  // workspace.page returns only the requested table; its generated union loses that relationship.
  return { ...page, results: page.results as unknown as Doc<T>[] };
}
