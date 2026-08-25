import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SemverSorter } from './semver-sorter.js';
import { ImageStreamTagInfo } from '../types/k8s.js';

describe('SemverSorter', () => {
  it('should parse valid semver tags with and without v prefix and embedded prefixes', () => {
    const p1 = SemverSorter.parseTag('v1.2.3');
    assert.equal(p1.cleanVersion, '1.2.3');
    assert.equal(p1.parsedSemver !== null, true);

    const p2 = SemverSorter.parseTag('2.10.4-rc.1');
    assert.equal(p2.cleanVersion, '2.10.4-rc.1');
    assert.equal(p2.parsedSemver !== null, true);

    const p3 = SemverSorter.parseTag('release-3.0.0');
    assert.equal(p3.cleanVersion, '3.0.0');

    const p4 = SemverSorter.parseTag('release-stage-v1.6.6');
    assert.equal(p4.cleanVersion, '1.6.6');
    assert.equal(p4.parsedSemver !== null, true);

    const p5 = SemverSorter.parseTag('stage-app-1.2.3');
    assert.equal(p5.cleanVersion, '1.2.3');

    const p6 = SemverSorter.parseTag('latest');
    assert.equal(p6.cleanVersion, null);
    assert.equal(p6.parsedSemver, null);
  });

  it('should correctly sort semver tags in descending order and keep non-semver at end', () => {
    const rawTags: ImageStreamTagInfo[] = [
      { tag: 'v1.2.0', created: '2026-01-01T00:00:00Z', generation: 1, isSemver: false },
      { tag: 'release-stage-v1.6.6', created: '2026-02-05T00:00:00Z', generation: 3, isSemver: false },
      { tag: 'v1.10.0', created: '2026-02-01T00:00:00Z', generation: 2, isSemver: false },
      { tag: 'latest', created: '2026-03-01T00:00:00Z', generation: 5, isSemver: false },
      { tag: 'v2.0.0', created: '2026-02-15T00:00:00Z', generation: 4, isSemver: false },
      { tag: 'v1.2.1', created: '2026-01-10T00:00:00Z', generation: 1, isSemver: false },
      { tag: 'dev-build', created: '2026-02-20T00:00:00Z', generation: 1, isSemver: false },
    ];

    const sorted = SemverSorter.sortTags(rawTags, 'semver');
    const sortedNames = sorted.map((t) => t.tag);

    // v2.0.0 > v1.10.0 > release-stage-v1.6.6 > v1.2.1 > v1.2.0, followed by non-semver
    assert.deepEqual(sortedNames.slice(0, 5), ['v2.0.0', 'v1.10.0', 'release-stage-v1.6.6', 'v1.2.1', 'v1.2.0']);
    assert.equal(sortedNames.includes('latest'), true);
    assert.equal(sortedNames.includes('dev-build'), true);
  });

  it('should correctly sort tags by generation descending', () => {
    const rawTags: ImageStreamTagInfo[] = [
      { tag: 'v1.0.0', generation: 1, created: '2026-01-01T00:00:00Z', isSemver: true },
      { tag: 'v3.0.0', generation: 15, created: '2026-03-01T00:00:00Z', isSemver: true },
      { tag: 'release-stage-v1.6.6', generation: 10, created: '2026-02-01T00:00:00Z', isSemver: true },
      { tag: 'latest', generation: 20, created: '2026-03-05T00:00:00Z', isSemver: false },
    ];

    const sorted = SemverSorter.sortTags(rawTags, 'generation');
    const sortedNames = sorted.map((t) => t.tag);

    assert.deepEqual(sortedNames, ['latest', 'v3.0.0', 'release-stage-v1.6.6', 'v1.0.0']);
  });

  it('should plan cleanup retaining latest N semver versions including embedded semver tags', () => {
    const rawTags: ImageStreamTagInfo[] = [
      { tag: 'v3.0.0', created: '2026-03-01T00:00:00Z', imageSize: 100, isSemver: true },
      { tag: 'release-stage-v1.6.6', created: '2026-02-10T00:00:00Z', imageSize: 100, isSemver: true },
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
    assert.equal(pruned.includes('release-stage-v1.6.6'), true); // pruned (1.6.6 < 2.1.0)
    assert.equal(pruned.includes('v2.0.0'), true); // pruned
    assert.equal(pruned.includes('v1.0.0'), true); // pruned
    assert.equal(pruned.includes('old-scratch'), true); // pruned
    assert.equal(plan.totalSizeToReclaim, 350);
  });

  it('should plan cleanup retaining latest N generations regardless of semver', () => {
    const rawTags: ImageStreamTagInfo[] = [
      { tag: 'v1.0.0', generation: 50, created: '2026-03-01T00:00:00Z', imageSize: 100, isSemver: true },
      { tag: 'release-stage-v1.6.6', generation: 40, created: '2026-02-10T00:00:00Z', imageSize: 100, isSemver: true },
      { tag: 'v9.9.9', generation: 10, created: '2026-01-01T00:00:00Z', imageSize: 100, isSemver: true },
      { tag: 'custom-build', generation: 30, created: '2026-02-01T00:00:00Z', imageSize: 100, isSemver: false },
      { tag: 'latest', generation: 60, created: '2026-03-05T00:00:00Z', imageSize: 100, isSemver: false },
    ];

    const plan = SemverSorter.planCleanup(rawTags, {
      strategy: 'generation',
      keepCount: 2,
      keepTagsNamed: ['latest'],
    });

    const kept = plan.tagsToKeep.map((t) => t.tag);
    const pruned = plan.tagsToPrune.map((t) => t.tag);

    assert.equal(kept.includes('latest'), true); // protected (gen 60)
    assert.equal(kept.includes('v1.0.0'), true); // highest gen #1 (gen 50)
    assert.equal(kept.includes('release-stage-v1.6.6'), true); // highest gen #2 (gen 40)
    assert.equal(pruned.includes('custom-build'), true); // gen 30 pruned
    assert.equal(pruned.includes('v9.9.9'), true); // gen 10 pruned even though semver is 9.9.9
    assert.equal(plan.totalSizeToReclaim, 200);
  });
});
