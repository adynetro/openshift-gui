import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import WebSocket from 'ws';
import { KubeConfigService } from './kubeconfig.js';
import { ResourceKind } from '../types/k8s.js';

export interface ActiveClusterConfig {
  server: string;
  caData?: string;
  caFile?: string;
  insecureSkipTlsVerify?: boolean;
  token?: string;
  clientCertData?: string;
  clientCertFile?: string;
  clientKeyData?: string;
  clientKeyFile?: string;
  namespace?: string;
}

/**
 * Normalizes and builds full URL path for Kubernetes clusters.
 * Properly preserves Rancher path prefixes (e.g. /k8s/clusters/c-m-xxxxx)
 * and OpenShift/k8s API paths without stripping or duplicating segments.
 */
export function buildKubeUrl(
  baseUrl: string,
  apiPath: string
): {
  protocol: string;
  hostname: string;
  port: number;
  pathname: string;
  search: string;
  fullPathWithQuery: string;
  rawUrl: string;
} {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  const cleanApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const fullApiPath = `${basePath}${cleanApiPath}`;

  // Parse path and query
  const queryIndex = fullApiPath.indexOf('?');
  const pathname = queryIndex !== -1 ? fullApiPath.substring(0, queryIndex) : fullApiPath;
  const search = queryIndex !== -1 ? fullApiPath.substring(queryIndex) : '';

  const port = base.port ? parseInt(base.port, 10) : (base.protocol === 'https:' ? 443 : 80);

  return {
    protocol: base.protocol,
    hostname: base.hostname,
    port,
    pathname: pathname || '/',
    search,
    fullPathWithQuery: `${pathname}${search}`,
    rawUrl: `${base.protocol}//${base.hostname}:${port}${pathname}${search}`,
  };
}

/**
 * Endpoint mapper for Kubernetes and OpenShift resources.
 */
export function getResourceApiPath(kind: ResourceKind | string, namespace?: string): string {
  const isAll = !namespace || namespace === 'all-projects' || namespace === '__all__';
  const ns = isAll ? '' : namespace;

  switch (kind) {
    case 'pods':
      return ns ? `/api/v1/namespaces/${ns}/pods` : '/api/v1/pods';
    case 'deployments':
      return ns ? `/apis/apps/v1/namespaces/${ns}/deployments` : '/apis/apps/v1/deployments';
    case 'deploymentconfigs':
    case 'dc':
      return ns ? `/apis/apps.openshift.io/v1/namespaces/${ns}/deploymentconfigs` : '/apis/apps.openshift.io/v1/deploymentconfigs';
    case 'statefulsets':
    case 'sts':
      return ns ? `/apis/apps/v1/namespaces/${ns}/statefulsets` : '/apis/apps/v1/statefulsets';
    case 'daemonsets':
    case 'ds':
      return ns ? `/apis/apps/v1/namespaces/${ns}/daemonsets` : '/apis/apps/v1/daemonsets';
    case 'services':
    case 'svc':
      return ns ? `/api/v1/namespaces/${ns}/services` : '/api/v1/services';
    case 'routes':
      return ns ? `/apis/route.openshift.io/v1/namespaces/${ns}/routes` : '/apis/route.openshift.io/v1/routes';
    case 'ingresses':
    case 'ingress':
      return ns ? `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses` : '/apis/networking.k8s.io/v1/ingresses';
    case 'pvc':
    case 'persistentvolumeclaims':
      return ns ? `/api/v1/namespaces/${ns}/persistentvolumeclaims` : '/api/v1/persistentvolumeclaims';
    case 'pv':
    case 'persistentvolumes':
      return '/api/v1/persistentvolumes';
    case 'configmaps':
    case 'cm':
      return ns ? `/api/v1/namespaces/${ns}/configmaps` : '/api/v1/configmaps';
    case 'secrets':
      return ns ? `/api/v1/namespaces/${ns}/secrets` : '/api/v1/secrets';
    case 'events':
      return ns ? `/api/v1/namespaces/${ns}/events` : '/api/v1/events';
    case 'imagestreams':
    case 'is':
      return ns ? `/apis/image.openshift.io/v1/namespaces/${ns}/imagestreams` : '/apis/image.openshift.io/v1/imagestreams';
    case 'nodes':
      return '/api/v1/nodes';
    case 'crd':
    case 'customresourcedefinitions':
      return '/apis/apiextensions.k8s.io/v1/customresourcedefinitions';
    case 'clusteroperators':
    case 'co':
      return '/apis/config.openshift.io/v1/clusteroperators';
    case 'projects':
      return '/apis/project.openshift.io/v1/projects';
    case 'namespaces':
    case 'ns':
      return '/api/v1/namespaces';
    case 'replicasets':
    case 'rs':
      return ns ? `/apis/apps/v1/namespaces/${ns}/replicasets` : '/apis/apps/v1/replicasets';
    case 'replicationcontrollers':
    case 'rc':
      return ns ? `/api/v1/namespaces/${ns}/replicationcontrollers` : '/api/v1/replicationcontrollers';
    case 'controllerrevisions':
      return ns ? `/apis/apps/v1/namespaces/${ns}/controllerrevisions` : '/apis/apps/v1/controllerrevisions';
    case 'networkpolicies':
    case 'netpol':
      return ns ? `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies` : '/apis/networking.k8s.io/v1/networkpolicies';
    default:
      return ns ? `/api/v1/namespaces/${ns}/${kind}` : `/api/v1/${kind}`;
  }
}

