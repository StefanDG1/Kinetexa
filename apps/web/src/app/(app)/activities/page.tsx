"use client";
import { HistoryMore } from "@/components/history-more";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { ActivityList, Empty } from "@/components/data-ui";
export default function ActivitiesPage() {
  const [sport, setSport] = useState(""),
    [search, setSearch] = useState("");
  const history = usePaginatedQuery(
      api.activities.browse,
      { sport: sport || undefined, search, view: "list" },
      { initialNumItems: 50 },
    ),
    items = history.results;
  return (
    <>
      <h1>Your activities</h1>
      <div className="toolbar">
        <label>
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Activity title or tag"
          />
        </label>
        <label>
          Sport
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">All sports</option>
            {["running", "cycling", "swimming", "walking", "other"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        History loads in pages. Continue loading to search earlier recordings.
      </p>
      <HistoryMore {...history} label="Load earlier activities" />
      {!items ? (
        <p>Loading activities…</p>
      ) : items.length ? (
        <ActivityList
          items={items.filter((a) =>
            `${a.title} ${a.tags.join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
        />
      ) : (
        <Empty />
      )}
    </>
  );
}
