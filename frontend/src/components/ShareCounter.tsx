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
        .catch(() => {});
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

  if (count === null || count < MIN_VISIBLE_COUNT) return null;

  return (
    <div className="rail-item">
      shared
      <span className="rail-value">{count.toLocaleString()}</span>
    </div>
  );
}
