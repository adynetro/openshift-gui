import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
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

// Endpoint mapper for Kubernetes and OpenShift resources
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
      return '/api/v1/namespaces';
    default:
      return ns ? `/api/v1/namespaces/${ns}/${kind}` : `/api/v1/${kind}`;
  }
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
   * Loads active cluster configuration directly from kubeconfig with token resolution.
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

  private static createAgent(config: ActiveClusterConfig): https.Agent | http.Agent {
    const isHttps = config.server.startsWith('https://');
    if (!isHttps) {
      return new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 15000,
        maxSockets: 60,
      });
    }

    const agentOptions: https.AgentOptions = {
      keepAlive: true,
      keepAliveMsecs: 15000,
      maxSockets: 60,
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
   * Streams response chunks into memory without any 65K buffer limits.
   */
  static async requestJson<T = any>(
    apiPath: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: any;
      timeoutMs?: number;
    } = {}
  ): Promise<{ data?: T; statusCode: number; error?: string; isUnauthorized?: boolean }> {
    const config = await this.getActiveConfig();
    if (!config || !config.server) {
      return { statusCode: 0, error: 'No active Kubernetes cluster configured.' };
    }

    const agent = this.cachedAgent || this.createAgent(config);
    const serverUrl = new URL(config.server);
    const fullPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    const method = options.method || 'GET';
    const timeoutMs = options.timeoutMs || 15000;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'OpenShiftGUI-HttpClient/1.2',
    };

    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    let payload: string | undefined;
    if (options.body) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const requestOptions = {
      protocol: serverUrl.protocol,
      hostname: serverUrl.hostname,
      port: serverUrl.port || (serverUrl.protocol === 'https:' ? 443 : 80),
      path: fullPath,
      method,
      headers,
      agent,
      timeout: timeoutMs,
    };

    const clientModule = serverUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req = clientModule.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8');
          const statusCode = res.statusCode || 0;

          if (statusCode === 401 || statusCode === 403) {
            return resolve({
              statusCode,
              isUnauthorized: true,
              error: `Unauthorized (${statusCode}): Session expired or insufficient permissions.`,
            });
          }

          if (statusCode === 404) {
            // Resource type not supported by this cluster (e.g. DC or Route on pure k8s)
            return resolve({
              statusCode,
              data: { items: [] } as unknown as T,
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

          resolve({
            statusCode,
            error: rawText || `HTTP Request failed with status ${statusCode}`,
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
}
