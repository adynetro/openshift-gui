import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getResourceApiPath, KubeHttpClient } from './kube-http-client.js';

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
