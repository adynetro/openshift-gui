import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OcClient } from "./oc-client.js";

describe("OcClient.sanitizeRegistryUrl", () => {
  it("should strip single quotes, double quotes, protocols, and trailing slashes", () => {
    assert.equal(OcClient.sanitizeRegistryUrl("'registry.apps.sdlc.bt.wan'"), 'registry.apps.sdlc.bt.wan');
    assert.equal(OcClient.sanitizeRegistryUrl('"registry.apps.sdlc.bt.wan"'), 'registry.apps.sdlc.bt.wan');
    assert.equal(OcClient.sanitizeRegistryUrl("https://'registry.apps.sdlc.bt.wan'/"), 'registry.apps.sdlc.bt.wan');
    assert.equal(OcClient.sanitizeRegistryUrl('http://registry.apps.sdlc.bt.wan:5000/'), 'registry.apps.sdlc.bt.wan:5000');
    assert.equal(OcClient.sanitizeRegistryUrl('  \'"registry.apps.sdlc.bt.wan"\'  '), 'registry.apps.sdlc.bt.wan');
    assert.equal(OcClient.sanitizeRegistryUrl(''), '');
    assert.equal(OcClient.sanitizeRegistryUrl(undefined), '');
  });

  it("should return a counts object with numeric values for getResourceCounts", async () => {
    const counts = await OcClient.getResourceCounts("test-namespace");
    assert.ok(typeof counts === 'object');
    // Ensure all defined counts are numbers
    for (const [k, v] of Object.entries(counts)) {
      assert.equal(typeof v, 'number');
    }
  });

  it("should handle preloadAllResources returning activeResources and counts", async () => {
    const res = await OcClient.preloadAllResources("test-namespace", "pods");
    assert.ok(res.activeResources);
    assert.ok(Array.isArray(res.activeResources.items));
    assert.ok(typeof res.counts === 'object');
  });

  it("should handle getPodContainers safely when cluster is not connected", async () => {
    const res = await OcClient.getPodContainers("test-pod", "test-ns");
    assert.ok(Array.isArray(res.containers));
    assert.ok(Array.isArray(res.allContainers));
    assert.equal(typeof res.resolvedNamespace, 'string');
  });

  it("should handle getApiGroups safely when cluster is not connected", async () => {
    const res = await OcClient.getApiGroups();
    assert.ok(Array.isArray(res.groups));
  });

  it("should handle getApiGroupResources safely", async () => {
    const res = await OcClient.getApiGroupResources("apps", "v1");
    assert.ok(Array.isArray(res.resources));
  });

  it("should handle listAnyResource safely", async () => {
    const res = await OcClient.listAnyResource("apps", "v1", "deployments", true, "default");
    assert.ok(Array.isArray(res.items));
  });
});
