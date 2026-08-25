import electron from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const { app, BrowserWindow, ipcMain } = electron;
const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'docs', 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Mock Data for Screenshots
const mockContexts = [
  { name: 'ocp-prod-cluster-01', server: 'https://api.ocp-prod.chiscari.ro:6443', user: 'admin', current: true },
  { name: 'ocp-staging-eu-01', server: 'https://api.ocp-stage.chiscari.ro:6443', user: 'developer', current: false },
  { name: 'k8s-edge-microshift', server: 'https://api.edge-rpi.chiscari.ro:6443', user: 'system:admin', current: false }
];

const mockProjects = [
  { name: 'production-apps', displayName: 'Production Microservices', status: 'Active' },
  { name: 'ingress-gateway', displayName: 'Edge Gateway & HAProxy', status: 'Active' },
  { name: 'monitoring-stack', displayName: 'Observability & Metrics', status: 'Active' },
  { name: 'default', displayName: 'Default System', status: 'Active' }
];

const mockPods = [
  {
    id: 'web-frontend-7f98b594b9-8p2xl',
    name: 'web-frontend-7f98b594b9-8p2xl',
    namespace: 'production-apps',
    kind: 'pods',
    status: 'Running',
    statusColor: 'green',
    age: '4d 12h',
    ready: '1/1',
    restarts: 0,
    cpu: '18m',
    memory: '142Mi',
    ip: '10.128.2.45',
    node: 'worker-01.ocp-prod.internal',
    labels: { app: 'web-frontend', tier: 'frontend', version: 'v3.3.0' }
  },
  {
    id: 'web-frontend-7f98b594b9-q9kzt',
    name: 'web-frontend-7f98b594b9-q9kzt',
    namespace: 'production-apps',
    kind: 'pods',
    status: 'Running',
    statusColor: 'green',
    age: '4d 12h',
    ready: '1/1',
    restarts: 0,
    cpu: '24m',
    memory: '158Mi',
    ip: '10.128.4.88',
    node: 'worker-02.ocp-prod.internal',
    labels: { app: 'web-frontend', tier: 'frontend', version: 'v3.3.0' }
  },
  {
    id: 'web-frontend-7f98b594b9-m7v4c',
    name: 'web-frontend-7f98b594b9-m7v4c',
    namespace: 'production-apps',
    kind: 'pods',
    status: 'Running',
    statusColor: 'green',
    age: '2d 5h',
    ready: '1/1',
    restarts: 0,
    cpu: '16m',
    memory: '139Mi',
    ip: '10.128.3.112',
    node: 'worker-03.ocp-prod.internal',
    labels: { app: 'web-frontend', tier: 'frontend', version: 'v3.3.0' }
  },
  {
    id: 'api-gateway-5c4d7967b5-2v4lk',
    name: 'api-gateway-5c4d7967b5-2v4lk',
    namespace: 'production-apps',
    kind: 'pods',
    status: 'Running',
    statusColor: 'green',
    age: '6d 1h',
    ready: '2/2',
    restarts: 1,
    cpu: '45m',
    memory: '310Mi',
    ip: '10.128.2.91',
    node: 'worker-01.ocp-prod.internal',
    labels: { app: 'api-gateway', tier: 'backend', env: 'production' }
  },
  {
    id: 'auth-service-68d76d4949-px8zq',
    name: 'auth-service-68d76d4949-px8zq',
    namespace: 'production-apps',
    kind: 'pods',
    status: 'Running',
    statusColor: 'green',
    age: '8d',
    ready: '1/1',
    restarts: 0,
    cpu: '12m',
    memory: '198Mi',
    ip: '10.128.4.15',
    node: 'worker-02.ocp-prod.internal',
    labels: { app: 'auth-service', tier: 'security' }
  },
  {
    id: 'redis-cache-0',
    name: 'redis-cache-0',
    namespace: 'production-apps',
    kind: 'pods',
    status: 'Running',
    statusColor: 'green',
    age: '14d',
    ready: '1/1',
    restarts: 0,
    cpu: '8m',
    memory: '84Mi',
    ip: '10.128.3.40',
    node: 'worker-03.ocp-prod.internal',
    labels: { app: 'redis-cache', tier: 'cache' }
  },
  {
    id: 'db-migration-job-9kx5w',
    name: 'db-migration-job-9kx5w',
    namespace: 'production-apps',
    kind: 'pods',
    status: 'Completed',
    statusColor: 'gray',
    age: '1d 3h',
    ready: '0/1',
    restarts: 0,
    cpu: '0m',
    memory: '0Mi',
    ip: '10.128.2.14',
    node: 'worker-01.ocp-prod.internal',
    labels: { job: 'db-migration' }
  }
];

