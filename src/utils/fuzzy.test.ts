import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FuzzyMatcher, getHighlightedText } from './fuzzy.js';

describe('FuzzyMatcher', () => {
  it('should find matching items by query', () => {
    const items = [
      { name: 'auth-service-v1', namespace: 'devops' },
      { name: 'payment-gateway', namespace: 'devops' },
      { name: 'auth-redis-cache', namespace: 'database' },
      { name: 'frontend-nginx', namespace: 'default' },
    ];

    const matcher = new FuzzyMatcher(items, ['name', 'namespace']);
    const results = matcher.search('auth');

    assert.equal(results.length >= 2, true);
    assert.equal(results[0]?.name.includes('auth'), true);
  });

  it('should highlight matched segments', () => {
    const segments = getHighlightedText('payment-service', 'serv');
    assert.equal(segments.length, 3);
    assert.equal(segments[0]?.text, 'payment-');
    assert.equal(segments[0]?.isMatch, false);
    assert.equal(segments[1]?.text, 'serv');
    assert.equal(segments[1]?.isMatch, true);
    assert.equal(segments[2]?.text, 'ice');
    assert.equal(segments[2]?.isMatch, false);
  });
});
