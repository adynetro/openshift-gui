import electron from 'electron';
import { KubeConfigService } from '../services/kubeconfig.js';
import { OcClient } from '../services/oc-client.js';
import { HelmService } from '../services/helm.js';
import { LogStreamer, LogEntry } from '../services/log-streamer.js';
import { ResourceKind } from '../types/k8s.js';

const { ipcMain, shell } = electron;
const activeStreamers = new Map<string, LogStreamer>();

export function registerIpcHandlers(mainWindow: electron.BrowserWindow): void {
  // External Browser Link Handler
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  // Kubeconfig / Cluster Handlers
  ipcMain.handle('kube:getContexts', async () => {
    return await KubeConfigService.getContexts();
  });

  ipcMain.handle('kube:switchContext', async (_event, contextName: string) => {
    return await KubeConfigService.switchContext(contextName);
  });

  ipcMain.handle('kube:getProjects', async () => {
    return await KubeConfigService.getProjects();
  });

  ipcMain.handle('kube:getCurrentNamespace', async () => {
    return await KubeConfigService.getCurrentNamespace();
  });

  ipcMain.handle('kube:switchProject', async (_event, projectName: string) => {
    return await KubeConfigService.switchProject(projectName);
  });

  ipcMain.handle('kube:getClusterInfo', async () => {
    return await KubeConfigService.getClusterInfo();
  });

  // Resource Handlers
  ipcMain.handle('kube:getResources', async (_event, kind: ResourceKind, namespace: string) => {
    if (kind === 'helm') {
      return await HelmService.getReleases(namespace);
    }
    return await OcClient.getResources(kind, namespace);
  });

  ipcMain.handle('kube:describeResource', async (_event, kind: string, name: string, namespace: string) => {
    return await OcClient.describe(kind, name, namespace);
  });

  ipcMain.handle('kube:getYaml', async (_event, kind: string, name: string, namespace: string) => {
    return await OcClient.getYaml(kind, name, namespace);
  });

  ipcMain.handle('kube:applyYaml', async (_event, yamlContent: string, namespace: string) => {
    return await OcClient.applyYaml(yamlContent, namespace);
  });

  ipcMain.handle('kube:prunePods', async (_event, namespace: string, targetStatuses?: string[]) => {
    return await OcClient.prunePods(namespace, targetStatuses);
  });

  ipcMain.handle('kube:scaleResource', async (_event, kind: string, name: string, namespace: string, replicas: number) => {
    return await OcClient.scale(kind, name, namespace, replicas);
  });

  ipcMain.handle('kube:rolloutRestart', async (_event, kind: string, name: string, namespace: string) => {
    return await OcClient.rolloutRestart(kind, name, namespace);
  });

  ipcMain.handle('kube:deleteResource', async (_event, kind: string, name: string, namespace: string) => {
    return await OcClient.deleteResource(kind, name, namespace);
  });

  ipcMain.handle('kube:deleteImageStreamTag', async (_event, isName: string, tag: string, namespace: string) => {
    return await OcClient.deleteImageStreamTag(isName, tag, namespace);
  });

  // Helm Handlers
  ipcMain.handle('helm:getValues', async (_event, releaseName: string, namespace: string) => {
    return await HelmService.getValues(releaseName, namespace);
  });

  ipcMain.handle('helm:upgradeValues', async (_event, releaseName: string, valuesYaml: string, namespace: string) => {
    return await HelmService.upgradeValues(releaseName, valuesYaml, namespace);
  });

  ipcMain.handle('helm:getManifest', async (_event, releaseName: string, namespace: string) => {
    return await HelmService.getManifest(releaseName, namespace);
  });

  ipcMain.handle('helm:getHistory', async (_event, releaseName: string, namespace: string) => {
    return await HelmService.getHistory(releaseName, namespace);
  });

  ipcMain.handle('helm:rollback', async (_event, releaseName: string, revision: string | number, namespace: string) => {
    return await HelmService.rollback(releaseName, revision, namespace);
  });

  ipcMain.handle('helm:uninstall', async (_event, releaseName: string, namespace: string) => {
    return await HelmService.uninstall(releaseName, namespace);
  });

  // Log Stream Handlers with Multi-Pod Workload Aggregation Support
  ipcMain.handle('logs:startStream', async (_event, targetName: string, namespace: string, kind: string = 'pods', container?: string) => {
    const streamId = `${namespace}/${kind}/${targetName}/${container || 'all'}-${Date.now()}`;
    const streamer = new LogStreamer(targetName, namespace, kind, container, 250);

    streamer.on('line', (entry: LogEntry) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('logs:line', { streamId, line: entry });
      }
    });

    streamer.start();
    activeStreamers.set(streamId, streamer);
    return streamId;
  });

  ipcMain.handle('logs:stopStream', async (_event, streamId: string) => {
    const streamer = activeStreamers.get(streamId);
    if (streamer) {
      streamer.stop();
      activeStreamers.delete(streamId);
    }
  });
}
