// The search results cache (docs/snack-list-plan.md addendum, 2026-11-14): one normalized query to
// the hits Open Food Facts gave for it, for a day, at most 500 queries, the oldest dropped first. In
// memory, so a restart empties it; the durable part is that every hit is also written to `products`
// (routes/snackSearch.ts), which is what the scan a result opens reads. A cache hit costs nothing
// against either limit in limits.ts.

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 500;

/** Lowercased, trimmed, inner whitespace collapsed: "Peanut  Butter " and "peanut butter" are one query. */
export function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export class SearchCache<T> {
  private entries = new Map<string, { at: number; value: T }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = CACHE_TTL_MS,
    private readonly maxEntries: number = CACHE_MAX_ENTRIES,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.at >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Re-inserting moves the key to the end: the Map keeps insertion order, and the first key is the oldest.
    this.entries.delete(key);
    this.entries.set(key, { at: this.now(), value });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
