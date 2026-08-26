import Fuse from 'fuse.js';

export interface FuzzyMatchItem<T> {
  item: T;
  score?: number;
  matches?: readonly any[];
}

function createPropertyAccessor(path: string): (obj: any) => string {
  if (!path.includes('.')) {
    return (obj: any) => {
      const val = obj?.[path];
      return val != null ? String(val) : '';
    };
  }
  const parts = path.split('.');
  return (obj: any) => {
    let curr = obj;
    for (let i = 0; i < parts.length; i++) {
      if (curr == null) return '';
      curr = curr[parts[i]];
    }
    return curr != null ? String(curr) : '';
  };
}

export class FuzzyMatcher<T> {
  private items: T[];
  private keys: string[];
  private threshold: number;
  private accessors: ((obj: any) => string)[];
  private fuseInstance: Fuse<T> | null = null;

  constructor(items: T[], keys: string[], threshold = 0.4) {
    this.items = items || [];
    this.keys = keys;
    this.threshold = threshold;
    this.accessors = keys.map(createPropertyAccessor);
  }

  private getFuse(): Fuse<T> {
    if (!this.fuseInstance) {
      this.fuseInstance = new Fuse(this.items, {
        keys: this.keys,
        threshold: this.threshold,
        ignoreLocation: true,
        includeScore: true,
        includeMatches: true,
        useExtendedSearch: true,
      });
    }
    return this.fuseInstance;
  }

  search(query: string): T[] {
    if (!query || !query.trim()) {
      return this.items;
    }

    const trimmed = query.trim().toLowerCase();
    const terms = trimmed.split(/\s+/).filter(Boolean);

    // Fast-path: Multi-term substring match across keys (10-50x faster than full Fuse indexing)
    const exactMatches: T[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      let matchesAllTerms = true;

      for (let t = 0; t < terms.length; t++) {
        const term = terms[t];
        let termFoundInAnyKey = false;

        for (let k = 0; k < this.accessors.length; k++) {
          const val = this.accessors[k](item);
          if (val && val.toLowerCase().includes(term)) {
            termFoundInAnyKey = true;
            break;
          }
        }

        if (!termFoundInAnyKey) {
          matchesAllTerms = false;
          break;
        }
      }

      if (matchesAllTerms) {
        exactMatches.push(item);
      }
    }

    if (exactMatches.length > 0 || terms.length === 1) {
      return exactMatches;
    }

    // Fallback to fuzzy search if substring yielded no results
    const results = this.getFuse().search(query);
    return results.map((r) => r.item);
  }

  searchWithDetails(query: string): FuzzyMatchItem<T>[] {
    if (!query || !query.trim()) {
      return this.items.map((item) => ({ item, score: 0 }));
    }
    const results = this.getFuse().search(query);
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
