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
});
