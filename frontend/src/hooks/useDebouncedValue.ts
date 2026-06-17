import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after `delayMs` of quiet.
 *
 * Each change restarts the timer, so a burst of rapid updates collapses into a
 * single trailing update. Used to throttle expensive work (e.g. rendering a
 * mermaid diagram) against fast-changing input like a live-typed textarea.
 */
export default function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
