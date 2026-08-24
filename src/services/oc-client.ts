import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { ResourceKind, ResourceItem, ImageStreamResource } from '../types/k8s.js';
import { formatAge, getStatusColor } from '../utils/formatters.js';
import { SemverSorter } from './semver-sorter.js';
import {
  MOCK_PODS,
  MOCK_DEPLOYMENTS,
  MOCK_ROUTES,
  MOCK_SERVICES,
  MOCK_IMAGESTREAMS,
  MOCK_HELM,
  MOCK_NODES,
} from './mock-data.js';

const execAsync = promisify(exec);

export function getExecEnv(): NodeJS.ProcessEnv {
  const home = process.env['HOME'] || os.homedir();
  const customPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    `${home}/bin`,
    `${home}/.local/bin`,
    `${home}/.nvm/versions/node/v22.23.1/bin`,
  ];
  const existingPath = process.env['PATH'] || '';
  const mergedPath = Array.from(new Set([...customPaths, ...existingPath.split(':')])).join(':');

  return {
    ...process.env,
    PATH: mergedPath,
    KUBECONFIG: process.env['KUBECONFIG'] || `${home}/.kube/config`,
  };
}

export class OcClient {
  public static isDemoMode = false;

  /**
   * Run a CLI command safely with timeout and error handling.
   */
  static async runCommand(command: string, timeout = 12000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const result = await execAsync(command, {
        timeout,
        env: getExecEnv(),
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: result.stdout || '', stderr: result.stderr || '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || 'Command failed',
        exitCode: error.code || 1,
      };
    }
  }

