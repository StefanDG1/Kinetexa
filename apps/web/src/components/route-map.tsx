"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
type Route = {
  id: string;
  title: string;
  points: number[][];
  segments?: number[][][];
};
export default function RouteMap({
  routes,
  cursor,
  onSelect,
  onPointSelect,
  large = false,
}: {
  routes: Route[];
  cursor?: number[];
  onSelect?: (id: string) => void;
  onPointSelect?: (point: number[]) => void;
  large?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    marker = useRef<maplibregl.Marker | null>(null),
    [error, setError] = useState("");
  const selectRef = useRef(onSelect),
    pointRef = useRef(onPointSelect);
  useEffect(() => {
    selectRef.current = onSelect;
    pointRef.current = onPointSelect;
  }, [onSelect, onPointSelect]);
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style:
        process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
        "https://tiles.openfreemap.org/styles/liberty",
      center: [10, 48],
      zoom: 3,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.on("error", () =>
      setError(
        "The background map is unavailable. Your activity data is still available below.",
      ),
    );
    m.on("load", () => {
      m.addSource("routes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: routes
            .filter((r) => r.points.length > 1)
            .map((r) => ({
              type: "Feature",
              properties: { id: r.id, title: r.title },
              geometry: {
                type: "MultiLineString",
                coordinates: r.segments ?? [r.points],
              },
            })),
        },
      });
      m.addLayer({
        id: "route-glow",
        type: "line",
        source: "routes",
        paint: {
          "line-color": "#147d92",
          "line-width": 7,
          "line-opacity": 0.15,
        },
      });
      m.addLayer({
        id: "route-lines",
        type: "line",
        source: "routes",
        paint: {
          "line-color": routes.length === 1 ? "#bd3e1d" : "#147d92",
          "line-width": routes.length === 1 ? 3 : 2,
          "line-opacity": routes.length === 1 ? 1 : 0.45,
        },
      });
      const points = routes.flatMap((r) => r.points);
      if (points.length) {
        const bounds = new maplibregl.LngLatBounds();
        for (const p of points) bounds.extend([p[0], p[1]]);
        m.fitBounds(bounds, { padding: 35, maxZoom: 15, duration: 0 });
      }
      m.on("click", "route-lines", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) selectRef.current?.(String(id));
        pointRef.current?.([e.lngLat.lng, e.lngLat.lat]);
      });
    });
    return () => {
      marker.current?.remove();
      marker.current = null;
      m.remove();
      map.current = null;
    };
  }, [routes]);
  useEffect(() => {
    if (!map.current || !cursor) return;
    if (!marker.current)
      marker.current = new maplibregl.Marker({ color: "#16384b" })
        .setLngLat([cursor[0], cursor[1]])
        .addTo(map.current);
    else marker.current.setLngLat([cursor[0], cursor[1]]);
  }, [cursor]);
  return (
    <>
      {error && (
        <p role="status" className="muted">
          {error}
        </p>
      )}
      <div
        ref={container}
        className={`map ${large ? "large" : ""}`}
        role="region"
        aria-label="Interactive training route map"
      />
    </>
  );
}
