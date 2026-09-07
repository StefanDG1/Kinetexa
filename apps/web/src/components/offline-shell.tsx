"use client";
import { useEffect } from "react";

export function OfflineShell() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => console.warn("Kinetexa offline fallback is unavailable."));
  }, []);
  return null;
}
