import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getResourceApiPath, buildKubeUrl, getApiPathForResource, KubeHttpClient } from './kube-http-client.js';

describe('KubeHttpClient.getResourceApiPath', () => {
  it('should construct correct API endpoints for namespaced resources', () => {
    assert.equal(getResourceApiPath('pods', 'my-ns'), '/api/v1/namespaces/my-ns/pods');
    assert.equal(getResourceApiPath('deployments', 'my-ns'), '/apis/apps/v1/namespaces/my-ns/deployments');
    assert.equal(getResourceApiPath('deploymentconfigs', 'my-ns'), '/apis/apps.openshift.io/v1/namespaces/my-ns/deploymentconfigs');
    assert.equal(getResourceApiPath('dc', 'my-ns'), '/apis/apps.openshift.io/v1/namespaces/my-ns/deploymentconfigs');
    assert.equal(getResourceApiPath('statefulsets', 'my-ns'), '/apis/apps/v1/namespaces/my-ns/statefulsets');
    assert.equal(getResourceApiPath('daemonsets', 'my-ns'), '/apis/apps/v1/namespaces/my-ns/daemonsets');
    assert.equal(getResourceApiPath('services', 'my-ns'), '/api/v1/namespaces/my-ns/services');
    assert.equal(getResourceApiPath('routes', 'my-ns'), '/apis/route.openshift.io/v1/namespaces/my-ns/routes');
    assert.equal(getResourceApiPath('pvc', 'my-ns'), '/api/v1/namespaces/my-ns/persistentvolumeclaims');
    assert.equal(getResourceApiPath('configmaps', 'my-ns'), '/api/v1/namespaces/my-ns/configmaps');
    assert.equal(getResourceApiPath('secrets', 'my-ns'), '/api/v1/namespaces/my-ns/secrets');
    assert.equal(getResourceApiPath('imagestreams', 'my-ns'), '/apis/image.openshift.io/v1/namespaces/my-ns/imagestreams');
  });

  it('should construct correct API endpoints for cluster-wide or all-projects queries', () => {
    assert.equal(getResourceApiPath('pods', 'all-projects'), '/api/v1/pods');
    assert.equal(getResourceApiPath('deployments', ''), '/apis/apps/v1/deployments');
    assert.equal(getResourceApiPath('services', '__all__'), '/api/v1/services');
    assert.equal(getResourceApiPath('nodes', 'my-ns'), '/api/v1/nodes');
    assert.equal(getResourceApiPath('crd', 'my-ns'), '/apis/apiextensions.k8s.io/v1/customresourcedefinitions');
    assert.equal(getResourceApiPath('clusteroperators', 'my-ns'), '/apis/config.openshift.io/v1/clusteroperators');
    assert.equal(getResourceApiPath('projects', 'my-ns'), '/apis/project.openshift.io/v1/projects');
    assert.equal(getResourceApiPath('namespaces', 'my-ns'), '/api/v1/namespaces');
  });

  it('should handle reset gracefully', () => {
    assert.doesNotThrow(() => {
      KubeHttpClient.reset();
    });
  });
});

describe('buildKubeUrl', () => {
  it('should correctly build URL for standard Kubernetes / OpenShift endpoints', () => {
    const res = buildKubeUrl('https://api.ocp.example.com:6443', '/api/v1/namespaces');
    assert.equal(res.protocol, 'https:');
    assert.equal(res.hostname, 'api.ocp.example.com');
    assert.equal(res.port, 6443);
    assert.equal(res.pathname, '/api/v1/namespaces');
    assert.equal(res.fullPathWithQuery, '/api/v1/namespaces');
  });

  it('should preserve Rancher cluster path prefix when constructing endpoints', () => {
    const res = buildKubeUrl('https://rancher.example.com/k8s/clusters/c-m-q9tqj8b7', '/api/v1/namespaces/my-ns/pods?limit=500');
    assert.equal(res.protocol, 'https:');
    assert.equal(res.hostname, 'rancher.example.com');
    assert.equal(res.port, 443);
    assert.equal(res.pathname, '/k8s/clusters/c-m-q9tqj8b7/api/v1/namespaces/my-ns/pods');
    assert.equal(res.search, '?limit=500');
    assert.equal(res.fullPathWithQuery, '/k8s/clusters/c-m-q9tqj8b7/api/v1/namespaces/my-ns/pods?limit=500');
    assert.equal(res.rawUrl, 'https://rancher.example.com:443/k8s/clusters/c-m-q9tqj8b7/api/v1/namespaces/my-ns/pods?limit=500');
  });
});

describe('getApiPathForResource', () => {
  it('should calculate correct paths for core and custom resources', () => {
    const podPath = getApiPathForResource({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'my-pod', namespace: 'default' },
    });
    assert.equal(podPath.basePath, '/api/v1/namespaces/default/pods');
    assert.equal(podPath.itemPath, '/api/v1/namespaces/default/pods/my-pod');

    const deployPath = getApiPathForResource({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'web-app', namespace: 'prod' },
    });
    assert.equal(deployPath.basePath, '/apis/apps/v1/namespaces/prod/deployments');
    assert.equal(deployPath.itemPath, '/apis/apps/v1/namespaces/prod/deployments/web-app');

    const nodePath = getApiPathForResource({
      apiVersion: 'v1',
      kind: 'Node',
      metadata: { name: 'worker-1' },
    });
    assert.equal(nodePath.basePath, '/api/v1/nodes');
    assert.equal(nodePath.itemPath, '/api/v1/nodes/worker-1');
  });
});
