import { contextBridge, ipcRenderer } from 'electron';

export interface IpcApi {
  getContexts: () => Promise<{ contexts: any[]; currentContext: string | null }>;
  switchContext: (contextName: string) => Promise<boolean>;
  getProjects: () => Promise<any[]>;
  getCurrentNamespace: () => Promise<string>;
  switchProject: (projectName: string) => Promise<boolean>;
  getClusterInfo: () => Promise<any>;
  getResources: (kind: string, namespace: string) => Promise<any[]>;
  describeResource: (kind: string, name: string, namespace: string) => Promise<string>;
  getYaml: (kind: string, name: string, namespace: string) => Promise<string>;
  scaleResource: (kind: string, name: string, namespace: string, replicas: number) => Promise<{ success: boolean; message: string }>;
  rolloutRestart: (kind: string, name: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  deleteResource: (kind: string, name: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  deleteImageStreamTag: (isName: string, tag: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  getHelmValues: (releaseName: string, namespace: string) => Promise<string>;
  getHelmManifest: (releaseName: string, namespace: string) => Promise<string>;
  getHelmHistory: (releaseName: string, namespace: string) => Promise<any[]>;
  rollbackHelm: (releaseName: string, revision: string | number, namespace: string) => Promise<{ success: boolean; message: string }>;
  uninstallHelm: (releaseName: string, namespace: string) => Promise<{ success: boolean; message: string }>;
  startLogStream: (podName: string, namespace: string, container?: string) => Promise<string>;
  stopLogStream: (streamId: string) => Promise<void>;
  onLogLine: (callback: (data: { streamId: string; line: any }) => void) => () => void;
}

const api: IpcApi = {
  getContexts: () => ipcRenderer.invoke('kube:getContexts'),
  switchContext: (ctx) => ipcRenderer.invoke('kube:switchContext', ctx),
  getProjects: () => ipcRenderer.invoke('kube:getProjects'),
  getCurrentNamespace: () => ipcRenderer.invoke('kube:getCurrentNamespace'),
  switchProject: (proj) => ipcRenderer.invoke('kube:switchProject', proj),
  getClusterInfo: () => ipcRenderer.invoke('kube:getClusterInfo'),
  getResources: (kind, ns) => ipcRenderer.invoke('kube:getResources', kind, ns),
  describeResource: (kind, name, ns) => ipcRenderer.invoke('kube:describeResource', kind, name, ns),
  getYaml: (kind, name, ns) => ipcRenderer.invoke('kube:getYaml', kind, name, ns),
  scaleResource: (kind, name, ns, replicas) => ipcRenderer.invoke('kube:scaleResource', kind, name, ns, replicas),
  rolloutRestart: (kind, name, ns) => ipcRenderer.invoke('kube:rolloutRestart', kind, name, ns),
  deleteResource: (kind, name, ns) => ipcRenderer.invoke('kube:deleteResource', kind, name, ns),
  deleteImageStreamTag: (isName, tag, ns) => ipcRenderer.invoke('kube:deleteImageStreamTag', isName, tag, ns),
  getHelmValues: (rel, ns) => ipcRenderer.invoke('helm:getValues', rel, ns),
  getHelmManifest: (rel, ns) => ipcRenderer.invoke('helm:getManifest', rel, ns),
  getHelmHistory: (rel, ns) => ipcRenderer.invoke('helm:getHistory', rel, ns),
  rollbackHelm: (rel, rev, ns) => ipcRenderer.invoke('helm:rollback', rel, rev, ns),
  uninstallHelm: (rel, ns) => ipcRenderer.invoke('helm:uninstall', rel, ns),
  startLogStream: (pod, ns, container) => ipcRenderer.invoke('logs:startStream', pod, ns, container),
  stopLogStream: (streamId) => ipcRenderer.invoke('logs:stopStream', streamId),
  onLogLine: (callback) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('logs:line', handler);
    return () => ipcRenderer.removeListener('logs:line', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
