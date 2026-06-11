import "@testing-library/jest-dom";

// vitest 2.1 + Node 26: jsdom creates window.localStorage, but vitest's global
// population drops it, so tests see `localStorage` as undefined. Shim a
// spec-shaped in-memory Storage; the guard makes this inert once the
// toolchain exposes the real one.
if (typeof window !== "undefined" && !window.localStorage) {
  const backing = new Map<string, string>();
  const storageShim: Storage = {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => void backing.set(key, String(value)),
    removeItem: (key) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: storageShim,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: storageShim,
    configurable: true,
  });
}
