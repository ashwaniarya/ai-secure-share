import { useEffect, useState } from "react";
import { getStats } from "../api/client";

const POLL_INTERVAL_MS = 30_000;
// A tiny count is anti-social-proof; stay hidden until it looks alive.
const MIN_VISIBLE_COUNT = 10;

/** Social-proof line under the hero subtitle; hides itself on failure. */
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

  return (
    <p className="hero-proof">
      {count !== null && count >= MIN_VISIBLE_COUNT
        ? `${count.toLocaleString()} links created so far`
        : null}
    </p>
  );
}
