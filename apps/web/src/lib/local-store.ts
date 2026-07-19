/**
 * Minimal SSR-safe localStorage JSON helpers. This is the only place that
 * touches `window.localStorage` directly — history-store.ts and
 * settings-store.ts build their repository shape on top of this so a future
 * swap to real API calls (Phase 7) only touches those two files.
 */
export function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, quota exceeded) — the UI
    // keeps working from in-memory state, it just won't survive a reload.
  }
}
