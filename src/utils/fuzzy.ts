import Fuse from 'fuse.js';

export interface FuzzyMatchItem<T> {
  item: T;
  score?: number;
  matches?: readonly any[];
}

export class FuzzyMatcher<T> {
  private fuse: Fuse<T>;

  constructor(items: T[], keys: string[], threshold = 0.4) {
    this.fuse = new Fuse(items, {
      keys,
      threshold,
      ignoreLocation: true,
      includeScore: true,
      includeMatches: true,
      useExtendedSearch: true,
    });
  }

  search(query: string): T[] {
    if (!query || query.trim() === '') {
      return this.fuse.getIndex().docs as unknown as T[];
    }
    const results = this.fuse.search(query);
    return results.map((r) => r.item);
  }

  searchWithDetails(query: string): FuzzyMatchItem<T>[] {
    if (!query || query.trim() === '') {
      return (this.fuse.getIndex().docs as unknown as T[]).map((item) => ({ item, score: 0 }));
    }
    const results = this.fuse.search(query);
    return results.map((r) => ({
      item: r.item,
      score: r.score,
      matches: r.matches,
    }));
  }
}

/**
 * Simple highlighted segment builder for search results.
 */
export function getHighlightedText(
  text: string,
  query: string
): { text: string; isMatch: boolean }[] {
  if (!query || !text) return [{ text, isMatch: false }];

  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const index = lower.indexOf(q);

  if (index === -1) {
    return [{ text, isMatch: false }];
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);

  const parts: { text: string; isMatch: boolean }[] = [];
  if (before) parts.push({ text: before, isMatch: false });
  if (match) parts.push({ text: match, isMatch: true });
  if (after) parts.push({ text: after, isMatch: false });

  return parts;
}