/**
 * Resolves API URL path for any generic Kubernetes / OpenShift resource object
 * by its apiVersion and kind.
 */
export function getApiPathForResource(resource: { apiVersion?: string; kind?: string; metadata?: { namespace?: string; name?: string } }): {
  basePath: string;
  itemPath: string;
} {
  const apiVersion = resource.apiVersion || 'v1';
  const kind = resource.kind || '';
  const namespace = resource.metadata?.namespace;
  const name = resource.metadata?.name || '';

  // Calculate plural name
  let plural = kind.toLowerCase();
  if (plural.endsWith('s') || plural.endsWith('x') || plural.endsWith('z') || plural.endsWith('ch') || plural.endsWith('sh')) {
    plural += 'es';
  } else if (plural.endsWith('y') && !/[aeiou]y$/i.test(plural)) {
    plural = plural.slice(0, -1) + 'ies';
  } else {
    plural += 's';
  }

  // Handle specific well-known plural irregularities
  if (kind.toLowerCase() === 'ingress') plural = 'ingresses';
  if (kind.toLowerCase() === 'networkpolicy') plural = 'networkpolicies';
  if (kind.toLowerCase() === 'customresourcedefinition') plural = 'customresourcedefinitions';
  if (kind.toLowerCase() === 'storageclass') plural = 'storageclasses';

  const isCore = apiVersion === 'v1';
  const root = isCore ? '/api/v1' : `/apis/${apiVersion}`;

  // Cluster-scoped kinds
  const clusterScoped = ['Node', 'Namespace', 'PersistentVolume', 'ClusterRole', 'ClusterRoleBinding', 'CustomResourceDefinition', 'ClusterOperator', 'Project'].includes(kind);

  let basePath: string;
  if (!clusterScoped && namespace) {
    basePath = `${root}/namespaces/${namespace}/${plural}`;
  } else {
    basePath = `${root}/${plural}`;
  }

  const itemPath = name ? `${basePath}/${name}` : basePath;
  return { basePath, itemPath };
}

export class KubeHttpClient {
  private static cachedConfig: ActiveClusterConfig | null = null;
  private static cachedAgent: https.Agent | http.Agent | null = null;
  private static lastConfigCheck = 0;

  /**
   * Resets connection pool and cached cluster config on context switch.
   */
  static reset(): void {
    if (this.cachedAgent && 'destroy' in this.cachedAgent) {
      this.cachedAgent.destroy();
    }
    this.cachedConfig = null;
    this.cachedAgent = null;
    this.lastConfigCheck = 0;
  }

  /**
   * Loads active cluster configuration directly from kubeconfig.
   */
  static async getActiveConfig(): Promise<ActiveClusterConfig | null> {
    const now = Date.now();
    if (this.cachedConfig && now - this.lastConfigCheck < 15000) {
      return this.cachedConfig;
    }

    try {
      const config = await KubeConfigService.getActiveClusterConfig();
      if (!config || !config.server) {
        return null;
      }

      this.cachedConfig = config;
      this.lastConfigCheck = now;
      this.cachedAgent = this.createAgent(config);
      return config;
    } catch {
      return null;
    }
  }

