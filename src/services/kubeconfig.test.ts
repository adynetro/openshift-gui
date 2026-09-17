import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { KubeConfigService, parseKubeConfig, groupServersWithContexts } from "./kubeconfig.js";

describe("parseKubeConfig & groupServersWithContexts", () => {
  const standardConfig = {
    apiVersion: "v1",
    kind: "Config",
    "current-context": "default/ocp-prod/admin",
    clusters: [
      {
        name: "ocp-prod",
        cluster: {
          server: "https://api.ocp-prod.example.com:6443",
          "insecure-skip-tls-verify": true,
        },
      },
      {
        name: "ocp-stage",
        cluster: {
          server: "https://api.ocp-stage.example.com:6443",
        },
      },
      {
        name: "unused-cluster-without-contexts",
        cluster: {
          server: "https://api.unused.example.com:6443",
        },
      },
    ],
    contexts: [
      {
        name: "default/ocp-prod/admin",
        context: {
          cluster: "ocp-prod",
          user: "admin-prod",
          namespace: "default",
        },
      },
      {
        name: "frontend/ocp-prod/admin",
        context: {
          cluster: "ocp-prod",
          user: "admin-prod",
          namespace: "frontend",
        },
      },
      {
        name: "backend/ocp-prod/admin",
        context: {
          cluster: "ocp-prod",
          user: "admin-prod",
          namespace: "backend",
        },
      },
      {
        name: "stage-context",
        context: {
          cluster: "ocp-stage",
          user: "developer-stage",
          namespace: "stage-ns",
        },
      },
    ],
    users: [
      { name: "admin-prod", user: { token: "token-prod" } },
      { name: "developer-stage", user: { token: "token-stage" } },
    ],
  };

  it("should correctly parse standard kubeconfig, resolve server URLs, and group servers with active contexts", () => {
    const yamlString = stringifyYaml(standardConfig);
    const result = parseKubeConfig(yamlString);

    assert.equal(result.contexts.length, 4);
    assert.equal(result.currentContext, "default/ocp-prod/admin");

    // Check context fields and server resolution
    const prodDefault = result.contexts.find((c) => c.name === "default/ocp-prod/admin");
    assert.ok(prodDefault);
    assert.equal(prodDefault.server, "https://api.ocp-prod.example.com:6443");
    assert.equal(prodDefault.isCurrent, true);
    assert.equal(prodDefault.cluster, "ocp-prod");

    const stageCtx = result.contexts.find((c) => c.name === "stage-context");
    assert.ok(stageCtx);
    assert.equal(stageCtx.server, "https://api.ocp-stage.example.com:6443");
    assert.equal(stageCtx.isCurrent, false);

    // Check server grouping - should ONLY contain servers with active contexts (2 servers, unused cluster omitted)
    assert.equal(result.servers.length, 2);

    // Active current server should be first
    const firstServer = result.servers[0];
    assert.ok(firstServer);
    assert.equal(firstServer.server, "https://api.ocp-prod.example.com:6443");
    assert.equal(firstServer.clusterName, "ocp-prod");
    assert.equal(firstServer.isCurrent, true);
    assert.equal(firstServer.activeContextName, "default/ocp-prod/admin");
    assert.equal(firstServer.contextCount, 3);
    assert.equal(firstServer.contexts.length, 3);

    const secondServer = result.servers[1];
    assert.ok(secondServer);
    assert.equal(secondServer.server, "https://api.ocp-stage.example.com:6443");
    assert.equal(secondServer.clusterName, "ocp-stage");
    assert.equal(secondServer.isCurrent, false);
    assert.equal(secondServer.activeContextName, "stage-context");
    assert.equal(secondServer.contextCount, 1);
  });

  it("should handle very messed up and corrupted kubeconfig structures gracefully", () => {
    // 1. Invalid YAML syntax
    const badYaml = "contexts: [unclosed bracket :: invalid yaml {{{";
    const resBadYaml = parseKubeConfig(badYaml);
    assert.deepEqual(resBadYaml, { contexts: [], currentContext: null, servers: [] });

    // 2. Empty string & whitespace
    assert.deepEqual(parseKubeConfig(""), { contexts: [], currentContext: null, servers: [] });
    assert.deepEqual(parseKubeConfig("   \n\t  "), { contexts: [], currentContext: null, servers: [] });

    // 3. Scalar values & null
    assert.deepEqual(parseKubeConfig(null), { contexts: [], currentContext: null, servers: [] });
    assert.deepEqual(parseKubeConfig(undefined), { contexts: [], currentContext: null, servers: [] });
    assert.deepEqual(parseKubeConfig("hello world"), { contexts: [], currentContext: null, servers: [] });

    // 4. Heavily messed up object with corrupted contexts array
    const messedUpConfig = {
      apiVersion: "v1",
      kind: "Config",
      "current-context": "non-existent-ctx",
      clusters: [
        null,
        "invalid-string",
        {},
        { name: "valid-cluster", cluster: { server: "https://api.valid.com:6443" } },
        { name: "cluster-without-server-obj", cluster: null },
      ],
      contexts: [
        null,
        undefined,
        12345,
        "string-instead-of-object",
        {},
        { name: "" },
        { name: "   " },
        {
          name: "dangling-cluster-ctx",
          context: {
            cluster: "non-existent-cluster",
            user: "some-user",
          },
        },
        {
          name: "valid-ctx-1",
          context: {
            cluster: "valid-cluster",
            user: "user-1",
            namespace: "custom-ns",
          },
        },
        // Duplicate context name
        {
          name: "valid-ctx-1",
          context: {
            cluster: "valid-cluster",
            user: "user-1",
            namespace: "custom-ns",
          },
        },
        {
          name: "ctx-with-missing-context-obj",
        },
      ],
      users: null,
    };

    const resMessed = parseKubeConfig(stringifyYaml(messedUpConfig));

    // Should extract the 3 non-empty named contexts (deduplicating valid-ctx-1)
    assert.equal(resMessed.contexts.length, 3);
    const names = resMessed.contexts.map((c) => c.name);
    assert.ok(names.includes("dangling-cluster-ctx"));
    assert.ok(names.includes("valid-ctx-1"));
    assert.ok(names.includes("ctx-with-missing-context-obj"));

    // Server fallback for dangling cluster reference
    const dangling = resMessed.contexts.find((c) => c.name === "dangling-cluster-ctx");
    assert.ok(dangling);
    assert.equal(dangling.server, "non-existent-cluster");

    // Valid cluster server resolved
    const valid = resMessed.contexts.find((c) => c.name === "valid-ctx-1");
    assert.ok(valid);
    assert.equal(valid.server, "https://api.valid.com:6443");
    assert.equal(valid.namespace, "custom-ns");

    // Missing context obj handled with safe defaults
    const missingCtxObj = resMessed.contexts.find((c) => c.name === "ctx-with-missing-context-obj");
    assert.ok(missingCtxObj);
    assert.equal(missingCtxObj.namespace, "default");
    assert.equal(missingCtxObj.user, "");

    // Current context fallback: since 'non-existent-ctx' was invalid, it defaults to the first valid context
    assert.ok(resMessed.currentContext);
    assert.equal(resMessed.currentContext, resMessed.contexts[0]?.name);

    // Servers list should be cleanly populated
    assert.ok(resMessed.servers.length >= 2);
  });
});

