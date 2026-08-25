import { contextBridge, ipcRenderer } from 'electron';

export interface IpcApi {
  openExternal: (url: string) => Promise<void>;
  getContexts: () => Promise<{ contexts: any[]; currentContext: string | null }>;
  switchContext: (contextName: string) => Promise<boolean>;
  getProjects: () => Promise<any[]>;
  getCurrentNamespace: () => Promise<string>;
  switchProject: (projectName: string) => Promise<boolean>;
  getClusterInfo: () => Promise<any>;
  getResources: (kind: string, namespace: string) => Promise<{ items: any[]; error?: string; isUnauthorized?: boolean }>;
  describeResource: (kind: string, name: string, namespace: string) => Promise<string>;
  getYaml: (kind: string, name: string, namespace: string) => Promise<string>;
  applyYaml: (yamlContent: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  prunePods: (namespace: string, targetStatuses?: string[]) => Promise<{ success: boolean; count: number; deleted: string[]; message: string }>;
  scaleResource: (kind: string, name: string, namespace: string, replicas: number) => Promise<{ success: boolean; message: string }>;
  rolloutRestart: (kind: string, name: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  deleteResource: (kind: string, name: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  deleteMultiplePods: (podNames: string[], namespace: string) => Promise<{ success: boolean; deleted: string[]; failed: string[]; message: string }>;
  deleteImageStreamTag: (isName: string, tag: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  getWorkloadDetails: (kind: string, name: string, namespace: string) => Promise<{ details?: any; error?: string }>;
  getTopologyData: (namespace: string) => Promise<{ data?: any; error?: string }>;
  getSecretData: (name: string, namespace: string) => Promise<{ data?: Record<string, string>; type?: string; error?: string }>;
  saveSecret: (name: string, namespace: string, data: Record<string, string>, type?: string) => Promise<{ success: boolean; message: string }>;
  resizePvc: (name: string, namespace: string, newSize: string) => Promise<{ success: boolean; message: string }>;
  getCrdInstances: (crdName: string, namespace: string) => Promise<{ items: any[]; scope?: string; crdKind?: string; group?: string; error?: string }>;
  getClusterOperatorEvents: (operatorName: string) => Promise<{ operatorName: string; version?: string; status?: string; conditions: any[]; events: any[]; relatedObjects?: any[]; error?: string }>;
  getHelmValues: (releaseName: string, namespace: string) => Promise<string>;
  upgradeHelmValues: (releaseName: string, valuesYaml: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  getHelmManifest: (releaseName: string, namespace: string) => Promise<string>;
  getHelmHistory: (releaseName: string, namespace: string) => Promise<any[]>;
  rollbackHelm: (releaseName: string, revision: string | number, namespace: string) => Promise<{ success: boolean; message: string }>;
  uninstallHelm: (releaseName: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  startLogStream: (targetName: string, namespace: string, kind?: string, container?: string) => Promise<string>;
  stopLogStream: (streamId: string) => Promise<void>;
  onLogLine: (callback: (data: { streamId: string; line: any }) => void) => () => void;
  startTerminal: (targetName: string, namespace: string, container?: string, mode?: 'exec' | 'debug-pod' | 'debug-node') => Promise<string>;
  writeTerminal: (sessionId: string, data: string) => Promise<void>;
  stopTerminal: (sessionId: string) => Promise<void>;
  onTerminalData: (callback: (data: { sessionId: string; data: string }) => void) => () => void;
  getPodDebugInfo: (podName: string, namespace: string) => Promise<{ diagnostics?: any; error?: string }>;
  getNodeDebugInfo: (nodeName: string) => Promise<{ diagnostics?: any; error?: string }>;
  pruneImages: (options: {
    keepTagRevisions?: number;
    keepYoungerThan?: string;
    confirm?: boolean;
    all?: boolean;
    ignoreInvalidRefs?: boolean;
    registryUrl?: string;
  }) => Promise<{ success: boolean; stdout: string; stderr: string; message: string; isDryRun: boolean }>;
  getImagePrunerCronJobYaml: (options: {
    schedule?: string;
    keepTagRevisions?: number;
    keepYoungerThan?: string;
    namespace?: string;
    registryUrl?: string;
  }) => Promise<string>;
  getRegistryUrl: () => Promise<string>;
  cleanContexts: (options: {
    keepActiveOnly?: boolean;
    contextNamesToDelete?: string[];
    contextNamesToKeep?: string[];
    pruneDangling?: boolean;
  }) => Promise<{
    success: boolean;
    backupPath?: string;
    deletedContexts: string[];
    deletedClusters: string[];
    deletedUsers: string[];
    remainingContexts: string[];
    message: string;
  }>;
  deleteContext: (contextName: string, pruneDangling?: boolean) => Promise<{
    success: boolean;
    backupPath?: string;
    deletedContexts: string[];
    deletedClusters: string[];
    deletedUsers: string[];
    remainingContexts: string[];
    message: string;
  }>;
}

const api: IpcApi = {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  getContexts: () => ipcRenderer.invoke('kube:getContexts'),
  switchContext: (ctx) => ipcRenderer.invoke('kube:switchContext', ctx),
  getProjects: () => ipcRenderer.invoke('kube:getProjects'),
  getCurrentNamespace: () => ipcRenderer.invoke('kube:getCurrentNamespace'),
  switchProject: (proj) => ipcRenderer.invoke('kube:switchProject', proj),
  getClusterInfo: () => ipcRenderer.invoke('kube:getClusterInfo'),
  getResources: (kind, ns) => ipcRenderer.invoke('kube:getResources', kind, ns),
  describeResource: (kind, name, ns) => ipcRenderer.invoke('kube:describeResource', kind, name, ns),
  getYaml: (kind, name, ns) => ipcRenderer.invoke('kube:getYaml', kind, name, ns),
  applyYaml: (yaml, ns) => ipcRenderer.invoke('kube:applyYaml', yaml, ns),
  prunePods: (ns, statuses) => ipcRenderer.invoke('kube:prunePods', ns, statuses),
  scaleResource: (kind, name, ns, replicas) => ipcRenderer.invoke('kube:scaleResource', kind, name, ns, replicas),
  rolloutRestart: (kind, name, ns) => ipcRenderer.invoke('kube:rolloutRestart', kind, name, ns),
  deleteResource: (kind, name, ns) => ipcRenderer.invoke('kube:deleteResource', kind, name, ns),
  deleteMultiplePods: (podNames, ns) => ipcRenderer.invoke('kube:deleteMultiplePods', podNames, ns),
  deleteImageStreamTag: (isName, tag, ns) => ipcRenderer.invoke('kube:deleteImageStreamTag', isName, tag, ns),
  getWorkloadDetails: (kind, name, ns) => ipcRenderer.invoke('kube:getWorkloadDetails', kind, name, ns),
  getTopologyData: (ns) => ipcRenderer.invoke('kube:getTopologyData', ns),
  getSecretData: (name, ns) => ipcRenderer.invoke('secret:getData', name, ns),
  saveSecret: (name, ns, data, type) => ipcRenderer.invoke('secret:save', name, ns, data, type),
  resizePvc: (name, ns, size) => ipcRenderer.invoke('pvc:resize', name, ns, size),
  getCrdInstances: (crdName, ns) => ipcRenderer.invoke('crd:getInstances', crdName, ns),
  getClusterOperatorEvents: (operatorName) => ipcRenderer.invoke('operator:getEvents', operatorName),
  getHelmValues: (rel, ns) => ipcRenderer.invoke('helm:getValues', rel, ns),
  upgradeHelmValues: (rel, yaml, ns) => ipcRenderer.invoke('helm:upgradeValues', rel, yaml, ns),
  getHelmManifest: (rel, ns) => ipcRenderer.invoke('helm:getManifest', rel, ns),
  getHelmHistory: (rel, ns) => ipcRenderer.invoke('helm:getHistory', rel, ns),
  rollbackHelm: (rel, rev, ns) => ipcRenderer.invoke('helm:rollback', rel, rev, ns),
  uninstallHelm: (rel, ns) => ipcRenderer.invoke('helm:uninstall', rel, ns),
  startLogStream: (target, ns, kind, container) => ipcRenderer.invoke('logs:startStream', target, ns, kind, container),
  stopLogStream: (streamId) => ipcRenderer.invoke('logs:stopStream', streamId),
  onLogLine: (callback) => {
    const sub = (_e: any, data: any) => callback(data);
    ipcRenderer.on('logs:line', sub);
    return () => ipcRenderer.removeListener('logs:line', sub);
  },
  startTerminal: (target, ns, container, mode) => ipcRenderer.invoke('terminal:start', target, ns, container, mode),
  writeTerminal: (sessionId, data) => ipcRenderer.invoke('terminal:write', sessionId, data),
  stopTerminal: (sessionId) => ipcRenderer.invoke('terminal:stop', sessionId),
  onTerminalData: (callback) => {
    const sub = (_e: any, data: any) => callback(data);
    ipcRenderer.on('terminal:data', sub);
    return () => ipcRenderer.removeListener('terminal:data', sub);
  },
  getPodDebugInfo: (podName, ns) => ipcRenderer.invoke('debug:getPodInfo', podName, ns),
  getNodeDebugInfo: (nodeName) => ipcRenderer.invoke('debug:getNodeInfo', nodeName),
  pruneImages: (options) => ipcRenderer.invoke('kube:pruneImages', options),
  getImagePrunerCronJobYaml: (options) => ipcRenderer.invoke('kube:getImagePrunerCronJobYaml', options),
  getRegistryUrl: () => ipcRenderer.invoke('kube:getRegistryUrl'),
  cleanContexts: (options) => ipcRenderer.invoke('kube:cleanContexts', options),
  deleteContext: (contextName, pruneDangling) => ipcRenderer.invoke('kube:deleteContext', contextName, pruneDangling),
};

contextBridge.exposeInMainWorld('electronAPI', api);