  /**
   * Fetches resources of a given kind in the specified namespace.
   */
  static async getResources(
    kind: ResourceKind,
    namespace: string
  ): Promise<{ items: ResourceItem[]; error?: string; isUnauthorized?: boolean }> {
    if (this.isDemoMode) {
      switch (kind) {
        case 'pods': return { items: MOCK_PODS };
        case 'deployments':
        case 'statefulsets': return { items: MOCK_DEPLOYMENTS };
        case 'routes': return { items: MOCK_ROUTES };
        case 'services': return { items: MOCK_SERVICES };
        case 'imagestreams': return { items: MOCK_IMAGESTREAMS };
        case 'helm': return { items: MOCK_HELM };
        case 'nodes': return { items: MOCK_NODES };
        default: return { items: [] };
      }
    }

    if (kind === 'helm') {
      return { items: [] }; // Handled by HelmService
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    let cmdKind = kind as string;
    if (kind === 'imagestreams') cmdKind = 'is';
    if (kind === 'statefulsets') cmdKind = 'sts';
    if (kind === 'configmaps') cmdKind = 'cm';

    const cmd = `oc get ${cmdKind} ${nsFlag} -o json || kubectl get ${cmdKind} ${nsFlag} -o json`;
    const { stdout, stderr, exitCode } = await this.runCommand(cmd);

    // Check for authorization or connectivity errors
    const lowerErr = (stderr || '').toLowerCase();
    if (lowerErr.includes('unauthorized') || lowerErr.includes('you must be logged in') || lowerErr.includes('token expired')) {
      return {
        items: [],
        error: 'Unauthorized: Session has expired or cluster login required. Run "oc login" or switch context.',
        isUnauthorized: true,
      };
    }

    if (lowerErr.includes('dial tcp') || lowerErr.includes('connection refused') || lowerErr.includes('no route to host') || lowerErr.includes('timeout')) {
      return {
        items: [],
        error: `Cluster Connection Error: Unable to reach cluster endpoint (${stderr.trim().split('\n')[0]}). Check VPN or switch context.`,
      };
    }

    if (!stdout.trim()) {
      if (stderr.trim()) {
        return { items: [], error: stderr.trim() };
      }
      return { items: [] };
    }

    try {
      const json = JSON.parse(stdout);
      const rawItems = json.items || (json.kind && json.metadata ? [json] : []);
      const items = this.transformResources(kind, rawItems, namespace);
      return { items };
    } catch (err: any) {
      return { items: [], error: `Failed to parse cluster response: ${err.message}` };
    }
  }

  /**
   * Transforms raw Kubernetes/OpenShift JSON items to normalized ResourceItem format.
   */
  static transformResources(kind: ResourceKind, items: any[], namespace: string): ResourceItem[] {
    return items.map((raw: any) => {
      const name = raw.metadata?.name || 'unknown';
      const ns = raw.metadata?.namespace || namespace || 'default';
      const creationTimestamp = raw.metadata?.creationTimestamp;
      const age = formatAge(creationTimestamp);

      switch (kind) {
        case 'pods': {
          const phase = raw.status?.phase || 'Unknown';
          const containerStatuses = raw.status?.containerStatuses || [];
          const totalContainers = containerStatuses.length || (raw.spec?.containers?.length || 1);
          const readyContainers = containerStatuses.filter((c: any) => c.ready).length;
          const ready = `${readyContainers}/${totalContainers}`;
          const restarts = containerStatuses.reduce((acc: number, c: any) => acc + (c.restartCount || 0), 0);

          let status = phase;
          for (const cs of containerStatuses) {
            if (cs.state?.waiting?.reason) {
              status = cs.state.waiting.reason;
              break;
            }
            if (cs.state?.terminated?.reason) {
              status = cs.state.terminated.reason;
              break;
            }
          }

          if (raw.metadata?.deletionTimestamp) {
            status = 'Terminating';
          }

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status,
            statusColor: getStatusColor(status),
            age,
            ready,
            restarts,
            ip: raw.status?.podIP || '-',
            node: raw.spec?.nodeName || '-',
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'deployments':
        case 'statefulsets': {
          const replicas = raw.status?.replicas || 0;
          const readyReplicas = raw.status?.readyReplicas || 0;
          const updatedReplicas = raw.status?.updatedReplicas || 0;
          const availableReplicas = raw.status?.availableReplicas || 0;
          const desired = raw.spec?.replicas ?? 1;
          const ready = `${readyReplicas}/${desired}`;

          let status = 'Active';
          if (readyReplicas === desired && desired > 0) {
            status = 'Running';
          } else if (desired === 0) {
            status = 'Scaled to 0';
          } else if (readyReplicas < desired) {
            status = 'Degraded';
          }

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status,
            statusColor: getStatusColor(status),
            age,
            ready,
            extra: {
              desired,
              current: replicas,
              upToDate: updatedReplicas,
              available: availableReplicas,
            },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'services': {
          const type = raw.spec?.type || 'ClusterIP';
          const clusterIP = raw.spec?.clusterIP || '-';
          const ports = (raw.spec?.ports || [])
            .map((p: any) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol || 'TCP'}`)
            .join(', ');

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status: type,
            statusColor: 'cyan',
            age,
            ip: clusterIP,
            extra: { ports },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'routes': {
          const host = raw.spec?.host || '-';
          const path = raw.spec?.path || '/';
          const targetService = raw.spec?.to?.name || '-';
          const tls = raw.spec?.tls ? (raw.spec.tls.termination || 'TLS') : 'None';
          const admitted = raw.status?.ingress?.[0]?.conditions?.some(
            (c: any) => c.type === 'Admitted' && c.status === 'True'
          );

          const status = admitted ? 'Admitted' : 'Exposed';

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status,
            statusColor: admitted ? 'green' : 'yellow',
            age,
            extra: { host, path, targetService, tls },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'imagestreams': {
          const rawTags = raw.status?.tags || raw.spec?.tags || [];
          const tagsList = rawTags.map((t: any) => {
            const tagName = t.tag || t.name || '';
            const created = t.items?.[0]?.created || raw.metadata?.creationTimestamp || '';
            const dockerImageReference = t.items?.[0]?.dockerImageReference || t.from?.name || '';
            const imageSize = t.items?.[0]?.image ? 100 * 1024 * 1024 : undefined;

            return {
              tag: tagName,
              created,
              dockerImageReference,
              imageSize,
              isSemver: false,
            };
          });

          // Sort tags with SemverSorter
          const sortedTags = SemverSorter.sortTags(tagsList);

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status: `${sortedTags.length} tags`,
            statusColor: sortedTags.length > 0 ? 'green' : 'gray',
            age,
            tags: sortedTags,
            tagCount: sortedTags.length,
            extra: {
              dockerImageRepository: raw.status?.dockerImageRepository || '',
              tags: sortedTags,
              tagCount: sortedTags.length,
            },
            labels: raw.metadata?.labels || {},
            raw,
          } as ImageStreamResource;
        }

        case 'configmaps':
        case 'secrets': {
          const dataCount = Object.keys(raw.data || {}).length;
          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status: `${dataCount} keys`,
            statusColor: 'cyan',
            age,
            extra: { dataCount, type: raw.type || 'Opaque' },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'nodes': {
          const conditions = raw.status?.conditions || [];
          const readyCond = conditions.find((c: any) => c.type === 'Ready');
          const isReady = readyCond?.status === 'True';
          const roles = Object.keys(raw.metadata?.labels || {})
            .filter((k) => k.startsWith('node-role.kubernetes.io/'))
            .map((k) => k.replace('node-role.kubernetes.io/', ''))
            .join(', ') || 'worker';
          const kubeletVersion = raw.status?.nodeInfo?.kubeletVersion || '-';

          return {
            id: name,
            name,
            namespace: '',
            kind,
            status: isReady ? 'Ready' : 'NotReady',
            statusColor: isReady ? 'green' : 'red',
            age,
            extra: { roles, version: kubeletVersion },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        default:
          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status: 'Active',
            statusColor: 'green',
            age,
            labels: raw.metadata?.labels || {},
            raw,
          };
      }
    });
  }

  /**
   * Describes a resource.
   */
  static async describe(kind: string, name: string, namespace: string): Promise<string> {
    if (this.isDemoMode) {
      return `Name:         ${name}\nNamespace:    ${namespace}\nKind:         ${kind}\nStatus:       Active / Running\nCreated:      2026-08-20T10:00:00Z\nLabels:       app=${name}, env=production\n\nEvents:\n  Type    Reason     Age   From               Message\n  ----    ------     ----  ----               -------\n  Normal  Scheduled  10m   default-scheduler  Successfully assigned ${namespace}/${name}\n  Normal  Pulled     10m   kubelet            Container image pulled successfully\n  Normal  Created    10m   kubelet            Created container\n  Normal  Started    10m   kubelet            Started container`;
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `oc describe ${kind} "${name}" ${nsFlag} || kubectl describe ${kind} "${name}" ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd, 15000);
    return stdout || stderr || 'No description available.';
  }

  /**
   * Gets the YAML definition of a resource.
   */
  static async getYaml(kind: string, name: string, namespace: string): Promise<string> {
    if (this.isDemoMode) {
      return `apiVersion: v1\nkind: ${kind}\nmetadata:\n  name: ${name}\n  namespace: ${namespace}\n  creationTimestamp: "2026-08-20T10:00:00Z"\n  labels:\n    app: ${name}\n    env: production\nspec:\n  replicas: 3\n  template:\n    spec:\n      containers:\n      - name: app\n        image: image-registry.openshift-image-registry.svc:5000/${namespace}/${name}:v2.4.1\nstatus:\n  phase: Running\n  readyReplicas: 3`;
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `oc get ${kind} "${name}" ${nsFlag} -o yaml || kubectl get ${kind} "${name}" ${nsFlag} -o yaml`;
    const { stdout, stderr } = await this.runCommand(cmd, 15000);
    return stdout || stderr || 'No YAML available.';
  }

  /**
   * Scales a deployment or statefulset.
   */
  static async scale(kind: string, name: string, namespace: string, replicas: number): Promise<{ success: boolean; message: string }> {
    if (this.isDemoMode) {
      return { success: true, message: `[Demo] Scaled ${kind}/${name} to ${replicas} replicas.` };
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `oc scale ${kind} "${name}" --replicas=${replicas} ${nsFlag} || kubectl scale ${kind} "${name}" --replicas=${replicas} ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Scaled ${name} to ${replicas} replicas.` };
  }

  /**
   * Triggers a rollout restart for a workload.
   */
  static async rolloutRestart(kind: string, name: string, namespace: string): Promise<{ success: boolean; message: string }> {
    if (this.isDemoMode) {
      return { success: true, message: `[Demo] Restart initiated for ${kind}/${name}.` };
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `oc rollout restart ${kind}/${name} ${nsFlag} || kubectl rollout restart ${kind}/${name} ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Restart initiated for ${kind}/${name}.` };
  }

  /**
   * Deletes a resource.
   */
  static async deleteResource(kind: string, name: string, namespace: string): Promise<{ success: boolean; message: string }> {
    if (this.isDemoMode) {
      return { success: true, message: `[Demo] Deleted ${kind}/${name}.` };
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `oc delete ${kind} "${name}" ${nsFlag} || kubectl delete ${kind} "${name}" ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Deleted ${kind}/${name}.` };
  }

  /**
   * Deletes a specific ImageStream tag (oc tag -d <is>:<tag>).
   */
  static async deleteImageStreamTag(isName: string, tag: string, namespace: string): Promise<{ success: boolean; message: string }> {
    if (this.isDemoMode) {
      return { success: true, message: `[Demo] Deleted tag ${isName}:${tag}` };
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `oc tag -d "${isName}:${tag}" ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Deleted tag ${isName}:${tag}` };
  }
}
