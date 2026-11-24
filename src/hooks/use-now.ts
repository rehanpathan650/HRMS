"use client";

import { useEffect, useState } from "react";

/** Re-renders every `intervalMs` with the current time. Pauses while the tab is hidden. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => id && clearInterval(id);
    const onVis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
  return now;
}
