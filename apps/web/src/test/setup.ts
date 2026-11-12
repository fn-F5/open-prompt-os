import "@testing-library/jest-dom/vitest";

// Default VITE_API_URL to empty in component unit tests so offline synthesizer is tested unless explicitly stubbed
if (typeof import.meta.env === "object") {
  import.meta.env.VITE_API_URL = "";
}

// Ensure standard Web Storage API methods exist in Node 26 + jsdom test environment
if (typeof window !== "undefined" && typeof window.localStorage?.clear !== "function") {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
}