const mockDeployments = [
  {
    id: 'web-frontend',
    name: 'web-frontend',
    namespace: 'production-apps',
    kind: 'deployments',
    status: '3/3 Ready',
    statusColor: 'green',
    age: '12d',
    ready: '3/3',
    cpu: '58m',
    memory: '439Mi',
    labels: { app: 'web-frontend', app_kubernetes_io_part_of: 'frontend-stack' },
    extra: { replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, images: ['image-registry.openshift-image-registry.svc:5000/production-apps/web-frontend:v3.3.0'] }
  },
  {
    id: 'api-gateway',
    name: 'api-gateway',
    namespace: 'production-apps',
    kind: 'deployments',
    status: '2/2 Ready',
    statusColor: 'green',
    age: '12d',
    ready: '2/2',
    cpu: '90m',
    memory: '620Mi',
    labels: { app: 'api-gateway', app_kubernetes_io_part_of: 'backend-stack' },
    extra: { replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, images: ['image-registry.openshift-image-registry.svc:5000/production-apps/api-gateway:v2.8.4'] }
  },
  {
    id: 'auth-service',
    name: 'auth-service',
    namespace: 'production-apps',
    kind: 'deployments',
    status: '1/1 Ready',
    statusColor: 'green',
    age: '15d',
    ready: '1/1',
    cpu: '12m',
    memory: '198Mi',
    labels: { app: 'auth-service' },
    extra: { replicas: 1, readyReplicas: 1, updatedReplicas: 1, availableReplicas: 1, images: ['quay.io/keycloak/keycloak:24.0.5'] }
  }
];

const mockImageStreams = [
  {
    id: 'web-frontend',
    name: 'web-frontend',
    namespace: 'production-apps',
    kind: 'imagestreams',
    status: '9 tags',
    statusColor: 'blue',
    age: '28d',
    raw: {
      metadata: { name: 'web-frontend', namespace: 'production-apps', creationTimestamp: '2026-07-20T10:00:00Z' },
      status: {
        dockerImageRepository: 'image-registry.openshift-image-registry.svc:5000/production-apps/web-frontend',
        tags: [
          { tag: 'v3.3.0', items: [{ created: '2026-08-25T14:20:00Z', dockerImageReference: 'sha256:4a8df9e82c1b4e...', size: '42.8 MB' }] },
          { tag: 'v3.2.1', items: [{ created: '2026-08-22T09:12:00Z', dockerImageReference: 'sha256:1a8df9e82c1b4e...', size: '42.5 MB' }] },
          { tag: 'v3.2.0', items: [{ created: '2026-08-18T11:45:00Z', dockerImageReference: 'sha256:2b8df9e82c1b4e...', size: '41.9 MB' }] },
          { tag: 'v3.1.5', items: [{ created: '2026-08-10T16:30:00Z', dockerImageReference: 'sha256:3c8df9e82c1b4e...', size: '41.2 MB' }] },
          { tag: 'v3.1.0', items: [{ created: '2026-08-01T08:15:00Z', dockerImageReference: 'sha256:4d8df9e82c1b4e...', size: '40.8 MB' }] },
          { tag: 'v3.0.0', items: [{ created: '2026-07-25T13:00:00Z', dockerImageReference: 'sha256:5e8df9e82c1b4e...', size: '39.6 MB' }] },
          { tag: 'v2.9.8', items: [{ created: '2026-07-15T10:10:00Z', dockerImageReference: 'sha256:6f8df9e82c1b4e...', size: '38.4 MB' }] },
          { tag: 'latest', items: [{ created: '2026-08-25T14:20:00Z', dockerImageReference: 'sha256:4a8df9e82c1b4e...', size: '42.8 MB' }] },
          { tag: 'stage', items: [{ created: '2026-08-20T17:40:00Z', dockerImageReference: 'sha256:7a8df9e82c1b4e...', size: '42.1 MB' }] }
        ]
      }
    },
    extra: {
      dockerRepo: 'image-registry.openshift-image-registry.svc:5000/production-apps/web-frontend',
      tags: [
        { name: 'v3.3.0', created: '2026-08-25T14:20:00Z', digest: 'sha256:4a8df9e8...', size: '42.8 MB', isSemver: true, semver: '3.3.0' },
        { name: 'v3.2.1', created: '2026-08-22T09:12:00Z', digest: 'sha256:1a8df9e8...', size: '42.5 MB', isSemver: true, semver: '3.2.1' },
        { name: 'v3.2.0', created: '2026-08-18T11:45:00Z', digest: 'sha256:2b8df9e8...', size: '41.9 MB', isSemver: true, semver: '3.2.0' },
        { name: 'v3.1.5', created: '2026-08-10T16:30:00Z', digest: 'sha256:3c8df9e8...', size: '41.2 MB', isSemver: true, semver: '3.1.5' },
        { name: 'v3.1.0', created: '2026-08-01T08:15:00Z', digest: 'sha256:4d8df9e8...', size: '40.8 MB', isSemver: true, semver: '3.1.0' },
        { name: 'v3.0.0', created: '2026-07-25T13:00:00Z', digest: 'sha256:5e8df9e8...', size: '39.6 MB', isSemver: true, semver: '3.0.0' },
        { name: 'latest', created: '2026-08-25T14:20:00Z', digest: 'sha256:4a8df9e8...', size: '42.8 MB', isSemver: false },
        { name: 'stage', created: '2026-08-20T17:40:00Z', digest: 'sha256:7a8df9e8...', size: '42.1 MB', isSemver: false }
      ]
    }
  }
];

