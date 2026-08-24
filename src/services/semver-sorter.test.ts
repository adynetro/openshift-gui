import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SemverSorter } from './semver-sorter.js';
import { ImageStreamTagInfo } from '../types/k8s.js';

describe('SemverSorter', () => {
  it('should parse valid semver tags with and without v prefix', () => {
    const p1 = SemverSorter.parseTag('v1.2.3');
    assert.equal(p1.cleanVersion, '1.2.3');
    assert.equal(p1.parsedSemver !== null, true);

    const p2 = SemverSorter.parseTag('2.10.4-rc.1');
    assert.equal(p2.cleanVersion, '2.10.4-rc.1');
    assert.equal(p2.parsedSemver !== null, true);

    const p3 = SemverSorter.parseTag('release-3.0.0');
    assert.equal(p3.cleanVersion, '3.0.0');

    const p4 = SemverSorter.parseTag('latest');
    assert.equal(p4.cleanVersion, null);
    assert.equal(p4.parsedSemver, null);
  });

  it('should correctly sort semver tags in descending order and keep non-semver at end', () => {
    const rawTags: ImageStreamTagInfo[] = [
      { tag: 'v1.2.0', created: '2026-01-01T00:00:00Z', isSemver: false },
      { tag: 'v1.10.0', created: '2026-02-01T00:00:00Z', isSemver: false },
      { tag: 'latest', created: '2026-03-01T00:00:00Z', isSemver: false },
      { tag: 'v2.0.0', created: '2026-02-15T00:00:00Z', isSemver: false },
      { tag: 'v1.2.1', created: '2026-01-10T00:00:00Z', isSemver: false },
      { tag: 'dev-build', created: '2026-02-20T00:00:00Z', isSemver: false },
    ];

    const sorted = SemverSorter.sortTags(rawTags);
    const sortedNames = sorted.map((t) => t.tag);

    // v2.0.0 > v1.10.0 > v1.2.1 > v1.2.0, followed by non-semver
    assert.deepEqual(sortedNames.slice(0, 4), ['v2.0.0', 'v1.10.0', 'v1.2.1', 'v1.2.0']);
    assert.equal(sortedNames.includes('latest'), true);
    assert.equal(sortedNames.includes('dev-build'), true);
  });

  it('should plan cleanup retaining latest N semver versions and protected tags', () => {
    const rawTags: ImageStreamTagInfo[] = [
      { tag: 'v3.0.0', created: '2026-03-01T00:00:00Z', imageSize: 100, isSemver: true },
      { tag: 'v2.1.0', created: '2026-02-01T00:00:00Z', imageSize: 100, isSemver: true },
      { tag: 'v2.0.0', created: '2026-01-01T00:00:00Z', imageSize: 100, isSemver: true },
      { tag: 'v1.0.0', created: '2025-12-01T00:00:00Z', imageSize: 100, isSemver: true },
      { tag: 'latest', created: '2026-03-02T00:00:00Z', imageSize: 100, isSemver: false },
      { tag: 'old-scratch', created: '2025-01-01T00:00:00Z', imageSize: 50, isSemver: false },
    ];

    const plan = SemverSorter.planCleanup(rawTags, {
      keepSemverCount: 2,
      keepNonSemver: false,
      keepTagsNamed: ['latest'],
    });

    const kept = plan.tagsToKeep.map((t) => t.tag);
    const pruned = plan.tagsToPrune.map((t) => t.tag);

    assert.equal(kept.includes('latest'), true); // protected
    assert.equal(kept.includes('v3.0.0'), true); // semver #1
    assert.equal(kept.includes('v2.1.0'), true); // semver #2
    assert.equal(pruned.includes('v2.0.0'), true); // pruned
    assert.equal(pruned.includes('v1.0.0'), true); // pruned
    assert.equal(pruned.includes('old-scratch'), true); // pruned
    assert.equal(plan.totalSizeToReclaim, 250);
  });
});
