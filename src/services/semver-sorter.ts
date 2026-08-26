import semver from 'semver';
import { ImageStreamTagInfo } from '../types/k8s.js';

export interface ParsedSemverTag {
  originalTag: string;
  cleanVersion: string | null;
  parsedSemver: semver.SemVer | null;
  isSemver: boolean;
  created?: string;
  createdTime: number;
  generation?: number;
  imageSize?: number;
  dockerImageReference?: string;
}

// Pre-compiled regex patterns to avoid recompilation inside hot loops
const SEMVER_EMBEDDED_REGEX = /v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/gi;
const DIGIT_DOT_DIGIT_REGEX = /\d+\.\d+/;

// LRU / Map memoization cache for tag parse results
const tagParseCache = new Map<string, { cleanVersion: string | null; parsedSemver: semver.SemVer | null }>();
const MAX_CACHE_SIZE = 5000;

export class SemverSorter {
  /**
   * Attempts to parse a tag into a clean semantic version.
   * Recognizes direct semver, prefixed versions (e.g. 'v1.2.3', 'release-3.0.0'),
   * and complex embedded tags like 'release-stage-v1.6.6', 'app-v2.1.0-rc1', '10.0-ubi9'.
   * Results are cached for ultra-fast repeated lookups.
   */
  static parseTag(tag: string): { cleanVersion: string | null; parsedSemver: semver.SemVer | null } {
    if (!tag) return { cleanVersion: null, parsedSemver: null };

    const trimmed = tag.trim();
    const cached = tagParseCache.get(trimmed);
    if (cached !== undefined) {
      return cached;
    }

    let result: { cleanVersion: string | null; parsedSemver: semver.SemVer | null } = { cleanVersion: null, parsedSemver: null };

    // 1. Direct standard semver check
    const directValid = semver.valid(trimmed) || semver.valid(semver.clean(trimmed));
    if (directValid) {
      result = {
        cleanVersion: directValid,
        parsedSemver: semver.parse(directValid),
      };
    } else {
      // 2. Extract embedded semver candidates
      SEMVER_EMBEDDED_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      let bestSemver: semver.SemVer | null = null;
      let bestClean: string | null = null;

      while ((match = SEMVER_EMBEDDED_REGEX.exec(trimmed)) !== null) {
        const candidate = match[1];
        const valid = semver.valid(candidate) || semver.valid(semver.clean(candidate));
        if (valid) {
          const parsed = semver.parse(valid);
          if (parsed) {
            bestSemver = parsed;
            bestClean = valid;
            break;
          }
        } else {
          const coerced = semver.coerce(candidate);
          if (coerced) {
            bestSemver = coerced;
            bestClean = coerced.version;
          }
        }
      }

      if (bestSemver && bestClean) {
        result = {
          cleanVersion: bestClean,
          parsedSemver: bestSemver,
        };
      } else if (DIGIT_DOT_DIGIT_REGEX.test(trimmed)) {
        // 3. Fallback: Coerce if it contains number sequences (e.g. '10.0' or '8.0-ubi8')
        const coerced = semver.coerce(trimmed);
        if (coerced) {
          result = {
            cleanVersion: coerced.version,
            parsedSemver: coerced,
          };
        }
      }
    }

    if (tagParseCache.size >= MAX_CACHE_SIZE) {
      // Simple cache eviction
      tagParseCache.clear();
    }
    tagParseCache.set(trimmed, result);
    return result;
  }

