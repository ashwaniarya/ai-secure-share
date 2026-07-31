import { useEffect, useState } from "react";
import { getStats } from "../api/client";

const POLL_INTERVAL_MS = 30_000;
// A tiny count is anti-social-proof; stay hidden until it looks alive.
const MIN_VISIBLE_COUNT = 10;

/** Live share count, rendered as a rail entry. Hides itself on failure. */
export default function ShareCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    function load() {
      getStats()
        .then((stats) => {
          if (active) setCount(stats.share_count);
        })
        .catch((error) => {
          // The counter hides itself on failure, so without this an outage is
          // indistinguishable from a genuinely small count.
          console.error("[ShareCounter] stats request failed", error);
        });
    }

    load();
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // The declared type is a compile-time claim about an untrusted payload: a
  // missing or renamed share_count arrives as undefined, which slips past both
  // a null check and a `< MIN` comparison and would crash the render.
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  if (count < MIN_VISIBLE_COUNT) return null;

  return (
    <div className="rail-item">
      shared
      <span className="rail-value">{count.toLocaleString()}</span>
    </div>
  );
}
