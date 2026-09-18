import fs from 'node:fs';
import electron from 'electron';
import { KubeConfigService } from '../services/kubeconfig.js';
import { OcClient } from '../services/oc-client.js';
import { HelmService } from '../services/helm.js';
import { LogStreamer, LogEntry } from '../services/log-streamer.js';
import { TerminalService } from '../services/terminal-service.js';
import { PortForwardService } from '../services/port-forward-service.js';
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

  ipcMain.handle('kube:getServers', async () => {
    return await KubeConfigService.getServers();
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

  ipcMain.handle('kube:getResourceCounts', async (_event, namespace: string) => {
    return await OcClient.getResourceCounts(namespace);
  });

  ipcMain.handle('kube:preloadAllResources', async (_event, namespace: string, activeKind?: ResourceKind) => {
    return await OcClient.preloadAllResources(namespace, activeKind);
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

  ipcMain.handle('kube:deleteMultiplePods', async (_event, podNames: string[], namespace: string) => {
    return await OcClient.deleteMultiplePods(podNames, namespace);
  });

  ipcMain.handle('kube:deleteImageStreamTag', async (_event, isName: string, tag: string, namespace: string) => {
    return await OcClient.deleteImageStreamTag(isName, tag, namespace);
  });

  ipcMain.handle('kube:getWorkloadDetails', async (_event, kind: ResourceKind, name: string, namespace: string) => {
    return await OcClient.getWorkloadDetails(kind, name, namespace);
  });

  ipcMain.handle('kube:getTopologyData', async (_event, namespace: string) => {
    return await OcClient.getTopologyData(namespace);
  });

  ipcMain.handle('secret:getData', async (_event, name: string, namespace: string) => {
    return await OcClient.getSecretData(name, namespace);
  });

  ipcMain.handle('secret:save', async (_event, name: string, namespace: string, data: Record<string, string>, type?: string) => {
    return await OcClient.saveSecret(name, namespace, data, type);
  });

  ipcMain.handle('pvc:resize', async (_event, name: string, namespace: string, newSize: string) => {
    return await OcClient.resizePvc(name, namespace, newSize);
  });

  ipcMain.handle('crd:getInstances', async (_event, crdName: string, namespace: string) => {
    return await OcClient.getCrdInstances(crdName, namespace);
  });

  // Cluster Operator Events Handler
  ipcMain.handle('operator:getEvents', async (_event, operatorName: string) => {
    return await OcClient.getClusterOperatorEvents(operatorName);
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

    let pendingLines: LogEntry[] = [];
    let flushTimer: NodeJS.Timeout | null = null;

    const flushLogs = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingLines.length > 0 && !mainWindow.isDestroyed()) {
        const batch = pendingLines;
        pendingLines = [];
        mainWindow.webContents.send('logs:line', { streamId, lines: batch });
      }
    };

    streamer.on('lines', (batch: LogEntry[]) => {
      for (let i = 0; i < batch.length; i++) {
        pendingLines.push(batch[i]);
      }
      if (pendingLines.length >= 40) {
        flushLogs();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushLogs, 25);
      }
    });

    streamer.on('line', (entry: LogEntry) => {
      if (pendingLines.length === 0 && !flushTimer) {
        pendingLines.push(entry);
        flushTimer = setTimeout(flushLogs, 25);
      }
    });

    streamer.on('end', () => {
      flushLogs();
    });

    streamer.on('error', (err: Error) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('logs:line', {
          streamId,
          lines: [
            {
              id: Date.now(),
              pod: targetName,
              raw: `[Log Error: ${err.message || 'Stream failed'}]`,
            },
          ],
        });
      }
      flushLogs();
    });

    streamer.start().catch((err: Error) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('logs:line', {
          streamId,
          lines: [
            {
              id: Date.now(),
              pod: targetName,
              raw: `[Failed to start log stream: ${err.message || 'Unknown error'}]`,
            },
          ],
        });
      }
    });
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

  // Debug Diagnostics Handlers
  ipcMain.handle('debug:getPodInfo', async (_event, podName: string, namespace: string) => {
    return await OcClient.getPodDebugInfo(podName, namespace);
  });

  ipcMain.handle('debug:getNodeInfo', async (_event, nodeName: string) => {
    return await OcClient.getNodeDebugInfo(nodeName);
  });

  ipcMain.handle('kube:getPodContainers', async (_event, podName: string, namespace: string) => {
    return await OcClient.getPodContainers(podName, namespace);
  });

  // Interactive Terminal Handlers (Supports Pod Exec, Pod Debug replica, and Node Host Debugger)
  ipcMain.handle('terminal:start', async (_event, targetName: string, namespace: string, container?: string, mode: 'exec' | 'debug-pod' | 'debug-node' = 'exec') => {
    return TerminalService.startSession(targetName, namespace, container, mainWindow, mode);
  });

  ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string) => {
    TerminalService.writeData(sessionId, data);
  });

  ipcMain.handle('terminal:resize', async (_event, sessionId: string, cols: number, rows: number) => {
    TerminalService.resize(sessionId, cols, rows);
  });

  ipcMain.handle('terminal:stop', async (_event, sessionId: string) => {
    TerminalService.stopSession(sessionId);
  });

  // External System Default Terminal
  ipcMain.handle('terminal:openExternal', async (_event, targetName: string, namespace: string, container?: string) => {
    return await TerminalService.openInDefaultTerminal(targetName, namespace, container);
  });

  // Complete Log Retrieval & File Download
  ipcMain.handle('logs:getComplete', async (_event, targetName: string, namespace: string, kind?: string, container?: string) => {
    return await OcClient.getCompleteLogs(targetName, namespace, kind, container);
  });

  ipcMain.handle('logs:downloadComplete', async (_event, targetName: string, namespace: string, kind?: string, container?: string) => {
    const res = await OcClient.getCompleteLogs(targetName, namespace, kind, container);
    const { canceled, filePath } = await electron.dialog.showSaveDialog(mainWindow, {
      title: `Save Logs for ${targetName}`,
      defaultPath: res.fileName,
      filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
    });
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, res.logs, 'utf8');
      return { success: true, filePath, lineCount: res.lineCount, message: `Successfully saved ${res.lineCount} lines to ${filePath}` };
    }
    return { success: false, message: 'Download cancelled by user' };
  });

  // Port Forwarding Handlers
  ipcMain.handle('portforward:getPorts', async (_event, kind: string, name: string, namespace: string) => {
    return await PortForwardService.getAvailablePorts(kind, name, namespace);
  });

  ipcMain.handle('portforward:start', async (_event, kind: any, name: string, namespace: string, localPort: number, targetPort: number | string) => {
    return await PortForwardService.startPortForward(kind, name, namespace, localPort, targetPort);
  });

  ipcMain.handle('portforward:stop', async (_event, sessionId: string) => {
    return PortForwardService.stopPortForward(sessionId);
  });

  ipcMain.handle('portforward:stopAll', async () => {
    PortForwardService.stopAll();
    return true;
  });

  ipcMain.handle('portforward:list', async () => {
    return PortForwardService.listSessions();
  });

  // Image Registry Pruner Handlers
  ipcMain.handle('kube:pruneImages', async (_event, options: any) => {
    return await OcClient.pruneImages(options || {});
  });

  ipcMain.handle('kube:getImagePrunerCronJobYaml', async (_event, options: any) => {
    return OcClient.getImagePrunerCronJobYaml(options || {});
  });

  ipcMain.handle('kube:getRegistryUrl', async () => {
    return await OcClient.getRegistryUrl();
  });

  // KubeContext Cleaning and Management Handlers
  ipcMain.handle('kube:cleanContexts', async (_event, options: any) => {
    return await KubeConfigService.cleanContexts(options || {});
  });

  ipcMain.handle('kube:deleteContext', async (_event, contextName: string, pruneDangling?: boolean) => {
    return await KubeConfigService.deleteContext(contextName, pruneDangling ?? true);
  });

  ipcMain.handle('kube:login', async (_event, options: any) => {
    return await KubeConfigService.loginCluster(options || {});
  });

  ipcMain.handle('kube:importConfig', async (_event, yamlContent: string, setActive?: boolean) => {
    return await KubeConfigService.importKubeConfig(yamlContent, { setActive: setActive !== false });
  });

  ipcMain.handle('kube:testConnection', async () => {
    return await KubeConfigService.testConnection();
  });
}

