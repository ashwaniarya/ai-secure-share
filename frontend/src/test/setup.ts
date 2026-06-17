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

// jsdom has no ResizeObserver, which react-zoom-pan-pinch (used by
// MermaidDiagram) instantiates on mount. A no-op shim is enough for tests; the
// guard keeps it inert wherever a real implementation exists.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverShim {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: ResizeObserverShim,
    configurable: true,
  });
}

// jsdom has no matchMedia; default to "motion allowed". Tests that exercise the
// reduced-motion path override window.matchMedia themselves.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

// jsdom does not expose WebCrypto's SubtleCrypto, but `src/lib/crypto.ts` uses
// `globalThis.crypto.subtle` for AES-GCM. Polyfill from Node's webcrypto when
// missing so the crypto suite (and any downstream code that encrypts) runs.
// The guard keeps this inert wherever a real `crypto.subtle` already exists.
if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
  // @ts-expect-error - "node:crypto" types need @types/node, which this
  // frontend does not depend on; the module exists at runtime under Node/vitest.
  const { webcrypto } = await import("node:crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}