  /**
   * Parses and classifies a list of ImageStream tags into semver and non-semver collections with precomputed timestamps.
   */
  static classifyTags(tags: ImageStreamTagInfo[]): ParsedSemverTag[] {
    const result: ParsedSemverTag[] = new Array(tags.length);
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      const { cleanVersion, parsedSemver } = this.parseTag(t.tag);
      const created = t.created;
      const createdTime = created ? Date.parse(created) || 0 : 0;

      result[i] = {
        originalTag: t.tag,
        cleanVersion,
        parsedSemver,
        isSemver: parsedSemver !== null,
        created,
        createdTime,
        generation: t.generation,
        imageSize: t.imageSize,
        dockerImageReference: t.dockerImageReference,
      };
    }
    return result;
  }

  /**
   * Sorts ImageStream tags by:
   * - 'semver': Semantic version descending (highest first), tie-broken by generation/date, then non-semver.
   * - 'generation': OpenShift Tag generation descending (newest generation first).
   * - 'date': Creation timestamp descending (newest first).
   * - 'name': Tag name alphabetically.
   */
  static sortTags(
    tags: ImageStreamTagInfo[],
    sortBy: 'semver' | 'generation' | 'date' | 'name' = 'semver'
  ): ImageStreamTagInfo[] {
    if (!tags || tags.length === 0) return [];
    if (tags.length === 1) {
      const item = tags[0];
      const { cleanVersion, parsedSemver } = this.parseTag(item.tag);
      return [{
        tag: item.tag,
        created: item.created || '',
        generation: item.generation,
        dockerImageReference: item.dockerImageReference,
        imageSize: item.imageSize,
        isSemver: parsedSemver !== null,
        semverParsed: cleanVersion,
      }];
    }

    const classified = this.classifyTags(tags);

    if (sortBy === 'generation') {
      classified.sort((a, b) => {
        const genA = a.generation ?? 0;
        const genB = b.generation ?? 0;
        if (genB !== genA) return genB - genA;
        if (a.createdTime !== b.createdTime) return b.createdTime - a.createdTime;
        return a.originalTag.localeCompare(b.originalTag);
      });

      return classified.map((item) => ({
        tag: item.originalTag,
        created: item.created || '',
        generation: item.generation,
        dockerImageReference: item.dockerImageReference,
        imageSize: item.imageSize,
        isSemver: item.isSemver,
        semverParsed: item.cleanVersion,
      }));
    }

    if (sortBy === 'date') {
      classified.sort((a, b) => {
        if (a.createdTime !== b.createdTime) return b.createdTime - a.createdTime;
        return (b.generation ?? 0) - (a.generation ?? 0);
      });

      return classified.map((item) => ({
        tag: item.originalTag,
        created: item.created || '',
        generation: item.generation,
        dockerImageReference: item.dockerImageReference,
        imageSize: item.imageSize,
        isSemver: item.isSemver,
        semverParsed: item.cleanVersion,
      }));
    }

    if (sortBy === 'name') {
      classified.sort((a, b) => a.originalTag.localeCompare(b.originalTag));

      return classified.map((item) => ({
        tag: item.originalTag,
        created: item.created || '',
        generation: item.generation,
        dockerImageReference: item.dockerImageReference,
        imageSize: item.imageSize,
        isSemver: item.isSemver,
        semverParsed: item.cleanVersion,
      }));
    }

    // Default: SemVer sort with fast partitioning
    const semverList: ParsedSemverTag[] = [];
    const nonSemverList: ParsedSemverTag[] = [];

    for (let i = 0; i < classified.length; i++) {
      const item = classified[i];
      if (item.isSemver && item.parsedSemver) {
        semverList.push(item);
      } else {
        nonSemverList.push(item);
      }
    }

    // Sort semver list descending (e.g. 2.0.0 > 1.9.0), tie-breaking by generation and pre-parsed date
    semverList.sort((a, b) => {
      const cmp = semver.rcompare(a.parsedSemver!, b.parsedSemver!);
      if (cmp !== 0) return cmp;
      const genDiff = (b.generation ?? 0) - (a.generation ?? 0);
      if (genDiff !== 0) return genDiff;
      return b.createdTime - a.createdTime;
    });

    // Sort non-semver list by generation or creation date if available, otherwise alphabetically
    nonSemverList.sort((a, b) => {
      const genA = a.generation ?? 0;
      const genB = b.generation ?? 0;
      if (genB !== genA) return genB - genA;
      if (a.createdTime !== b.createdTime) return b.createdTime - a.createdTime;
      return a.originalTag.localeCompare(b.originalTag);
    });

    const result: ImageStreamTagInfo[] = new Array(semverList.length + nonSemverList.length);
    let idx = 0;

    for (let i = 0; i < semverList.length; i++) {
      const item = semverList[i];
      result[idx++] = {
        tag: item.originalTag,
        created: item.created || '',
        generation: item.generation,
        dockerImageReference: item.dockerImageReference,
        imageSize: item.imageSize,
        isSemver: true,
        semverParsed: item.cleanVersion,
      };
    }

    for (let i = 0; i < nonSemverList.length; i++) {
      const item = nonSemverList[i];
      result[idx++] = {
        tag: item.originalTag,
        created: item.created || '',
        generation: item.generation,
        dockerImageReference: item.dockerImageReference,
        imageSize: item.imageSize,
        isSemver: false,
        semverParsed: null,
      };
    }

    return result;
  }

  /**
   * Generates a cleanup plan to keep only the newest `keepCount` tags.
   */
  static planCleanup(
    tags: ImageStreamTagInfo[],
    options: {
      strategy?: 'semver' | 'generation';
      keepCount?: number;
      keepSemverCount?: number; // backwards compatibility
      keepNonSemver?: boolean;
      keepTagsNamed?: string[]; // e.g. ['latest', 'stable', 'main', 'master']
    }
  ): {
    tagsToKeep: ImageStreamTagInfo[];
    tagsToPrune: ImageStreamTagInfo[];
    totalSizeToReclaim: number;
  } {
    const strategy = options.strategy || 'semver';
    const keepLimit = options.keepCount ?? options.keepSemverCount ?? 3;
    const defaultProtected = ['latest', 'stable', 'main', 'master', 'prod'];
    const protectedList = options.keepTagsNamed || defaultProtected;
    const protectedNames = new Set(protectedList.map((s) => s.toLowerCase()));

    const tagsToKeep: ImageStreamTagInfo[] = [];
    const tagsToPrune: ImageStreamTagInfo[] = [];
    let totalSizeToReclaim = 0;

    if (strategy === 'generation') {
      const sortedByGen = this.sortTags(tags, 'generation');
      let retainedCount = 0;

      for (let i = 0; i < sortedByGen.length; i++) {
        const tag = sortedByGen[i];
        const isProtected = protectedNames.has(tag.tag.toLowerCase());
        if (isProtected) {
          tagsToKeep.push(tag);
          continue;
        }

        if (retainedCount < keepLimit) {
          tagsToKeep.push(tag);
          retainedCount++;
        } else {
          tagsToPrune.push({ ...tag, pruneSelected: true });
          totalSizeToReclaim += tag.imageSize || 0;
        }
      }
    } else {
      // SemVer strategy
      const sorted = this.sortTags(tags, 'semver');
      let semverCount = 0;
      const keepNonSemver = options.keepNonSemver ?? true;

      for (let i = 0; i < sorted.length; i++) {
        const tag = sorted[i];
        const isProtected = protectedNames.has(tag.tag.toLowerCase());

        if (isProtected) {
          tagsToKeep.push(tag);
          continue;
        }

        if (tag.isSemver) {
          if (semverCount < keepLimit) {
            tagsToKeep.push(tag);
            semverCount++;
          } else {
            tagsToPrune.push({ ...tag, pruneSelected: true });
            totalSizeToReclaim += tag.imageSize || 0;
          }
        } else {
          // Non-semver tag
          if (keepNonSemver) {
            tagsToKeep.push(tag);
          } else {
            tagsToPrune.push({ ...tag, pruneSelected: true });
            totalSizeToReclaim += tag.imageSize || 0;
          }
        }
      }
    }

    return {
      tagsToKeep,
      tagsToPrune,
      totalSizeToReclaim,
    };
  }
}
