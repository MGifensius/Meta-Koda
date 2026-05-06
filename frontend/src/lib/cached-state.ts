// Tiny SWR-style helpers — read/write JSON snapshots to localStorage so
// list views (inbox, dashboard, floor) hydrate instantly with the last
// known data on mount, while a background fetch refreshes them.
//
// Keep keys tenant-scoped so that switching accounts doesn't show the
// previous user's data; clearing on signOut can be added later if the
// data ever becomes sensitive enough to warrant it.

const PREFIX = "mk_cache:";

export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; ts: number } | null;
    return parsed?.data ?? null;
  } catch {
    // Corrupt entry, storage disabled — silent fail keeps the UI working.
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {
    // Quota exceeded or storage disabled — silent fail.
  }
}
