import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LogStreamer, LogEntry } from './log-streamer.js';

describe('LogStreamer', () => {
  it('should instantiate correctly with default and custom options', () => {
    const streamer = new LogStreamer('test-pod', 'test-ns', 'pods', 'main-app', 100);
    assert.ok(streamer);
    assert.deepEqual(streamer.getLogs(), []);
  });

  it('should handle stop safely before start or multiple times', () => {
    const streamer = new LogStreamer('test-pod', 'test-ns');
    assert.doesNotThrow(() => {
      streamer.stop();
      streamer.stop();
    });
  });

  it('should handle unhandled error safely without crashing', async () => {
    const streamer = new LogStreamer('nonexistent-workload-xyz', 'test-ns', 'deployments');
    
    // No error listener attached - must not throw unhandled exception
    await assert.doesNotReject(async () => {
      await streamer.start();
    });

    const logs = streamer.getLogs();
    assert.ok(Array.isArray(logs));
    streamer.stop();
  });
});