const mockHelmReleases = [
  {
    id: 'cert-manager',
    name: 'cert-manager',
    namespace: 'production-apps',
    kind: 'helm',
    status: 'deployed',
    statusColor: 'green',
    age: '24d',
    extra: {
      revision: '3',
      updated: '2026-08-12 11:34:02 UTC',
      chart: 'cert-manager-v1.14.4',
      appVersion: 'v1.14.4',
      description: 'Upgrade complete'
    }
  },
  {
    id: 'redis-ha-cluster',
    name: 'redis-ha-cluster',
    namespace: 'production-apps',
    kind: 'helm',
    status: 'deployed',
    statusColor: 'green',
    age: '18d',
    extra: {
      revision: '5',
      updated: '2026-08-18 09:20:11 UTC',
      chart: 'redis-18.1.3',
      appVersion: '7.2.4',
      description: 'Helm release updated'
    }
  }
];

const mockTopology = {
  namespace: 'production-apps',
  workloads: [
    {
      id: 'web-frontend',
      name: 'web-frontend',
      namespace: 'production-apps',
      kind: 'deployments',
      status: 'Running',
      statusColor: 'green',
      desiredReplicas: 3,
      readyReplicas: 3,
      podCount: 3,
      images: ['image-registry.openshift-image-registry.svc:5000/production-apps/web-frontend:v3.3.0'],
      appName: 'frontend-stack',
      routes: [{ name: 'web-frontend-route', host: 'app.chiscari.ro', url: 'https://app.chiscari.ro', tls: true }],
      services: [{ name: 'web-frontend-svc', type: 'ClusterIP', clusterIP: '172.30.45.101', ports: '80/TCP -> 8080' }],
      pvcs: [],
      pods: [
        { name: 'web-frontend-7f98b594b9-8p2xl', status: 'Running', statusColor: 'green', ready: '1/1', restarts: 0 },
        { name: 'web-frontend-7f98b594b9-q9kzt', status: 'Running', statusColor: 'green', ready: '1/1', restarts: 0 },
        { name: 'web-frontend-7f98b594b9-m7v4c', status: 'Running', statusColor: 'green', ready: '1/1', restarts: 0 }
      ],
      age: '12d'
    },
    {
      id: 'api-gateway',
      name: 'api-gateway',
      namespace: 'production-apps',
      kind: 'deployments',
      status: 'Running',
      statusColor: 'green',
      desiredReplicas: 2,
      readyReplicas: 2,
      podCount: 2,
      images: ['image-registry.openshift-image-registry.svc:5000/production-apps/api-gateway:v2.8.4'],
      appName: 'backend-stack',
      routes: [{ name: 'api-gateway-route', host: 'api.chiscari.ro', url: 'https://api.chiscari.ro', tls: true }],
      services: [{ name: 'api-gateway-svc', type: 'ClusterIP', clusterIP: '172.30.88.220', ports: '443/TCP -> 3000' }],
      pvcs: [],
      pods: [
        { name: 'api-gateway-5c4d7967b5-2v4lk', status: 'Running', statusColor: 'green', ready: '2/2', restarts: 1 }
      ],
      age: '12d'
    },
    {
      id: 'redis-cache',
      name: 'redis-cache',
      namespace: 'production-apps',
      kind: 'statefulsets',
      status: 'Running',
      statusColor: 'green',
      desiredReplicas: 1,
      readyReplicas: 1,
      podCount: 1,
      images: ['docker.io/library/redis:7.2.4-alpine'],
      appName: 'cache-stack',
      routes: [],
      services: [{ name: 'redis-cache-svc', type: 'ClusterIP', clusterIP: '172.30.12.50', ports: '6379/TCP' }],
      pvcs: [{ name: 'redis-data-pvc', status: 'Bound', capacity: '10Gi', storageClass: 'gp3-csi' }],
      pods: [
        { name: 'redis-cache-0', status: 'Running', statusColor: 'green', ready: '1/1', restarts: 0 }
      ],
      age: '14d'
    }
  ],
  standaloneServices: [],
  standaloneRoutes: [],
  standalonePvcs: []
};

