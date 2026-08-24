import semver from 'semver';
import { ImageStreamTagInfo } from '../types/k8s.js';

export interface ParsedSemverTag {
  originalTag: string;
  cleanVersion: string | null;
  parsedSemver: semver.SemVer | null;
  isSemver: boolean;
  created?: string;
  imageSize?: number;
  dockerImageReference?: string;
}

export class SemverSorter {
  /**
   * Attempts to parse a tag into a clean semantic version.
   * Strips common prefixes like 'v', 'release-', 'rel-', etc.
   */
  static parseTag(tag: string): { cleanVersion: string | null; parsedSemver: semver.SemVer | null } {
    if (!tag) return { cleanVersion: null, parsedSemver: null };

    // Standard semver coerce or clean
    const cleaned = semver.clean(tag) || semver.valid(semver.coerce(tag));
    
    // Check if valid semver directly
    const directValid = semver.valid(tag);
    if (directValid) {
      return {
        cleanVersion: directValid,
        parsedSemver: semver.parse(directValid),
      };
    }

    // Try stripping common prefixes
    const prefixRegex = /^(v|version[-_]?|release[-_]?|rel[-_]?|app[-_]?)/i;
    const stripped = tag.replace(prefixRegex, '');
    const strippedValid = semver.valid(stripped);
    if (strippedValid) {
      return {
        cleanVersion: strippedValid,
        parsedSemver: semver.parse(strippedValid),
      };
    }

    // Try semver coerce if it looks like a version (e.g., 1.2 or 1.2.3.4)
    if (/^\d+(\.\d+)+/.test(stripped)) {
      const coerced = semver.coerce(stripped);
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
        imageSize: t.imageSize,
        dockerImageReference: t.dockerImageReference,
      };
    });
  }

  /**
   * Sorts ImageStream tags by semantic version (descending, highest first),
   * followed by non-semver tags sorted by creation date (newest first) or alphabetically.
   */
  static sortTags(tags: ImageStreamTagInfo[]): ImageStreamTagInfo[] {
    const classified = this.classifyTags(tags);

    const semverList: ParsedSemverTag[] = [];
    const nonSemverList: ParsedSemverTag[] = [];

    for (const item of classified) {
      if (item.isSemver && item.parsedSemver) {
        semverList.push(item);
      } else {
        nonSemverList.push(item);
      }
    }

    // Sort semver list descending (e.g. 2.0.0 > 1.9.0)
    semverList.sort((a, b) => {
      return semver.rcompare(a.parsedSemver!, b.parsedSemver!);
    });

    // Sort non-semver list by creation date if available (newest first), otherwise alphabetically
    nonSemverList.sort((a, b) => {
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
