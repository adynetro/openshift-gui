import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { KubeConfigService } from "./kubeconfig.js";

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
});