  /**
   * Creates an HTTPS/HTTP Agent configured with CA certificates and client credentials.
   */
  static createAgent(config: ActiveClusterConfig): https.Agent | http.Agent {
    const isHttps = config.server.startsWith('https://');
    if (!isHttps) {
      return new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 60000,
        maxSockets: 100,
        maxFreeSockets: 50,
        timeout: 15000,
      });
    }

    const agentOptions: https.AgentOptions = {
      keepAlive: true,
      keepAliveMsecs: 60000,
      maxSockets: 100,
      maxFreeSockets: 50,
      timeout: 15000,
      rejectUnauthorized: !config.insecureSkipTlsVerify,
    };

    if (config.caData) {
      try {
        agentOptions.ca = Buffer.from(config.caData, 'base64').toString('utf8');
      } catch {}
    } else if (config.caFile && fs.existsSync(config.caFile)) {
      try {
        agentOptions.ca = fs.readFileSync(config.caFile, 'utf8');
      } catch {}
    }

    if (config.clientCertData) {
      try {
        agentOptions.cert = Buffer.from(config.clientCertData, 'base64').toString('utf8');
      } catch {}
    } else if (config.clientCertFile && fs.existsSync(config.clientCertFile)) {
      try {
        agentOptions.cert = fs.readFileSync(config.clientCertFile, 'utf8');
      } catch {}
    }

    if (config.clientKeyData) {
      try {
        agentOptions.key = Buffer.from(config.clientKeyData, 'base64').toString('utf8');
      } catch {}
    } else if (config.clientKeyFile && fs.existsSync(config.clientKeyFile)) {
      try {
        agentOptions.key = fs.readFileSync(config.clientKeyFile, 'utf8');
      } catch {}
    }

    return new https.Agent(agentOptions);
  }

  /**
   * Executes a direct HTTP request to the Kubernetes API server.
   * Streams response chunks into memory and decompresses gzip/deflate/br.
   */
  static async requestJson<T = any>(
    apiPath: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: any;
      contentType?: string;
      timeoutMs?: number;
    } = {}
  ): Promise<{ data?: T; statusCode: number; error?: string; isUnauthorized?: boolean }> {
    const config = await this.getActiveConfig();
    if (!config || !config.server) {
      return { statusCode: 0, error: 'No active Kubernetes cluster configured.' };
    }

    const agent = this.cachedAgent || this.createAgent(config);
    const urlInfo = buildKubeUrl(config.server, apiPath);
    const method = options.method || 'GET';
    const timeoutMs = options.timeoutMs || 20000;

    const headers: Record<string, string> = {
      Accept: 'application/json, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'OpenShiftGUI-HttpClient/2.0',
    };

    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = options.contentType || (method === 'PATCH' ? 'application/merge-patch+json' : 'application/json');
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const requestOptions = {
      protocol: urlInfo.protocol,
      hostname: urlInfo.hostname,
      port: urlInfo.port,
      path: urlInfo.fullPathWithQuery,
      method,
      headers,
      agent,
      timeout: timeoutMs,
    };

    const clientModule = urlInfo.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req = clientModule.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let rawText = '';
          try {
            const encoding = (res.headers['content-encoding'] || '').toLowerCase();
            if (encoding === 'gzip') {
              rawText = zlib.gunzipSync(buffer).toString('utf8');
            } else if (encoding === 'deflate') {
              rawText = zlib.inflateSync(buffer).toString('utf8');
            } else if (encoding === 'br') {
              rawText = zlib.brotliDecompressSync(buffer).toString('utf8');
            } else {
              rawText = buffer.toString('utf8');
            }
          } catch {
            rawText = buffer.toString('utf8');
          }

          const statusCode = res.statusCode || 0;

          if (statusCode === 401 || statusCode === 403) {
            return resolve({
              statusCode,
              isUnauthorized: true,
              error: `Unauthorized (${statusCode}): Session expired or insufficient cluster permissions.`,
            });
          }

          if (statusCode === 404) {
            // Resource type not supported by this cluster (e.g. DC or Route on pure k8s / Rancher)
            return resolve({
              statusCode,
              data: (apiPath.endsWith('s') ? { items: [] } : null) as unknown as T,
            });
          }

          if (statusCode >= 200 && statusCode < 300) {
            try {
              if (!rawText.trim()) {
                return resolve({ statusCode, data: {} as T });
              }
              const parsed = JSON.parse(rawText);
              return resolve({ statusCode, data: parsed });
            } catch (err: any) {
              return resolve({ statusCode, error: `Failed to parse JSON response: ${err.message}` });
            }
          }

          // Try to extract error message from k8s Status object
          let errorMessage = rawText;
          try {
            const errObj = JSON.parse(rawText);
            if (errObj.message) {
              errorMessage = errObj.message;
            }
          } catch {}

          resolve({
            statusCode,
            error: errorMessage || `HTTP Request failed with status ${statusCode}`,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ statusCode: 408, error: `Request timeout after ${timeoutMs}ms` });
      });

      req.on('error', (err: any) => {
        resolve({ statusCode: 0, error: err.message || 'Network request failed' });
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  /**
   * Executes a direct HTTP request returning raw text response.
   */
  static async requestRaw(
    apiPath: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: any;
      contentType?: string;
      accept?: string;
      timeoutMs?: number;
    } = {}
  ): Promise<{ data: string; statusCode: number; error?: string; isUnauthorized?: boolean }> {
    const config = await this.getActiveConfig();
    if (!config || !config.server) {
      return { data: '', statusCode: 0, error: 'No active Kubernetes cluster configured.' };
    }

    const agent = this.cachedAgent || this.createAgent(config);
    const urlInfo = buildKubeUrl(config.server, apiPath);
    const method = options.method || 'GET';
    const timeoutMs = options.timeoutMs || 20000;

    const headers: Record<string, string> = {
      Accept: options.accept || 'text/plain, application/json, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'OpenShiftGUI-HttpClient/2.0',
    };

    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = options.contentType || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const requestOptions = {
      protocol: urlInfo.protocol,
      hostname: urlInfo.hostname,
      port: urlInfo.port,
      path: urlInfo.fullPathWithQuery,
      method,
      headers,
      agent,
      timeout: timeoutMs,
    };

    const clientModule = urlInfo.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req = clientModule.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let rawText = '';
          try {
            const encoding = (res.headers['content-encoding'] || '').toLowerCase();
            if (encoding === 'gzip') {
              rawText = zlib.gunzipSync(buffer).toString('utf8');
            } else if (encoding === 'deflate') {
              rawText = zlib.inflateSync(buffer).toString('utf8');
            } else if (encoding === 'br') {
              rawText = zlib.brotliDecompressSync(buffer).toString('utf8');
            } else {
              rawText = buffer.toString('utf8');
            }
          } catch {
            rawText = buffer.toString('utf8');
          }

          const statusCode = res.statusCode || 0;
          if (statusCode === 401 || statusCode === 403) {
            return resolve({
              data: '',
              statusCode,
              isUnauthorized: true,
              error: `Unauthorized (${statusCode}): Session expired or insufficient cluster permissions.`,
            });
          }

          if (statusCode >= 200 && statusCode < 300) {
            return resolve({ data: rawText, statusCode });
          }

          resolve({
            data: rawText,
            statusCode,
            error: rawText || `HTTP Request failed with status ${statusCode}`,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ data: '', statusCode: 408, error: `Request timeout after ${timeoutMs}ms` });
      });

      req.on('error', (err: any) => {
        resolve({ data: '', statusCode: 0, error: err.message || 'Network request failed' });
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  /**
   * Streams pod logs directly from Kubernetes API via HTTP Keep-Alive.
   */
  static async streamLog(
    podName: string,
    namespace: string,
    options: {
      container?: string;
      tailLines?: number;
      follow?: boolean;
      timestamps?: boolean;
      sinceSeconds?: number;
    },
    onChunk: (chunk: string) => void,
    onError: (err: Error) => void,
    onEnd: (code: number) => void
  ): Promise<{ abort: () => void }> {
    const config = await this.getActiveConfig();
    if (!config || !config.server) {
      onError(new Error('No active Kubernetes cluster configured.'));
      return { abort: () => {} };
    }

    const ns = namespace && namespace !== 'all-projects' ? namespace : 'default';
    const params = new URLSearchParams();
    if (options.follow !== false) params.set('follow', 'true');
    if (options.tailLines) params.set('tailLines', options.tailLines.toString());
    if (options.timestamps) params.set('timestamps', 'true');
    if (options.container) params.set('container', options.container);
    if (options.sinceSeconds) params.set('sinceSeconds', options.sinceSeconds.toString());

    const safeNs = encodeURIComponent(ns);
    const safePod = encodeURIComponent(podName);
    const apiPath = `/api/v1/namespaces/${safeNs}/pods/${safePod}/log?${params.toString()}`;
    const urlInfo = buildKubeUrl(config.server, apiPath);
    const agent = this.cachedAgent || this.createAgent(config);

    const headers: Record<string, string> = {
      Accept: 'text/plain, */*',
      'User-Agent': 'OpenShiftGUI-LogStreamer/2.0',
    };

    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    const requestOptions = {
      protocol: urlInfo.protocol,
      hostname: urlInfo.hostname,
      port: urlInfo.port,
      path: urlInfo.fullPathWithQuery,
      method: 'GET',
      headers,
      agent,
    };

    const clientModule = urlInfo.protocol === 'https:' ? https : http;
    const req = clientModule.request(requestOptions, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errBuf = '';
        res.on('data', (d) => (errBuf += d.toString()));
        res.on('end', () => {
          let cleanErrMsg = errBuf.trim();
          try {
            const parsed = JSON.parse(errBuf);
            if (parsed.message) {
              cleanErrMsg = parsed.message;
            }
          } catch {}
          onError(new Error(cleanErrMsg || `Log stream failed with status ${res.statusCode}`));
        });
        return;
      }

      res.on('data', (chunk: Buffer) => {
        onChunk(chunk.toString('utf8'));
      });

      res.on('end', () => {
        onEnd(res.statusCode || 0);
      });

      res.on('error', (err) => {
        onError(err);
      });
    });

    req.on('error', (err) => {
      onError(err);
    });

    req.end();

    return {
      abort: () => {
        try {
          req.destroy();
        } catch {}
      },
    };
  }

  /**
   * Connects an interactive terminal session via Kubernetes WebSocket Exec endpoint.
   */
  static async createWebSocketExec(
    podName: string,
    namespace: string,
    options: {
      container?: string;
      command?: string[];
      tty?: boolean;
      stdin?: boolean;
      stdout?: boolean;
      stderr?: boolean;
    }
  ): Promise<WebSocket> {
    const config = await this.getActiveConfig();
    if (!config || !config.server) {
      throw new Error('No active Kubernetes cluster configured.');
    }

    const ns = namespace && namespace !== 'all-projects' ? namespace : 'default';
    const params = new URLSearchParams();
    params.set('stdin', options.stdin !== false ? 'true' : 'false');
    params.set('stdout', options.stdout !== false ? 'true' : 'false');
    params.set('stderr', options.stderr !== false ? 'true' : 'false');
    params.set('tty', options.tty !== false ? 'true' : 'false');

    if (options.container) {
      params.set('container', options.container);
    }

    const cmdList = options.command && options.command.length > 0 ? options.command : ['sh', '-c', 'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi'];
    for (const cmd of cmdList) {
      params.append('command', cmd);
    }

    const apiPath = `/api/v1/namespaces/${ns}/pods/${podName}/exec?${params.toString()}`;
    const urlInfo = buildKubeUrl(config.server, apiPath);

    const wsProtocol = urlInfo.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${urlInfo.hostname}:${urlInfo.port}${urlInfo.fullPathWithQuery}`;

    const headers: Record<string, string> = {
      'User-Agent': 'OpenShiftGUI-Terminal/2.0',
    };
    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    const agent = this.cachedAgent || this.createAgent(config);

    const ws = new WebSocket(wsUrl, ['v4.channel.k8s.io', 'v4.ws.k8s.io', 'channel.k8s.io'], {
      agent,
      headers,
      rejectUnauthorized: !config.insecureSkipTlsVerify,
    });

    return ws;
  }

  /**
   * Fetches raw resource list items for a given resource kind directly via REST API.
   */
  static async getResourceList(kind: ResourceKind | string, namespace?: string): Promise<{ items: any[]; error?: string; isUnauthorized?: boolean }> {
    const apiPath = getResourceApiPath(kind, namespace);
    const res = await this.requestJson<any>(apiPath);

    if (res.isUnauthorized) {
      return { items: [], error: res.error, isUnauthorized: true };
    }

    if (res.statusCode === 404) {
      return { items: [] };
    }

    if (res.data) {
      const rawItems = res.data.items || (res.data.kind && res.data.metadata ? [res.data] : []);
      return { items: rawItems };
    }

    return { items: [], error: res.error };
  }

  /**
   * Fetches a single resource item by kind and name.
   */
  static async getResource(kind: ResourceKind | string, name: string, namespace?: string): Promise<{ data?: any; error?: string; isUnauthorized?: boolean; statusCode: number }> {
    const basePath = getResourceApiPath(kind, namespace);
    const apiPath = `${basePath}/${name}`;
    const res = await this.requestJson<any>(apiPath);
    return res;
  }
}
