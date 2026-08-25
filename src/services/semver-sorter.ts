import semver from 'semver';
import { ImageStreamTagInfo } from '../types/k8s.js';

export interface ParsedSemverTag {
  originalTag: string;
  cleanVersion: string | null;
  parsedSemver: semver.SemVer | null;
  isSemver: boolean;
  created?: string;
  generation?: number;
  imageSize?: number;
  dockerImageReference?: string;
}

export class SemverSorter {
  /**
   * Attempts to parse a tag into a clean semantic version.
   * Recognizes direct semver, prefixed versions (e.g. 'v1.2.3', 'release-3.0.0'),
   * and complex embedded tags like 'release-stage-v1.6.6', 'app-v2.1.0-rc1', '10.0-ubi9'.
   */
  static parseTag(tag: string): { cleanVersion: string | null; parsedSemver: semver.SemVer | null } {
    if (!tag) return { cleanVersion: null, parsedSemver: null };

    const trimmed = tag.trim();

    // 1. Direct standard semver check
    const directValid = semver.valid(trimmed) || semver.valid(semver.clean(trimmed));
    if (directValid) {
      return {
        cleanVersion: directValid,
        parsedSemver: semver.parse(directValid),
      };
    }

    // 2. Extract embedded semver candidates (e.g. 'release-stage-v1.6.6', 'stage-1.2.3', 'feat-v2.0.0-beta.1')
    // Matches version patterns with optional 'v' prefix anywhere in the string
    const semverRegex = /v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/gi;
    let match: RegExpExecArray | null;
    let bestSemver: semver.SemVer | null = null;
    let bestClean: string | null = null;

    while ((match = semverRegex.exec(trimmed)) !== null) {
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
      return {
        cleanVersion: bestClean,
        parsedSemver: bestSemver,
      };
    }

    // 3. Fallback: Coerce if it contains number sequences (e.g. '10.0' or '8.0-ubi8')
    if (/\d+\.\d+/.test(trimmed)) {
      const coerced = semver.coerce(trimmed);
      if (coerced) {
        return {
          cleanVersion: coerced.version,
          parsedSemver: coerced,
        };
      }
    }

    return { cleanVersion: null, parsedSemver: null };
  }

  /**
   * Parses and classifies a list of ImageStream tags into semver and non-semver collections.
   */
  static classifyTags(tags: ImageStreamTagInfo[]): ParsedSemverTag[] {
    return tags.map((t) => {
      const { cleanVersion, parsedSemver } = this.parseTag(t.tag);
      return {
        originalTag: t.tag,
        cleanVersion,
        parsedSemver,
        isSemver: parsedSemver !== null,
        created: t.created,
        generation: t.generation,
        imageSize: t.imageSize,
        dockerImageReference: t.dockerImageReference,
      };
    });
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
    const classified = this.classifyTags(tags);

    if (sortBy === 'generation') {
      classified.sort((a, b) => {
        const genA = a.generation ?? 0;
        const genB = b.generation ?? 0;
        if (genB !== genA) return genB - genA;
        if (a.created && b.created) {
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
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
        if (a.created && b.created) {
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        }
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

    // Default: SemVer sort
    const semverList: ParsedSemverTag[] = [];
    const nonSemverList: ParsedSemverTag[] = [];

    for (const item of classified) {
      if (item.isSemver && item.parsedSemver) {
        semverList.push(item);
      } else {
        nonSemverList.push(item);
      }
    }

    // Sort semver list descending (e.g. 2.0.0 > 1.9.0), tie-breaking by generation
    semverList.sort((a, b) => {
      const cmp = semver.rcompare(a.parsedSemver!, b.parsedSemver!);
      if (cmp !== 0) return cmp;
      return (b.generation ?? 0) - (a.generation ?? 0);
    });

    // Sort non-semver list by generation or creation date if available, otherwise alphabetically
    nonSemverList.sort((a, b) => {
      const genA = a.generation ?? 0;
      const genB = b.generation ?? 0;
      if (genB !== genA) return genB - genA;
      if (a.created && b.created) {
        return new Date(b.created).getTime() - new Date(a.created).getTime();
      }
      return a.originalTag.localeCompare(b.originalTag);
    });

    const result: ImageStreamTagInfo[] = [];

    for (const item of semverList) {
      result.push({
        tag: item.originalTag,
        created: item.created || '',
        generation: item.generation,
        dockerImageReference: item.dockerImageReference,
        imageSize: item.imageSize,
        isSemver: true,
        semverParsed: item.cleanVersion,
      });
    }

    for (const item of nonSemverList) {
      result.push({
        tag: item.originalTag,
        created: item.created || '',
        generation: item.generation,
        dockerImageReference: item.dockerImageReference,
        imageSize: item.imageSize,
        isSemver: false,
        semverParsed: null,
      });
    }

    return result;
  }

  /**
   * Generates a cleanup plan to keep only the newest `keepCount` semver tags,
   * with options to keep/prune non-semver tags (e.g. 'latest').
   */
  static planCleanup(
    tags: ImageStreamTagInfo[],
    options: {
      keepSemverCount: number;
      keepNonSemver: boolean;
      keepTagsNamed?: string[]; // e.g. ['latest', 'stable', 'main', 'master']
    }
  ): {
    tagsToKeep: ImageStreamTagInfo[];
    tagsToPrune: ImageStreamTagInfo[];
    totalSizeToReclaim: number;
  } {
    const sorted = this.sortTags(tags);
    const protectedNames = new Set((options.keepTagsNamed || ['latest', 'stable']).map((s) => s.toLowerCase()));

    const tagsToKeep: ImageStreamTagInfo[] = [];
    const tagsToPrune: ImageStreamTagInfo[] = [];
    let semverCount = 0;

    for (const tag of sorted) {
      const isProtected = protectedNames.has(tag.tag.toLowerCase());

      if (isProtected) {
        tagsToKeep.push(tag);
        continue;
      }

      if (tag.isSemver) {
        if (semverCount < options.keepSemverCount) {
          tagsToKeep.push(tag);
          semverCount++;
        } else {
          tagsToPrune.push({ ...tag, pruneSelected: true });
        }
      } else {
        // Non-semver tag
        if (options.keepNonSemver) {
          tagsToKeep.push(tag);
        } else {
          tagsToPrune.push({ ...tag, pruneSelected: true });
        }
      }
    }

    const totalSizeToReclaim = tagsToPrune.reduce((acc, t) => acc + (t.imageSize || 0), 0);

    return {
      tagsToKeep,
      tagsToPrune,
      totalSizeToReclaim,
    };
  }
}
