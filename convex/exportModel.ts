import { v } from "convex/values";
export const exportPosition = v.object({
  table: v.number(),
  cursor: v.union(v.string(), v.null()),
  page: v.number(),
});
export const EXPORT_RETENTION_MS = 7 * 86400000;
