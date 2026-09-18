import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAge, formatBytes, formatMemoryToGi, formatStorage, getStatusColor, padRight, truncate } from './formatters.js';

describe('Formatters', () => {
  it('should format memory to Gi correctly', () => {
    assert.equal(formatMemoryToGi('32715784Ki'), '31.2 Gi');
    assert.equal(formatMemoryToGi('8388608Ki'), '8 Gi');
    assert.equal(formatMemoryToGi('1048576Ki'), '1 Gi');
    assert.equal(formatMemoryToGi('512Mi'), '0.5 Gi');
    assert.equal(formatMemoryToGi('16Gi'), '16 Gi');
    assert.equal(formatMemoryToGi('2Ti'), '2048 Gi');
    assert.equal(formatMemoryToGi('-'), '-');
    assert.equal(formatMemoryToGi(undefined), '-');
  });

  it('should format ephemeral storage to Gi or Ti correctly', () => {
    assert.equal(formatStorage('104857600Ki'), '100 Gi');
    assert.equal(formatStorage('2147483648Ki'), '2 Ti');
    assert.equal(formatStorage('50327464Ki'), '48 Gi');
    assert.equal(formatStorage('512Mi'), '0.5 Gi');
    assert.equal(formatStorage('100Gi'), '100 Gi');
    assert.equal(formatStorage('2Ti'), '2 Ti');
    assert.equal(formatStorage(107374182400), '100 Gi');
    assert.equal(formatStorage(2199023255552), '2 Ti');
    assert.equal(formatStorage('-'), '-');
    assert.equal(formatStorage(undefined), '-');
  });

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
