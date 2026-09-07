"use client";
export function HistoryMore({
  status,
  loadMore,
  label = "Load more",
}: {
  status: string;
  loadMore: (count: number) => void;
  label?: string;
}) {
  return status === "CanLoadMore" ? (
    <button type="button" className="secondary" onClick={() => loadMore(50)}>
      {label}
    </button>
  ) : ["LoadingFirstPage", "LoadingMore"].includes(status) ? (
    <p role="status">Loading…</p>
  ) : null;
}
