const memoryFallback = new Map<string, string>();
let storageDegraded = false;
const degradedListeners = new Set<(degraded: boolean) => void>();

function setStorageDegraded(value: boolean) {
  if (storageDegraded !== value) {
    storageDegraded = value;
    for (const listener of degradedListeners) {
      listener(storageDegraded);
    }
  }
}

export function isStorageDegraded(): boolean {
  return storageDegraded;
}

export function onStorageDegradedChange(listener: (degraded: boolean) => void): () => void {
  degradedListeners.add(listener);
  return () => {
    degradedListeners.delete(listener);
  };
}

export function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") {
    return memoryFallback.get(key) ?? null;
  }
  try {
    if (typeof window.localStorage?.getItem === "function") {
      const val = window.localStorage.getItem(key);
      return val ?? memoryFallback.get(key) ?? null;
    }
    return memoryFallback.get(key) ?? null;
  } catch {
    setStorageDegraded(true);
    return memoryFallback.get(key) ?? null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  memoryFallback.set(key, value);
  if (typeof window === "undefined") {
    return false;
  }
  try {
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(key, value);
    }
    return true;
  } catch {
    setStorageDegraded(true);
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  memoryFallback.delete(key);
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (typeof window.localStorage?.removeItem === "function") {
      window.localStorage.removeItem(key);
    }
  } catch {
    setStorageDegraded(true);
  }
}

export function clearStorageForTest(): void {
  memoryFallback.clear();
  storageDegraded = false;
  if (typeof window !== "undefined" && typeof window.localStorage?.clear === "function") {
    window.localStorage.clear();
  }
}