// Setup Electron IPC Handlers
ipcMain.handle('kube:getContexts', async () => ({ contexts: mockContexts, currentContext: 'ocp-prod-cluster-01' }));
ipcMain.handle('kube:switchContext', async () => true);
ipcMain.handle('kube:getProjects', async () => mockProjects);
ipcMain.handle('kube:getCurrentNamespace', async () => 'production-apps');
ipcMain.handle('kube:switchProject', async () => true);
ipcMain.handle('kube:getClusterInfo', async () => ({
  version: 'OpenShift v4.16.8 (Kubernetes v1.29.6)',
  apiServer: 'https://api.ocp-prod.chiscari.ro:6443',
  user: 'admin-alex'
}));
ipcMain.handle('kube:getTopologyData', async () => ({ data: mockTopology }));
ipcMain.handle('kube:getResources', async (_event, kind) => {
  if (kind === 'pods') return { items: mockPods };
  if (kind === 'deployments') return { items: mockDeployments };
  if (kind === 'imagestreams') return { items: mockImageStreams };
  if (kind === 'helm') return { items: mockHelmReleases };
  return { items: mockPods };
});
ipcMain.handle('helm:getValues', async () => `# User Values for cert-manager
installCRDs: true
replicaCount: 2
prometheus:
  enabled: true
  servicemonitor:
    enabled: true
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 256Mi
webhook:
  replicaCount: 2
cainjector:
  replicaCount: 2
`);
ipcMain.handle('helm:getManifest', async () => `# Manifest for cert-manager release
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cert-manager
  namespace: production-apps
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cert-manager
`);
ipcMain.handle('helm:getHistory', async () => [
  { revision: 3, updated: '2026-08-12 11:34:02 UTC', status: 'deployed', chart: 'cert-manager-v1.14.4', appVersion: 'v1.14.4', description: 'Upgrade complete' },
  { revision: 2, updated: '2026-08-01 09:15:20 UTC', status: 'superseded', chart: 'cert-manager-v1.14.2', appVersion: 'v1.14.2', description: 'Values update' },
  { revision: 1, updated: '2026-07-20 14:02:10 UTC', status: 'superseded', chart: 'cert-manager-v1.14.0', appVersion: 'v1.14.0', description: 'Initial install' }
]);
ipcMain.handle('kube:getYaml', async (_event, kind, name) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: production-apps
  labels:
    app: ${name}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      containers:
      - name: app
        image: image-registry.openshift-image-registry.svc:5000/production-apps/${name}:v3.3.0
        ports:
        - containerPort: 8080
`);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function capture() {
  console.log('📸 Launching Electron Screenshot Automation Window...');
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    show: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(ROOT_DIR, 'dist', 'main', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    }
  });

  await win.loadFile(path.join(ROOT_DIR, 'dist', 'renderer', 'index.html'));
  await sleep(1500);

  // 1. Capture Topology Overview
  console.log('📷 1/7 Capturing Topology Overview...');
  let image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'overview-topology.png'), image.toPNG());

  // 2. Switch to Pods Resource Table
  console.log('📷 2/7 Capturing Resource Table (Pods & Action Suggestions)...');
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pods'));
      if (btn) btn.click();
    })()
  `);
  await sleep(600);
  image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'resource-table.png'), image.toPNG());

  // 3. Switch to ImageStreams & Open SemVer Tag Wizard
  console.log('📷 3/7 Capturing ImageStream SemVer Tag Cleaner Wizard...');
  await win.webContents.executeJavaScript(`
    (() => {
      const isTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ImageStreams'));
      if (isTab) isTab.click();
    })()
  `);
  await sleep(600);
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('button[aria-label="SemVer Tag Cleanup Wizard"]') || 
                  document.querySelector('button[title*="SemVer"]') ||
                  document.querySelector('tbody tr button');
      if (btn) btn.click();
    })()
  `);
  await sleep(700);
  image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'imagestream-semver.png'), image.toPNG());

  // Close modal
  await win.webContents.executeJavaScript(`
    (() => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
      document.dispatchEvent(esc);
    })()
  `);
  await sleep(400);

  // 4. Switch to Helm Releases & Open Helm Manager Modal
  console.log('📷 4/7 Capturing Helm Release Manager...');
  await win.webContents.executeJavaScript(`
    (() => {
      const helmTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Helm'));
      if (helmTab) helmTab.click();
    })()
  `);
  await sleep(600);
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('button[aria-label="Manage Helm Release"]') || 
                  document.querySelector('button[title*="Helm"]') ||
                  document.querySelector('tbody tr button');
      if (btn) btn.click();
    })()
  `);
  await sleep(800);
  image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'helm-manager.png'), image.toPNG());

  // Close modal
  await win.webContents.executeJavaScript(`
    (() => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
      document.dispatchEvent(esc);
    })()
  `);
  await sleep(400);

  // 5. Open NetworkPolicy Designer Modal
  console.log('📷 5/7 Capturing Visual NetworkPolicy Designer...');
  await win.webContents.executeJavaScript(`
    (() => {
      const netpolTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('NetworkPolicies'));
      if (netpolTab) netpolTab.click();
    })()
  `);
  await sleep(500);
  await win.webContents.executeJavaScript(`
    (() => {
      const designerBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Designer') || b.textContent.includes('Create') || b.textContent.includes('Design'));
      if (designerBtn) designerBtn.click();
    })()
  `);
  await sleep(700);
  image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'network-policy-designer.png'), image.toPNG());

  // Close modal
  await win.webContents.executeJavaScript(`
    (() => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
      document.dispatchEvent(esc);
    })()
  `);
  await sleep(400);

  // 6. Open Add Application Wizard
  console.log('📷 6/7 Capturing Add Application 6-in-1 Wizard...');
  await win.webContents.executeJavaScript(`
    (() => {
      const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('+ Add') || b.textContent.includes('Add Application') || b.textContent.includes('Add to Project') || b.textContent.includes('WORKLOAD'));
      if (addBtn) addBtn.click();
    })()
  `);
  await sleep(700);
  image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'add-app-wizard.png'), image.toPNG());

  // Close modal
  await win.webContents.executeJavaScript(`
    (() => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
      document.dispatchEvent(esc);
    })()
  `);
  await sleep(400);

  // 7. Open Context & Project Switcher Modal
  console.log('📷 7/7 Capturing Context & Cluster Switcher...');
  await win.webContents.executeJavaScript(`
    (() => {
      const ctxBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('CONTEXT') || b.textContent.includes('ocp-prod'));
      if (ctxBtn) ctxBtn.click();
    })()
  `);
  await sleep(700);
  image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'context-switcher.png'), image.toPNG());

  console.log('\n✨ All screenshots captured successfully in docs/screenshots/!\n');
  app.quit();
}

app.whenReady().then(capture);
