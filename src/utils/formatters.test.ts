import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAge, formatBytes, getStatusColor, padRight, truncate } from './formatters.js';

describe('Formatters', () => {
  it('should format age correctly', () => {
    const now = new Date();
    assert.equal(formatAge(now.toISOString()), '0s');

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    assert.equal(formatAge(tenMinutesAgo.toISOString()), '10m');

    const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000);
    assert.equal(formatAge(fiveHoursAgo.toISOString()), '5h');

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    assert.equal(formatAge(threeDaysAgo.toISOString()), '3d');
  });

  it('should format bytes properly', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1024 * 1024 * 50), '50 MB');
    assert.equal(formatBytes(1024 * 1024 * 1024 * 2.5), '2.5 GB');
  });

  it('should return correct status colors', () => {
    assert.equal(getStatusColor('Running'), 'green');
    assert.equal(getStatusColor('Active'), 'green');
    assert.equal(getStatusColor('Deployed'), 'green');
    assert.equal(getStatusColor('CrashLoopBackOff'), 'red');
    assert.equal(getStatusColor('Error'), 'red');
    assert.equal(getStatusColor('Pending'), 'yellow');
    assert.equal(getStatusColor('Terminating'), 'yellow');
  });

  it('should pad and truncate text properly', () => {
    assert.equal(padRight('abc', 6), 'abc   ');
    assert.equal(padRight('abcdefgh', 5), 'abcde');
    assert.equal(truncate('hello world', 5), 'hell…');
  });
});
