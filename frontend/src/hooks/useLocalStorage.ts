import { useState } from "react";

/**
 * useState persisted to localStorage as JSON.
 *
 * Reads the stored value lazily on mount (fallback on missing or malformed
 * JSON); the setter writes through to storage. Storage failures (quota,
 * privacy mode) are swallowed so the UI keeps working with in-memory state.
 */
export default function useLocalStorage<T>(
  key: string,
  fallback: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });

  // Like useState's setter, accepts a functional update so burst updates
  // within one task never compute from a stale render's value.
  function setAndPersist(next: T | ((previous: T) => T)) {
    setValue((previous) => {
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(previous) : next;
      try {
        localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // storage unavailable — keep in-memory state only
      }
      return resolved;
    });
  }

  return [value, setAndPersist];
}
