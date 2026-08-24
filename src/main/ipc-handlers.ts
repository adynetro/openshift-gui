import { ipcMain, BrowserWindow } from 'electron';
import { KubeConfigService } from '../services/kubeconfig.js';
import { OcClient } from '../services/oc-client.js';
import { HelmService } from '../services/helm.js';
import { LogStreamer, LogEntry } from '../services/log-streamer.js';
import { ResourceKind } from '../types/k8s.js';

const activeStreamers = new Map<string, LogStreamer>();

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Demo Mode
  ipcMain.handle('kube:setDemoMode', async (_event, enabled: boolean) => {
    OcClient.isDemoMode = enabled;
    KubeConfigService.isDemoMode = enabled;
    HelmService.isDemoMode = enabled;
    return enabled;
  });

  ipcMain.handle('kube:getDemoMode', async () => {
    return OcClient.isDemoMode;
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

  // Log Stream Handlers
  ipcMain.handle('logs:startStream', async (_event, podName: string, namespace: string, container?: string) => {
    const streamId = `${namespace}/${podName}/${container || 'default'}-${Date.now()}`;
    const streamer = new LogStreamer(podName, namespace, container, 200);

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