describe("KubeConfigService.cleanContexts", () => {
  const sampleConfig = {
    apiVersion: "v1",
    kind: "Config",
    "current-context": "active-cluster/admin",
    contexts: [
      {
        name: "active-cluster/admin",
        context: {
          cluster: "active-cluster",
          user: "admin-user",
          namespace: "default",
        },
      },
      {
        name: "stale-cluster-1/dev",
        context: {
          cluster: "stale-cluster-1",
          user: "dev-user",
          namespace: "dev",
        },
      },
      {
        name: "stale-cluster-2/test",
        context: {
          cluster: "stale-cluster-2",
          user: "test-user",
          namespace: "test",
        },
      },
    ],
    clusters: [
      { name: "active-cluster", cluster: { server: "https://active.example.com:6443" } },
      { name: "stale-cluster-1", cluster: { server: "https://stale1.example.com:6443" } },
      { name: "stale-cluster-2", cluster: { server: "https://stale2.example.com:6443" } },
    ],
    users: [
      { name: "admin-user", user: { token: "token-admin" } },
      { name: "dev-user", user: { token: "token-dev" } },
      { name: "test-user", user: { token: "token-test" } },
    ],
  };

  it("should clean all inactive contexts when keepActiveOnly is true and prune dangling clusters/users", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kube-test-"));
    const tmpKubeConfig = path.join(tmpDir, "config");
    fs.writeFileSync(tmpKubeConfig, stringifyYaml(sampleConfig), "utf8");

    const originalEnv = process.env["KUBECONFIG"];
    process.env["KUBECONFIG"] = tmpKubeConfig;

    try {
      const result = await KubeConfigService.cleanContexts({
        keepActiveOnly: true,
        pruneDangling: true,
      });

      assert.equal(result.success, true);
      assert.equal(result.deletedContexts.length, 2);
      assert.deepEqual(result.deletedContexts.sort(), ["stale-cluster-1/dev", "stale-cluster-2/test"].sort());
      assert.deepEqual(result.deletedClusters.sort(), ["stale-cluster-1", "stale-cluster-2"].sort());
      assert.deepEqual(result.deletedUsers.sort(), ["dev-user", "test-user"].sort());
      assert.deepEqual(result.remainingContexts, ["active-cluster/admin"]);

      const updated = parseYaml(fs.readFileSync(tmpKubeConfig, "utf8"));
      assert.equal(updated.contexts.length, 1);
      assert.equal(updated.contexts[0].name, "active-cluster/admin");
      assert.equal(updated.clusters.length, 1);
      assert.equal(updated.clusters[0].name, "active-cluster");
      assert.equal(updated.users.length, 1);
      assert.equal(updated.users[0].name, "admin-user");
      assert.equal(updated["current-context"], "active-cluster/admin");

      assert.equal(result.backupPath && fs.existsSync(result.backupPath), true);
    } finally {
      process.env["KUBECONFIG"] = originalEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should delete specific contexts when contextNamesToDelete is provided", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kube-test-"));
    const tmpKubeConfig = path.join(tmpDir, "config");
    fs.writeFileSync(tmpKubeConfig, stringifyYaml(sampleConfig), "utf8");

    const originalEnv = process.env["KUBECONFIG"];
    process.env["KUBECONFIG"] = tmpKubeConfig;

    try {
      const result = await KubeConfigService.cleanContexts({
        contextNamesToDelete: ["stale-cluster-1/dev"],
        pruneDangling: true,
      });

      assert.equal(result.success, true);
      assert.deepEqual(result.deletedContexts, ["stale-cluster-1/dev"]);
      assert.deepEqual(result.deletedClusters, ["stale-cluster-1"]);
      assert.deepEqual(result.deletedUsers, ["dev-user"]);
      assert.equal(result.remainingContexts.length, 2);

      const updated = parseYaml(fs.readFileSync(tmpKubeConfig, "utf8"));
      assert.equal(updated.contexts.length, 2);
      assert.equal(updated.clusters.length, 2);
      assert.equal(updated.users.length, 2);
    } finally {
      process.env["KUBECONFIG"] = originalEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should get servers with active contexts and getClusterInfo", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kube-test-"));
    const tmpKubeConfig = path.join(tmpDir, "config");
    fs.writeFileSync(tmpKubeConfig, stringifyYaml(sampleConfig), "utf8");

    const originalEnv = process.env["KUBECONFIG"];
    process.env["KUBECONFIG"] = tmpKubeConfig;

    try {
      const serverRes = await KubeConfigService.getServers();
      assert.ok(serverRes.servers.length >= 3);
      assert.equal(serverRes.currentContext, "active-cluster/admin");
      assert.equal(serverRes.currentServer, "https://active.example.com:6443");

      const clusterInfo = await KubeConfigService.getClusterInfo();
      assert.equal(clusterInfo.server, "https://active.example.com:6443");
      assert.equal(clusterInfo.context, "active-cluster/admin");
      assert.equal(clusterInfo.connected, true);
    } finally {
      process.env["KUBECONFIG"] = originalEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should correctly parse and preserve Rancher path-based cluster URLs and token auth", () => {
    const rancherConfig = {
      apiVersion: "v1",
      kind: "Config",
      "current-context": "rancher-dev",
      clusters: [
        {
          name: "rancher-dev-cluster",
          cluster: {
            server: "https://rancher.corp.internal/k8s/clusters/c-m-8vx9b2qt",
            "insecure-skip-tls-verify": true,
          },
        },
        {
          name: "rancher-prod-cluster",
          cluster: {
            server: "https://rancher.corp.internal/k8s/clusters/c-m-z9tk4pw7",
          },
        },
      ],
      contexts: [
        {
          name: "rancher-dev",
          context: {
            cluster: "rancher-dev-cluster",
            user: "user-dev",
            namespace: "cattle-system",
          },
        },
        {
          name: "rancher-prod",
          context: {
            cluster: "rancher-prod-cluster",
            user: "user-prod",
            namespace: "fleet-default",
          },
        },
      ],
      users: [
        {
          name: "user-dev",
          user: {
            token: "kubeconfig-user-dev:abcdef123456",
          },
        },
        {
          name: "user-prod",
          user: {
            token: "kubeconfig-user-prod:987654fedcba",
          },
        },
      ],
    };

    const parsed = parseKubeConfig(stringifyYaml(rancherConfig));
    assert.equal(parsed.contexts.length, 2);
    assert.equal(parsed.currentContext, "rancher-dev");

    const devCtx = parsed.contexts.find((c) => c.name === "rancher-dev");
    assert.ok(devCtx);
    assert.equal(devCtx.server, "https://rancher.corp.internal/k8s/clusters/c-m-8vx9b2qt");
    assert.equal(devCtx.namespace, "cattle-system");
    assert.equal(devCtx.isCurrent, true);

    const prodCtx = parsed.contexts.find((c) => c.name === "rancher-prod");
    assert.ok(prodCtx);
    assert.equal(prodCtx.server, "https://rancher.corp.internal/k8s/clusters/c-m-z9tk4pw7");
    assert.equal(prodCtx.namespace, "fleet-default");
    assert.equal(prodCtx.isCurrent, false);

    // Ensure servers are grouped by their respective cluster URLs
    assert.equal(parsed.servers.length, 2);
    assert.equal(parsed.servers[0]?.server, "https://rancher.corp.internal/k8s/clusters/c-m-8vx9b2qt");
    assert.equal(parsed.servers[0]?.isCurrent, true);
    assert.equal(parsed.servers[1]?.server, "https://rancher.corp.internal/k8s/clusters/c-m-z9tk4pw7");
  });
});


