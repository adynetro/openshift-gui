import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ResourceKind,
  ResourceItem,
  ImageStreamResource,
  WorkloadDetails,
  WorkloadRevisionItem,
  WorkloadPodItem,
  TopologyData,
  TopologyNode,
  PodDebugDiagnostics,
  NodeDebugDiagnostics,
  ContainerDebugState,
} from '../types/k8s.js';
import { formatAge, getStatusColor } from '../utils/formatters.js';
import { SemverSorter } from './semver-sorter.js';

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
    path.join(home, 'bin'),
    path.join(home, '.local', 'bin'),
  ];
  const existingPath = process.env['PATH'] || '';
  const mergedPath = Array.from(new Set([...customPaths, ...existingPath.split(':')])).join(':');

  return {
    ...process.env,
    PATH: mergedPath,
    KUBECONFIG: process.env['KUBECONFIG'] || path.join(home, '.kube', 'config'),
  };
}

export class OcClient {
  /**
   * Run a CLI command safely with timeout and error handling.
   */
  static async runCommand(command: string, timeout = 25000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const result = await execAsync(command, {
        timeout,
        env: getExecEnv(),
        maxBuffer: 30 * 1024 * 1024,
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
   * Fetches resources of a given kind in the specified namespace or all namespaces.
   */
  static async getResources(
    kind: ResourceKind,
    namespace: string
  ): Promise<{ items: ResourceItem[]; error?: string; isUnauthorized?: boolean }> {
    if (kind === 'helm' || kind === 'topology') {
      return { items: [] };
    }

    const isAll = !namespace || namespace === 'all-projects' || namespace === '__all__';
    const isClusterScoped = kind === 'nodes' || kind === 'pv' || kind === 'crd' || kind === 'clusteroperators';
    const nsFlag = isClusterScoped ? '' : (isAll ? '-A' : `-n "${namespace}"`);

    let cmdKind = kind as string;
    if (kind === 'deploymentconfigs') cmdKind = 'dc';
    if (kind === 'imagestreams') cmdKind = 'is';
    if (kind === 'statefulsets') cmdKind = 'sts';
    if (kind === 'daemonsets') cmdKind = 'ds';
    if (kind === 'configmaps') cmdKind = 'cm';
    if (kind === 'events') cmdKind = 'events';
    if (kind === 'pvc') cmdKind = 'pvc';
    if (kind === 'pv') cmdKind = 'pv';
    if (kind === 'crd') cmdKind = 'crd';
    if (kind === 'networkpolicies') cmdKind = 'netpol';
    if (kind === 'clusteroperators') cmdKind = 'co';

    const cmd = `oc get ${cmdKind} ${nsFlag} -o json`;
    const { stdout, stderr } = await this.runCommand(cmd);

    // Check for authorization or connectivity errors
    const lowerErr = (stderr || '').toLowerCase();
    if (lowerErr.includes('unauthorized') || lowerErr.includes('you must be logged in') || lowerErr.includes('token expired')) {
      return {
        items: [],
        error: 'Unauthorized: Session has expired or cluster login required. Run "oc login" or switch context.',
        isUnauthorized: true,
      };
    }

    if (lowerErr.includes('dial tcp') || lowerErr.includes('connection refused') || lowerErr.includes('no route to host')) {
      return {
        items: [],
        error: `Cluster Connection Error: Unable to reach cluster endpoint. Check VPN or switch context.`,
      };
    }

    if (!stdout.trim()) {
      if (stderr.trim() && !stderr.toLowerCase().includes('deprecated')) {
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
    const transformed = items.map((raw: any) => {
      const name = raw.metadata?.name || 'unknown';
      const ns = raw.metadata?.namespace || raw.involvedObject?.namespace || (namespace === 'all-projects' ? 'default' : namespace) || 'default';
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

        case 'deploymentconfigs': {
          const replicas = raw.status?.replicas || 0;
          const readyReplicas = raw.status?.readyReplicas || 0;
          const updatedReplicas = raw.status?.updatedReplicas || 0;
          const availableReplicas = raw.status?.availableReplicas || 0;
          const desired = raw.spec?.replicas ?? 1;
          const ready = `${readyReplicas}/${desired}`;
          const revision = raw.status?.latestVersion || '1';

          const triggers = (raw.spec?.triggers || [])
            .map((t: any) => t.type)
            .join(', ') || 'Config';

          const strategy = raw.spec?.strategy?.type || 'Rolling';

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
              revision,
              triggers,
              strategy,
            },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'deployments':
        case 'statefulsets':
        case 'daemonsets': {
          const replicas = raw.status?.replicas || raw.status?.currentNumberScheduled || 0;
          const readyReplicas = raw.status?.readyReplicas || raw.status?.numberReady || 0;
          const updatedReplicas = raw.status?.updatedReplicas || raw.status?.updatedNumberScheduled || 0;
          const availableReplicas = raw.status?.availableReplicas || raw.status?.numberAvailable || 0;
          const desired = raw.spec?.replicas ?? (raw.status?.desiredNumberScheduled ?? 1);
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
          const fqdn = `${name}.${ns || 'default'}.svc.cluster.local`;

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status: type,
            statusColor: 'cyan' as const,
            age,
            ip: clusterIP,
            extra: { ports, clusterIP, type, fqdn },
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
            statusColor: (admitted ? 'green' : 'yellow') as 'green' | 'yellow',
            age,
            extra: { host, path, targetService, tls },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'networkpolicies': {
          const policyTypes = raw.spec?.policyTypes || ['Ingress'];
          const types = policyTypes.join(', ');
          const matchLabels = raw.spec?.podSelector?.matchLabels || {};
          const podSelector =
            Object.keys(matchLabels).length > 0
              ? Object.entries(matchLabels)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(', ')
              : 'All Pods ({})';
          const ingressRulesCount = (raw.spec?.ingress || []).length;
          const egressRulesCount = (raw.spec?.egress || []).length;

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status: types,
            statusColor: 'cyan' as const,
            age,
            extra: {
              types,
              podSelector,
              ingressRulesCount,
              egressRulesCount,
              policyTypes,
            },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'imagestreams': {
          const rawTags = raw.status?.tags || raw.spec?.tags || [];
          const tagsList = rawTags.map((t: any) => {
            const tagName = t.tag || t.name || '';
            const created = t.items?.[0]?.created || raw.metadata?.creationTimestamp || '';
            const generation = t.items?.[0]?.generation ?? t.generation ?? 0;
            const dockerImageReference = t.items?.[0]?.dockerImageReference || t.from?.name || '';
            const imageSize = t.items?.[0]?.image ? 100 * 1024 * 1024 : undefined;

            return {
              tag: tagName,
              created,
              generation,
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
            statusColor: (sortedTags.length > 0 ? 'green' : 'gray') as 'green' | 'gray',
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
            statusColor: 'cyan' as const,
            age,
            extra: { dataCount, type: raw.type || 'Opaque' },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'pvc': {
          const status = raw.status?.phase || 'Pending';
          const volume = raw.spec?.volumeName || '-';
          const capacity = raw.status?.capacity?.storage || raw.spec?.resources?.requests?.storage || '-';
          const accessModes = (raw.spec?.accessModes || [])
            .map((m: string) => m.replace('ReadWriteOnce', 'RWO').replace('ReadWriteMany', 'RWX').replace('ReadOnlyMany', 'ROX'))
            .join(', ') || '-';
          const storageClass = raw.spec?.storageClassName || '-';

          let statusColor: 'green' | 'yellow' | 'red' | 'gray' = 'gray';
          if (status === 'Bound') statusColor = 'green';
          else if (status === 'Pending') statusColor = 'yellow';
          else if (status === 'Lost') statusColor = 'red';

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status,
            statusColor,
            age,
            extra: { volume, capacity, accessModes, storageClass },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'pv': {
          const status = raw.status?.phase || 'Available';
          const capacity = raw.spec?.capacity?.storage || '-';
          const accessModes = (raw.spec?.accessModes || [])
            .map((m: string) => m.replace('ReadWriteOnce', 'RWO').replace('ReadWriteMany', 'RWX').replace('ReadOnlyMany', 'ROX'))
            .join(', ') || '-';
          const reclaimPolicy = raw.spec?.persistentVolumeReclaimPolicy || 'Retain';
          const storageClass = raw.spec?.storageClassName || '-';
          const claim = raw.spec?.claimRef ? `${raw.spec.claimRef.namespace}/${raw.spec.claimRef.name}` : '-';

          let statusColor: 'green' | 'blue' | 'yellow' | 'red' | 'gray' = 'gray';
          if (status === 'Bound') statusColor = 'green';
          else if (status === 'Available') statusColor = 'blue';
          else if (status === 'Released') statusColor = 'yellow';
          else if (status === 'Failed') statusColor = 'red';

          return {
            id: name,
            name,
            namespace: 'cluster',
            kind,
            status,
            statusColor,
            age,
            extra: { capacity, accessModes, reclaimPolicy, storageClass, claim },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'crd': {
          const group = raw.spec?.group || '-';
          const scope = raw.spec?.scope || 'Namespaced';
          const crdKind = raw.spec?.names?.kind || '-';
          const versions = (raw.spec?.versions || []).map((v: any) => v.name).join(', ') || '-';
          const established = raw.status?.conditions?.some((c: any) => c.type === 'Established' && c.status === 'True');
          const status = established ? 'Established' : 'Active';

          return {
            id: name,
            name,
            namespace: 'cluster',
            kind,
            status,
            statusColor: 'cyan' as const,
            age,
            extra: { group, scope, crdKind, versions },
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
            statusColor: (isReady ? 'green' : 'red') as 'green' | 'red',
            age,
            extra: { roles, version: kubeletVersion },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'clusteroperators': {
          const conditions = raw.status?.conditions || [];
          const availCond = conditions.find((c: any) => c.type === 'Available');
          const progCond = conditions.find((c: any) => c.type === 'Progressing');
          const degCond = conditions.find((c: any) => c.type === 'Degraded');

          const isAvailable = availCond?.status === 'True';
          const isProgressing = progCond?.status === 'True';
          const isDegraded = degCond?.status === 'True';

          const version = raw.status?.versions?.[0]?.version || '-';
          const message = degCond?.message || progCond?.message || availCond?.message || '';

          let status = 'Available';
          let statusColor: 'green' | 'red' | 'yellow' | 'gray' = 'green';

          if (isDegraded) {
            status = 'Degraded';
            statusColor = 'red';
          } else if (isProgressing) {
            status = 'Progressing';
            statusColor = 'yellow';
          } else if (!isAvailable) {
            status = 'Unavailable';
            statusColor = 'red';
          }

          return {
            id: name,
            name,
            namespace: 'cluster',
            kind,
            status,
            statusColor,
            age,
            extra: {
              version,
              available: isAvailable ? 'True' : 'False',
              progressing: isProgressing ? 'True' : 'False',
              degraded: isDegraded ? 'True' : 'False',
              message,
            },
            labels: raw.metadata?.labels || {},
            raw,
          };
        }

        case 'events': {
          const eventType = raw.type || 'Normal';
          const reason = raw.reason || 'Event';
          const message = raw.message || '';
          const count = raw.count || 1;
          const objectKind = raw.involvedObject?.kind || 'Object';
          const objectName = raw.involvedObject?.name || name;
          const sourceComponent = raw.source?.component || raw.reportingComponent || '-';
          const timestamp = raw.lastTimestamp || raw.eventTime || raw.metadata?.creationTimestamp;
          const eventAge = formatAge(timestamp);

          return {
            id: `${ns}/${name}`,
            name: `${objectKind}/${objectName}`,
            namespace: ns,
            kind: 'events' as const,
            status: reason,
            statusColor: (eventType === 'Warning' ? 'red' : 'green') as 'red' | 'green',
            age: eventAge,
            extra: {
              eventType,
              reason,
              message,
              count,
              source: sourceComponent,
              objectKind,
              objectName,
              firstSeen: raw.firstTimestamp,
              lastSeen: timestamp,
              rawTimestamp: timestamp ? new Date(timestamp).getTime() : 0,
            },
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
            statusColor: 'green' as const,
            age,
            labels: raw.metadata?.labels || {},
            raw,
          };
      }
    });

    if (kind === 'events') {
      // Sort newest events first
      transformed.sort((a, b) => (b.extra?.rawTimestamp || 0) - (a.extra?.rawTimestamp || 0));
    }

    return transformed;
  }

  /**
   * Describes a resource.
   */
  static async describe(kind: string, name: string, namespace: string): Promise<string> {
    let cmdKind = kind;
    if (kind === 'deploymentconfigs') cmdKind = 'dc';
    if (kind === 'imagestreams') cmdKind = 'is';
    if (kind === 'statefulsets') cmdKind = 'sts';
    if (kind === 'daemonsets') cmdKind = 'ds';
    if (kind === 'configmaps') cmdKind = 'cm';
    if (kind === 'events') cmdKind = 'event';

    const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
    const cmd = `oc describe ${cmdKind} "${name}" ${nsFlag}"${name}" ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd, 15000);
    return stdout || stderr || 'No description available.';
  }

  /**
   * Gets the YAML definition of a resource.
   */
  static async getYaml(kind: string, name: string, namespace: string): Promise<string> {
    let cmdKind = kind;
    if (kind === 'deploymentconfigs') cmdKind = 'dc';
    if (kind === 'imagestreams') cmdKind = 'is';
    if (kind === 'statefulsets') cmdKind = 'sts';
    if (kind === 'daemonsets') cmdKind = 'ds';
    if (kind === 'configmaps') cmdKind = 'cm';
    if (kind === 'events') cmdKind = 'event';

    const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
    const cmd = `oc get ${cmdKind} "${name}" ${nsFlag} -o yaml"${name}" ${nsFlag} -o yaml`;
    const { stdout, stderr } = await this.runCommand(cmd, 15000);
    return stdout || stderr || 'No YAML available.';
  }

  /**
   * Applies / updates a resource via YAML content (oc apply -f -).
   */
  static async applyYaml(yamlContent: string, namespace: string): Promise<{ success: boolean; message: string }> {
    const tmpFile = path.join(os.tmpdir(), `oc-edit-${Date.now()}.yaml`);
    try {
      fs.writeFileSync(tmpFile, yamlContent, 'utf8');
      const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
      const cmd = `oc apply -f "${tmpFile}" ${nsFlag}`;
      const { stdout, stderr } = await this.runCommand(cmd);

      if (stderr && !stdout) {
        return { success: false, message: stderr };
      }
      return { success: true, message: stdout.trim() || 'Resource updated successfully!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to apply YAML' };
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }

  /**
   * Batch deletes Completed, Failed, and Error pods in a project or across all namespaces.
   */
  static async prunePods(
    namespace: string,
    targetStatuses: string[] = ['Completed', 'Error', 'CrashLoopBackOff', 'Failed', 'Succeeded', 'Evicted']
  ): Promise<{ success: boolean; count: number; deleted: string[]; message: string }> {
    try {
      const res = await this.getResources('pods', namespace);
      if (res.error) {
        return { success: false, count: 0, deleted: [], message: res.error };
      }

      const matchingPods = res.items.filter((p) => {
        const status = (p.status || '').toLowerCase();
        return targetStatuses.some((ts) => status.includes(ts.toLowerCase()));
      });

      if (matchingPods.length === 0) {
        return { success: true, count: 0, deleted: [], message: 'No completed or failed pods found to clean.' };
      }

      // Group pods by their respective namespace so multi-namespace pruning works seamlessly
      const podsByNs: Record<string, string[]> = {};
      matchingPods.forEach((p) => {
        const ns = p.namespace || (namespace && namespace !== 'all-projects' ? namespace : 'default');
        if (!podsByNs[ns]) podsByNs[ns] = [];
        podsByNs[ns].push(p.name);
      });

      const deletedList: string[] = [];
      const errorList: string[] = [];

      for (const [ns, names] of Object.entries(podsByNs)) {
        if (names.length === 0) continue;
        const chunkSize = 50;
        for (let i = 0; i < names.length; i += chunkSize) {
          const chunk = names.slice(i, i + chunkSize);
          const cmd = `oc delete pod ${chunk.map((n) => `"${n}"`).join(' ')} -n "${ns}"`;
          const { stdout, stderr } = await this.runCommand(cmd, 45000);
          if (stderr && !stdout && stderr.toLowerCase().includes('error')) {
            errorList.push(`[${ns}]: ${stderr.trim()}`);
          } else {
            deletedList.push(...chunk.map((n) => `${ns}/${n}`));
          }
        }
      }

      if (deletedList.length === 0 && errorList.length > 0) {
        return { success: false, count: 0, deleted: [], message: errorList.join('; ') };
      }

      return {
        success: true,
        count: deletedList.length,
        deleted: deletedList,
        message: `Successfully cleared ${deletedList.length} completed/failed pods across ${Object.keys(podsByNs).length} project(s).`,
      };
    } catch (err: any) {
      return { success: false, count: 0, deleted: [], message: err.message || 'Failed to prune pods' };
    }
  }

  /**
   * Runs OpenShift integrated registry image and blob pruner (`oc adm prune images`).
   * Can run in dry-run mode (simulation) or with `--confirm` to delete unreferenced blobs and free storage.
   */
  static async pruneImages(options: {
    keepTagRevisions?: number;
    keepYoungerThan?: string;
    confirm?: boolean;
    all?: boolean;
    ignoreInvalidRefs?: boolean;
    registryUrl?: string;
  }): Promise<{ success: boolean; stdout: string; stderr: string; message: string; isDryRun: boolean }> {
    try {
      const keepRevs = options.keepTagRevisions ?? 3;
      const keepAge = options.keepYoungerThan || '60m';
      const allFlag = options.all !== false ? '--all=true' : '--all=false';
      const ignoreRefs = options.ignoreInvalidRefs ? '--ignore-invalid-refs=true' : '';
      const confirmFlag = options.confirm ? '--confirm' : '';
      const regUrl = options.registryUrl ? `--registry-url="${options.registryUrl}"` : '';

      const cmd = `oc adm prune images --keep-tag-revisions=${keepRevs} --keep-younger-than=${keepAge} ${allFlag} ${ignoreRefs} ${regUrl} ${confirmFlag}`.trim().replace(/\s+/g, ' ');

      const { stdout, stderr } = await this.runCommand(cmd, 120000);

      const fullOutput = (stdout || '') + (stderr ? `\n${stderr}` : '');
      const isSuccess = !stderr || fullOutput.toLowerCase().includes('summary:') || fullOutput.toLowerCase().includes('dry run enabled');

      return {
        success: isSuccess,
        stdout: stdout || '',
        stderr: stderr || '',
        message: isSuccess
          ? (options.confirm ? 'Image and blob pruning completed successfully.' : 'Dry run simulation completed.')
          : (stderr || 'Image prune failed.'),
        isDryRun: !options.confirm,
      };
    } catch (err: any) {
      return {
        success: false,
        stdout: '',
        stderr: err.message || '',
        message: err.message || 'Failed to execute image prune command.',
        isDryRun: !options.confirm,
      };
    }
  }

  /**
   * Generates OpenShift native CronJob & RBAC manifest for automated registry blob cleanup.
   */
  static getImagePrunerCronJobYaml(options: {
    schedule?: string;
    keepTagRevisions?: number;
    keepYoungerThan?: string;
    namespace?: string;
  }): string {
    const schedule = options.schedule || '0 0 * * 0'; // Weekly Sunday at midnight
    const keepRevs = options.keepTagRevisions ?? 3;
    const keepAge = options.keepYoungerThan || '60m';
    const ns = options.namespace || 'openshift-image-registry';

    return `apiVersion: v1
kind: ServiceAccount
metadata:
  name: image-pruner
  namespace: ${ns}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: image-pruner
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:image-pruner
subjects:
- kind: ServiceAccount
  name: image-pruner
  namespace: ${ns}
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: image-pruner
  namespace: ${ns}
spec:
  schedule: "${schedule}"
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: image-pruner
          restartPolicy: OnFailure
          containers:
          - name: image-pruner
            image: image-registry.openshift-image-registry.svc:5000/openshift/cli:latest
            command:
            - oc
            - adm
            - prune
            - images
            - --keep-tag-revisions=${keepRevs}
            - --keep-younger-than=${keepAge}
            - --confirm
            resources:
              requests:
                cpu: 100m
                memory: 256Mi
              limits:
                cpu: 500m
                memory: 512Mi
`;
  }

  /**
   * Scales a deployment, deploymentconfig, or statefulset.
   */
  static async scale(kind: string, name: string, namespace: string, replicas: number): Promise<{ success: boolean; message: string }> {
    let cmdKind = kind;
    if (kind === 'deploymentconfigs') cmdKind = 'dc';
    if (kind === 'statefulsets') cmdKind = 'sts';

    const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
    const cmd = `oc scale ${cmdKind} "${name}" --replicas=${replicas} ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Scaled ${name} to ${replicas} replicas.` };
  }

  /**
   * Triggers a rollout restart or latest for a workload.
   */
  static async rolloutRestart(kind: string, name: string, namespace: string): Promise<{ success: boolean; message: string }> {
    let cmdKind = kind;
    if (kind === 'deploymentconfigs') cmdKind = 'dc';

    const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
    let cmd = `oc rollout restart ${cmdKind}/${name} ${nsFlag}`;
    if (cmdKind === 'dc') {
      cmd = `oc rollout latest dc/"${name}" ${nsFlag} || ${cmd}`;
    }

    const { stdout, stderr } = await this.runCommand(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Rollout restart initiated for ${cmdKind}/${name}.` };
  }

  /**
   * Deletes a resource.
   */
  static async deleteResource(kind: string, name: string, namespace: string): Promise<{ success: boolean; message: string }> {
    let cmdKind = kind;
    if (kind === 'deploymentconfigs') cmdKind = 'dc';
    if (kind === 'imagestreams') cmdKind = 'is';
    if (kind === 'statefulsets') cmdKind = 'sts';
    if (kind === 'daemonsets') cmdKind = 'ds';
    if (kind === 'configmaps') cmdKind = 'cm';
    if (kind === 'events') cmdKind = 'event';

    const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
    const cmd = `oc delete ${cmdKind} "${name}" ${nsFlag}"${name}" ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Deleted ${kind}/${name}.` };
  }

  /**
   * Batch deletes multiple pods by name in a single command.
   */
  static async deleteMultiplePods(
    podNames: string[],
    namespace: string
  ): Promise<{ success: boolean; deleted: string[]; failed: string[]; message: string }> {
    if (!podNames || podNames.length === 0) {
      return { success: true, deleted: [], failed: [], message: 'No pods selected for deletion.' };
    }

    try {
      const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
      const quotedNames = podNames.map((n) => `"${n}"`).join(' ');
      const cmd = `oc delete pod ${quotedNames} ${nsFlag}`;
      const { stdout, stderr } = await this.runCommand(cmd, 60000);

      if (stderr && !stdout) {
        return { success: false, deleted: [], failed: podNames, message: stderr };
      }

      return {
        success: true,
        deleted: podNames,
        failed: [],
        message: stdout.trim() || `Successfully deleted ${podNames.length} pod(s).`,
      };
    } catch (err: any) {
      return { success: false, deleted: [], failed: podNames, message: err.message || 'Failed to delete pods' };
    }
  }

  /**
   * Deletes a specific ImageStream tag (oc tag -d <is>:<tag>).
   */
  static async deleteImageStreamTag(isName: string, tag: string, namespace: string): Promise<{ success: boolean; message: string }> {
    const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
    const cmd = `oc tag -d "${isName}:${tag}" ${nsFlag}`;
    const { stdout, stderr } = await this.runCommand(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Deleted tag ${isName}:${tag}` };
  }

  /**
   * Fetches comprehensive workload details including manifest, replication controllers / replicasets, and live pods.
   */
  static async getWorkloadDetails(
    kind: ResourceKind,
    name: string,
    namespace: string
  ): Promise<{ details?: WorkloadDetails; error?: string }> {
    try {
      let cmdKind = kind as string;
      if (kind === 'deploymentconfigs') cmdKind = 'dc';
      if (kind === 'statefulsets') cmdKind = 'sts';
      if (kind === 'daemonsets') cmdKind = 'ds';

      const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';

      // 1. Fetch workload manifest JSON
      const workloadCmd = `oc get ${cmdKind} "${name}" ${nsFlag} -o json"${name}" ${nsFlag} -o json`;
      
      // 2. Fetch revisions (RC for dc, RS for deployments, ControllerRevision for statefulset)
      let revisionsCmd = '';
      if (kind === 'deploymentconfigs') {
        revisionsCmd = `oc get rc ${nsFlag} -o json`;
      } else if (kind === 'deployments') {
        revisionsCmd = `oc get rs ${nsFlag} -o json`;
      } else if (kind === 'statefulsets') {
        revisionsCmd = `oc get controllerrevision ${nsFlag} -o json`;
      }

      // 3. Fetch Pods
      const podsCmd = `oc get pods ${nsFlag} -o json`;

      // Execute in parallel
      const [workloadRes, revisionsRes, podsRes] = await Promise.all([
        this.runCommand(workloadCmd),
        revisionsCmd ? this.runCommand(revisionsCmd) : Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
        this.runCommand(podsCmd),
      ]);

      if (!workloadRes.stdout.trim()) {
        return { error: workloadRes.stderr || `Workload ${kind}/${name} not found` };
      }

      const workloadJson = JSON.parse(workloadRes.stdout);
      const spec = workloadJson.spec || {};
      const status = workloadJson.status || {};
      const actualNamespace = workloadJson.metadata?.namespace || namespace;

      // Extract containers images
      const containers = spec.template?.spec?.containers || [];
      const images: string[] = containers.map((c: any) => c.image).filter(Boolean);

      // Extract selectors
      const selectors: Record<string, string> = spec.selector?.matchLabels || spec.selector || {};

      // Extract strategy & triggers
      const strategy = spec.strategy?.type || spec.updateStrategy?.type || 'Rolling';
      const triggers = workloadJson.spec?.triggers?.map((t: any) => t.type).join(', ') || 'Config';

      // Parse Revisions
      const revisions: WorkloadRevisionItem[] = [];
      if (revisionsRes.stdout.trim()) {
        try {
          const revList = JSON.parse(revisionsRes.stdout).items || [];
          for (const item of revList) {
            const meta = item.metadata || {};
            const itemSpec = item.spec || {};
            const itemStatus = item.status || {};

            let isMatch = false;
            let revNumber = '1';
            let phase = 'Active';

            if (kind === 'deploymentconfigs') {
              const dcName = meta.annotations?.['openshift.io/deployment-config.name'];
              if (dcName === name || meta.name?.startsWith(`${name}-`)) {
                isMatch = true;
                revNumber = meta.annotations?.['openshift.io/deployment-config.latest-version'] || 
                            meta.annotations?.['openshift.io/deployment.revision'] ||
                            meta.name?.replace(`${name}-`, '') || '1';
                phase = meta.annotations?.['openshift.io/deployment.phase'] || (itemSpec.replicas > 0 ? 'Active' : 'Complete');
              }
            } else if (kind === 'deployments') {
              const owners = meta.ownerReferences || [];
              if (owners.some((o: any) => o.name === name) || meta.name?.startsWith(`${name}-`)) {
                isMatch = true;
                revNumber = meta.annotations?.['deployment.kubernetes.io/revision'] || '1';
                phase = (itemSpec.replicas || 0) > 0 ? 'Active' : 'Scaled Down';
              }
            } else if (kind === 'statefulsets') {
              const owners = meta.ownerReferences || [];
              if (owners.some((o: any) => o.name === name) || meta.name?.startsWith(`${name}-`)) {
                isMatch = true;
                revNumber = String(item.revision || meta.annotations?.['deployment.kubernetes.io/revision'] || '1');
                phase = 'Active';
              }
            }

            if (isMatch) {
              const revContainers = itemSpec.template?.spec?.containers || [];
              const revImages = revContainers.map((c: any) => c.image).filter(Boolean);
              const desired = itemSpec.replicas || 0;
              const current = itemStatus.replicas || 0;
              const ready = itemStatus.readyReplicas || 0;

              let statusColor: 'green' | 'red' | 'yellow' | 'blue' | 'gray' = 'gray';
              if (phase === 'Complete' || phase === 'Active') statusColor = desired > 0 ? 'green' : 'gray';
              else if (phase === 'Failed') statusColor = 'red';
              else if (phase === 'Running' || phase === 'Pending') statusColor = 'yellow';

              revisions.push({
                name: meta.name,
                kind: kind === 'deploymentconfigs' ? 'ReplicationController' : 'ReplicaSet',
                revision: revNumber,
                desired,
                current,
                ready,
                status: phase,
                statusColor,
                age: formatAge(meta.creationTimestamp),
                images: revImages.length > 0 ? revImages : images,
                active: desired > 0,
              });
            }
          }
        } catch (err) {
          console.error('Error parsing revisions:', err);
        }
      }

      // Sort revisions descending by revision number
      revisions.sort((a, b) => {
        const numA = parseInt(a.revision, 10);
        const numB = parseInt(b.revision, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        return b.name.localeCompare(a.name);
      });

      // Parse Pods with exact workload ownership matching
      const pods: WorkloadPodItem[] = [];
      if (podsRes.stdout.trim()) {
        try {
          const podList = JSON.parse(podsRes.stdout).items || [];
          for (const pod of podList) {
            const meta = pod.metadata || {};
            const podSpec = pod.spec || {};
            const podStatus = pod.status || {};
            const labels = meta.labels || {};
            const owners = meta.ownerReferences || [];
            const annotations = meta.annotations || {};

            // Exclude OpenShift deployer / build hook pods (e.g. gremlins-18-deploy)
            if (meta.name?.endsWith('-deploy') || annotations['openshift.io/deployer-pod-for']) {
              continue;
            }

            let isMatch = false;
            if (kind === 'deploymentconfigs') {
              // 1. Exact label match: deploymentconfig=<name>
              if (labels['deploymentconfig'] === name || labels['openshift.io/deployment-config.name'] === name) {
                isMatch = true;
              }
              // 2. Owner reference or deployment label matching one of this DC's replication controllers
              else if (
                owners.some((o: any) => o.kind === 'ReplicationController' && revisions.some((r) => r.name === o.name)) ||
                (labels['deployment'] && revisions.some((r) => r.name === labels['deployment']))
              ) {
                isMatch = true;
              }
            } else if (kind === 'deployments') {
              // In Kubernetes, pods belong to a ReplicaSet of this deployment
              if (owners.some((o: any) => o.kind === 'ReplicaSet' && revisions.some((r) => r.name === o.name))) {
                isMatch = true;
              } else if (revisions.length === 0) {
                // If revisions list is empty, match exact selector matchLabels
                const matchLabel = Object.entries(selectors).every(([k, v]) => labels[k] === v);
                if (matchLabel && Object.keys(selectors).length > 0) {
                  isMatch = true;
                }
              }
            } else if (kind === 'statefulsets') {
              if (
                owners.some((o: any) => o.kind === 'StatefulSet' && o.name === name) ||
                (labels['statefulset.kubernetes.io/pod-name'] && new RegExp(`^${name}-\\d+$`).test(meta.name))
              ) {
                isMatch = true;
              }
            } else if (kind === 'daemonsets') {
              if (owners.some((o: any) => o.kind === 'DaemonSet' && o.name === name)) {
                isMatch = true;
              }
            }

            if (isMatch) {
              const containerStatuses = podStatus.containerStatuses || [];
              const readyContainers = containerStatuses.filter((c: any) => c.ready).length;
              const totalContainers = podSpec.containers?.length || containerStatuses.length || 1;
              const restarts = containerStatuses.reduce((acc: number, c: any) => acc + (c.restartCount || 0), 0);
              const phase = podStatus.phase || 'Unknown';

              let statusColor: 'green' | 'red' | 'yellow' | 'blue' | 'gray' = 'gray';
              if (phase === 'Running') statusColor = 'green';
              else if (phase === 'Succeeded' || phase === 'Completed') statusColor = 'blue';
              else if (phase === 'Pending') statusColor = 'yellow';
              else if (phase === 'Failed' || phase === 'CrashLoopBackOff') statusColor = 'red';

              const podContainers = (podSpec.containers || []).map((c: any) => {
                const cStatus = containerStatuses.find((cs: any) => cs.name === c.name);
                const state = cStatus?.state?.running ? 'Running' : cStatus?.state?.waiting?.reason || cStatus?.state?.terminated?.reason || 'Unknown';
                return {
                  name: c.name,
                  image: c.image,
                  ready: !!cStatus?.ready,
                  state,
                };
              });

              pods.push({
                name: meta.name,
                namespace: meta.namespace || actualNamespace,
                ready: `${readyContainers}/${totalContainers}`,
                status: phase,
                statusColor,
                restarts,
                ip: podStatus.podIP || '-',
                node: podSpec.nodeName || '-',
                age: formatAge(meta.creationTimestamp),
                containers: podContainers,
              });
            }
          }
        } catch (err) {
          console.error('Error parsing pods for workload:', err);
        }
      }

      // Sort pods by name
      pods.sort((a, b) => a.name.localeCompare(b.name));

      const details: WorkloadDetails = {
        kind,
        name,
        namespace: actualNamespace,
        strategy,
        triggers,
        selectors,
        desiredReplicas: spec.replicas ?? 1,
        readyReplicas: status.readyReplicas ?? status.replicas ?? 0,
        images,
        revisions,
        pods,
      };

      return { details };
    } catch (err: any) {
      return { error: err.message || 'Failed to fetch workload details' };
    }
  }

  /**
   * Fetches topology data combining workloads, services, routes, pvcs, and pods for a project.
   */
  static async getTopologyData(namespace: string): Promise<{ data?: TopologyData; error?: string }> {
    try {
      const isAll = !namespace || namespace === 'all-projects' || namespace === '__all__';
      const nsFlag = isAll ? '-A' : `-n "${namespace}"`;

      const [dcsRes, deprsRes, stsRes, dsRes, svcsRes, routesRes, pvcsRes, podsRes] = await Promise.all([
        this.runCommand(`oc get dc ${nsFlag} -o json || true`),
        this.runCommand(`oc get deployments ${nsFlag} -o json || true`),
        this.runCommand(`oc get statefulsets ${nsFlag} -o json || true`),
        this.runCommand(`oc get daemonsets ${nsFlag} -o json || true`),
        this.runCommand(`oc get services ${nsFlag} -o json || true`),
        this.runCommand(`oc get routes ${nsFlag} -o json || true`),
        this.runCommand(`oc get pvc ${nsFlag} -o json || true`),
        this.runCommand(`oc get pods ${nsFlag} -o json || true`),
      ]);

      const parseItems = (stdout: string) => {
        try {
          if (!stdout.trim()) return [];
          const j = JSON.parse(stdout);
          return j.items || (j.kind ? [j] : []);
        } catch {
          return [];
        }
      };

      const dcs = parseItems(dcsRes.stdout);
      const deprs = parseItems(deprsRes.stdout);
      const sts = parseItems(stsRes.stdout);
      const ds = parseItems(dsRes.stdout);
      const svcs = parseItems(svcsRes.stdout);
      const routes = parseItems(routesRes.stdout);
      const pvcs = parseItems(pvcsRes.stdout);
      const pods = parseItems(podsRes.stdout);

      const allWorkloadRaw: { kind: ResourceKind; raw: any }[] = [
        ...dcs.map((r: any) => ({ kind: 'deploymentconfigs' as ResourceKind, raw: r })),
        ...deprs.map((r: any) => ({ kind: 'deployments' as ResourceKind, raw: r })),
        ...sts.map((r: any) => ({ kind: 'statefulsets' as ResourceKind, raw: r })),
        ...ds.map((r: any) => ({ kind: 'daemonsets' as ResourceKind, raw: r })),
      ];

      const workloads: TopologyNode[] = [];
      const claimedServices = new Set<string>();
      const claimedRoutes = new Set<string>();
      const claimedPvcs = new Set<string>();

      for (const { kind, raw } of allWorkloadRaw) {
        const meta = raw.metadata || {};
        const spec = raw.spec || {};
        const status = raw.status || {};
        const name = meta.name || '';
        const ns = meta.namespace || namespace;
        const labels = meta.labels || {};
        const selectors: Record<string, string> = spec.selector?.matchLabels || spec.selector || {};

        const appName = labels['app.kubernetes.io/part-of'] || labels['app'] || labels['app.kubernetes.io/name'] || name;
        const containers = spec.template?.spec?.containers || [];
        const images: string[] = containers.map((c: any) => c.image).filter(Boolean);

        const desiredReplicas = spec.replicas ?? (status.desiredNumberScheduled ?? 1);
        const readyReplicas = status.readyReplicas ?? status.numberReady ?? (status.replicas || 0);

        // Find linked pods
        const linkedPods = pods
          .filter((p: any) => {
            const pMeta = p.metadata || {};
            const pLabels = pMeta.labels || {};
            const pOwners = pMeta.ownerReferences || [];
            if (pMeta.name?.endsWith('-deploy')) return false;

            if (kind === 'deploymentconfigs') {
              return pLabels['deploymentconfig'] === name || pLabels['openshift.io/deployment-config.name'] === name;
            } else if (kind === 'deployments') {
              return (
                pOwners.some((o: any) => o.kind === 'ReplicaSet' && o.name?.startsWith(`${name}-`)) ||
                (Object.keys(selectors).length > 0 && Object.entries(selectors).every(([k, v]) => pLabels[k] === v))
              );
            } else if (kind === 'statefulsets') {
              return pLabels['app'] === name || (pMeta.name && new RegExp(`^${name}-\\d+$`).test(pMeta.name));
            } else if (kind === 'daemonsets') {
              return pOwners.some((o: any) => o.kind === 'DaemonSet' && o.name === name);
            }
            return false;
          })
          .map((p: any) => ({
            name: p.metadata?.name || '',
            status: p.status?.phase || 'Unknown',
            statusColor: p.status?.phase === 'Running' ? 'green' : 'gray',
            ready: `${p.status?.containerStatuses?.filter((c: any) => c.ready).length || 0}/${p.spec?.containers?.length || 1}`,
            restarts: (p.status?.containerStatuses || []).reduce((acc: number, c: any) => acc + (c.restartCount || 0), 0),
          }));

        // Find linked services (matching selector)
        const linkedServices: { name: string; type: string; clusterIP: string; ports: string }[] = [];
        for (const svc of svcs) {
          const svcMeta = svc.metadata || {};
          const svcSpec = svc.spec || {};
          const svcSelector = svcSpec.selector || {};
          const svcNs = svcMeta.namespace || ns;

          if (svcNs === ns && Object.keys(svcSelector).length > 0) {
            const isMatch = Object.entries(svcSelector).every(
              ([k, v]) => labels[k] === v || spec.template?.metadata?.labels?.[k] === v
            );
            if (isMatch || svcMeta.name === name || svcMeta.name === appName) {
              claimedServices.add(`${svcNs}/${svcMeta.name}`);
              const ports = (svcSpec.ports || []).map((p: any) => `${p.port}/${p.protocol || 'TCP'}`).join(', ');
              linkedServices.push({
                name: svcMeta.name,
                type: svcSpec.type || 'ClusterIP',
                clusterIP: svcSpec.clusterIP || '-',
                ports,
              });
            }
          }
        }

        // Find linked routes (targeting linked services or directly named)
        const linkedRoutes: { name: string; host: string; url: string; tls: boolean }[] = [];
        for (const r of routes) {
          const rMeta = r.metadata || {};
          const rSpec = r.spec || {};
          const targetSvc = rSpec.to?.name;
          const rNs = rMeta.namespace || ns;

          if (
            rNs === ns &&
            (linkedServices.some((s) => s.name === targetSvc) || rMeta.name === name || rMeta.name === appName)
          ) {
            claimedRoutes.add(`${rNs}/${rMeta.name}`);
            const host = rSpec.host || '';
            const path = rSpec.path || '';
            const tls = !!rSpec.tls;
            const url = host ? `${tls ? 'https' : 'http'}://${host}${path}` : '';
            linkedRoutes.push({
              name: rMeta.name,
              host,
              url,
              tls,
            });
          }
        }

        // Find linked PVCs (referenced in volumes)
        const linkedPvcs: { name: string; status: string; capacity: string; storageClass: string }[] = [];
        const volumes = spec.template?.spec?.volumes || [];
        for (const vol of volumes) {
          const pvcClaimName = vol.persistentVolumeClaim?.claimName;
          if (pvcClaimName) {
            claimedPvcs.add(`${ns}/${pvcClaimName}`);
            const matchingPvc = pvcs.find((p: any) => p.metadata?.name === pvcClaimName && (p.metadata?.namespace || ns) === ns);
            if (matchingPvc) {
              linkedPvcs.push({
                name: pvcClaimName,
                status: matchingPvc.status?.phase || 'Bound',
                capacity: matchingPvc.status?.capacity?.storage || matchingPvc.spec?.resources?.requests?.storage || '-',
                storageClass: matchingPvc.spec?.storageClassName || '-',
              });
            } else {
              linkedPvcs.push({
                name: pvcClaimName,
                status: 'Bound',
                capacity: '-',
                storageClass: '-',
              });
            }
          }
        }

        let statusColor: 'green' | 'red' | 'yellow' | 'blue' | 'gray' = 'gray';
        if (readyReplicas === desiredReplicas && desiredReplicas > 0) statusColor = 'green';
        else if (readyReplicas > 0) statusColor = 'yellow';
        else if (desiredReplicas === 0) statusColor = 'gray';
        else statusColor = 'red';

        workloads.push({
          id: `${ns}/${name}`,
          name,
          namespace: ns,
          kind,
          status: readyReplicas === desiredReplicas && desiredReplicas > 0 ? 'Running' : `${readyReplicas}/${desiredReplicas} Ready`,
          statusColor,
          desiredReplicas,
          readyReplicas,
          podCount: linkedPods.length,
          images,
          appName,
          routes: linkedRoutes,
          services: linkedServices,
          pvcs: linkedPvcs,
          pods: linkedPods,
          age: formatAge(meta.creationTimestamp),
        });
      }

      // Standalone items not claimed by any workload
      const standaloneServices = this.transformResources(
        'services',
        svcs.filter((s: any) => !claimedServices.has(`${s.metadata?.namespace || namespace}/${s.metadata?.name}`)),
        namespace
      );
      const standaloneRoutes = this.transformResources(
        'routes',
        routes.filter((r: any) => !claimedRoutes.has(`${r.metadata?.namespace || namespace}/${r.metadata?.name}`)),
        namespace
      );
      const standalonePvcs = this.transformResources(
        'pvc',
        pvcs.filter((p: any) => !claimedPvcs.has(`${p.metadata?.namespace || namespace}/${p.metadata?.name}`)),
        namespace
      );

      return {
        data: {
          namespace,
          workloads,
          standaloneServices,
          standaloneRoutes,
          standalonePvcs,
        },
      };
    } catch (err: any) {
      return { error: err.message || 'Failed to fetch topology data' };
    }
  }

  /**
   * Fetches Secret and returns decoded plaintext key-value pairs.
   */
  static async getSecretData(
    name: string,
    namespace: string
  ): Promise<{ data?: Record<string, string>; type?: string; error?: string }> {
    try {
      const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
      const cmd = `oc get secret "${name}" ${nsFlag} -o json"${name}" ${nsFlag} -o json`;
      const { stdout, stderr } = await this.runCommand(cmd);
      if (!stdout.trim()) {
        return { error: stderr || `Secret '${name}' not found` };
      }
      const json = JSON.parse(stdout);
      const rawData = json.data || {};
      const decoded: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawData)) {
        try {
          decoded[k] = Buffer.from(v as string, 'base64').toString('utf-8');
        } catch {
          decoded[k] = v as string;
        }
      }
      return { data: decoded, type: json.type || 'Opaque' };
    } catch (err: any) {
      return { error: err.message || 'Failed to get secret data' };
    }
  }

  /**
   * Updates or creates a Secret with key-value data (automatically base64 encoded).
   */
  static async saveSecret(
    name: string,
    namespace: string,
    data: Record<string, string>,
    type = 'Opaque'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
      const encodedData: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        encodedData[k] = Buffer.from(v, 'utf-8').toString('base64');
      }

      const secretManifest = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name,
          namespace: namespace && namespace !== 'all-projects' ? namespace : 'default',
        },
        type,
        data: encodedData,
      };

      const jsonStr = JSON.stringify(secretManifest).replace(/'/g, "'\\''");
      const cmd = `echo '${jsonStr}' | oc apply ${nsFlag} -f -`;
      const { stdout, stderr } = await this.runCommand(cmd);
      if (stderr && !stdout) {
        return { success: false, message: stderr };
      }
      return { success: true, message: `Secret '${name}' saved successfully.` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to save secret' };
    }
  }

  /**
   * Resizes a PersistentVolumeClaim storage request.
   */
  static async resizePvc(
    name: string,
    namespace: string,
    newSize: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
      const patch = JSON.stringify({
        spec: {
          resources: {
            requests: {
              storage: newSize,
            },
          },
        },
      }).replace(/'/g, "'\\''");

      const cmd = `oc patch pvc "${name}" ${nsFlag} -p '${patch}'"${name}" ${nsFlag} -p '${patch}'`;
      const { stdout, stderr } = await this.runCommand(cmd);
      if (stderr && !stdout) {
        return { success: false, message: stderr };
      }
      return { success: true, message: `PVC '${name}' storage resized to ${newSize}.` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to resize PVC' };
    }
  }

  /**
   * Fetches all Custom Resource instances for a given CRD name.
   */
  static async getCrdInstances(
    crdName: string,
    namespace: string
  ): Promise<{ items: ResourceItem[]; scope?: string; crdKind?: string; group?: string; error?: string }> {
    try {
      // First get the CRD definition to determine scope, group, and kind
      const crdRes = await this.runCommand(`oc get crd "${crdName}" -o json"${crdName}" -o json`);
      let scope = 'Namespaced';
      let crdKind = crdName;
      let group = '';
      if (crdRes.stdout.trim()) {
        try {
          const crdJson = JSON.parse(crdRes.stdout);
          scope = crdJson.spec?.scope || 'Namespaced';
          crdKind = crdJson.spec?.names?.kind || crdName;
          group = crdJson.spec?.group || '';
        } catch {}
      }

      const isCluster = scope === 'Cluster';
      const isAll = !namespace || namespace === 'all-projects' || namespace === '__all__';
      const nsFlag = isCluster ? '' : (isAll ? '-A' : `-n "${namespace}"`);

      const cmd = `oc get "${crdName}" ${nsFlag} -o json"${crdName}" ${nsFlag} -o json`;
      const { stdout, stderr } = await this.runCommand(cmd);

      if (!stdout.trim()) {
        return { items: [], scope, crdKind, group, error: stderr || undefined };
      }

      const json = JSON.parse(stdout);
      const rawList = json.items || (json.kind ? [json] : []);
      const items: ResourceItem[] = rawList.map((raw: any) => {
        const meta = raw.metadata || {};
        const ns = meta.namespace || (isCluster ? 'cluster' : namespace);
        const name = meta.name || '';
        const age = formatAge(meta.creationTimestamp);

        // Status extraction
        const status =
          raw.status?.phase ||
          raw.status?.state ||
          raw.status?.conditions?.find((c: any) => c.status === 'True')?.type ||
          'Active';

        let statusColor: 'green' | 'yellow' | 'red' | 'gray' = 'green';
        const stLower = String(status).toLowerCase();
        if (stLower.includes('fail') || stLower.includes('err') || stLower.includes('degraded') || stLower.includes('false')) {
          statusColor = 'red';
        } else if (stLower.includes('progress') || stLower.includes('pending') || stLower.includes('warn')) {
          statusColor = 'yellow';
        }

        return {
          id: `${ns}/${name}`,
          name,
          namespace: ns,
          kind: crdName as any,
          status,
          statusColor,
          age,
          labels: meta.labels || {},
          raw,
        };
      });

      return { items, scope, crdKind, group };
    } catch (err: any) {
      return { items: [], error: err.message || 'Failed to fetch CRD instances' };
    }
  }

  /**
   * Fetches events, conditions, and related objects for a given ClusterOperator.
   */
  static async getClusterOperatorEvents(
    operatorName: string
  ): Promise<{
    operatorName: string;
    version?: string;
    status?: string;
    conditions: any[];
    events: ResourceItem[];
    relatedObjects?: any[];
    error?: string;
  }> {
    try {
      // 1. Fetch ClusterOperator definition
      const coRes = await this.runCommand(`oc get co "${operatorName}" -o json"${operatorName}" -o json`);
      let conditions: any[] = [];
      let relatedObjects: any[] = [];
      let version = '-';
      let status = 'Available';

      const relatedNamespaces = new Set<string>();
      relatedNamespaces.add(`openshift-${operatorName}`);

      if (coRes.stdout.trim()) {
        try {
          const coJson = JSON.parse(coRes.stdout);
          conditions = coJson.status?.conditions || [];
          relatedObjects = coJson.status?.relatedObjects || [];
          version = coJson.status?.versions?.[0]?.version || '-';

          const deg = conditions.find((c: any) => c.type === 'Degraded')?.status === 'True';
          const prog = conditions.find((c: any) => c.type === 'Progressing')?.status === 'True';
          const avail = conditions.find((c: any) => c.type === 'Available')?.status === 'True';
          if (deg) status = 'Degraded';
          else if (prog) status = 'Progressing';
          else if (!avail) status = 'Unavailable';

          for (const obj of relatedObjects) {
            if (obj.namespace) relatedNamespaces.add(obj.namespace);
          }
        } catch {}
      }

      // 2. Fetch all events and filter for this operator and its related namespaces
      const eventsRes = await this.runCommand('oc get events -A -o json');
      let events: ResourceItem[] = [];

      if (eventsRes.stdout.trim()) {
        try {
          const json = JSON.parse(eventsRes.stdout);
          const rawItems = json.items || [];

          const opLower = operatorName.toLowerCase();
          const filtered = rawItems.filter((ev: any) => {
            const evNs = (ev.metadata?.namespace || '').toLowerCase();
            const objName = (ev.involvedObject?.name || '').toLowerCase();
            const msg = (ev.message || '').toLowerCase();

            if (relatedNamespaces.has(ev.metadata?.namespace)) return true;
            if (objName.includes(opLower)) return true;
            if (msg.includes(opLower)) return true;
            return false;
          });

          events = filtered.map((raw: any) => {
            const eventType = raw.type || 'Normal';
            const reason = raw.reason || 'Event';
            const message = raw.message || '';
            const count = raw.count || 1;
            const objectKind = raw.involvedObject?.kind || 'Object';
            const objectName = raw.involvedObject?.name || '';
            const ns = raw.metadata?.namespace || 'default';
            const timestamp = raw.lastTimestamp || raw.eventTime || raw.metadata?.creationTimestamp;

            return {
              id: `${ns}/${raw.metadata?.name || objectName}`,
              name: `${objectKind}/${objectName}`,
              namespace: ns,
              kind: 'events' as const,
              status: reason,
              statusColor: (eventType === 'Warning' ? 'red' : 'green') as 'red' | 'green',
              age: formatAge(timestamp),
              extra: {
                eventType,
                reason,
                message,
                count,
                objectKind,
                objectName,
                lastSeen: timestamp,
                rawTimestamp: timestamp ? new Date(timestamp).getTime() : 0,
              },
              labels: raw.metadata?.labels || {},
              raw,
            };
          });

          // Sort newest first
          events.sort((a, b) => (b.extra?.rawTimestamp || 0) - (a.extra?.rawTimestamp || 0));
        } catch {}
      }

      return {
        operatorName,
        version,
        status,
        conditions,
        events,
        relatedObjects,
      };
    } catch (err: any) {
      return {
        operatorName,
        conditions: [],
        events: [],
        error: err.message || 'Failed to fetch operator events',
      };
    }
  }

  /**
   * Fetches rich debugging diagnostics for a pod (status, container crash state, exit codes, previous logs, events).
   */
  static async getPodDebugInfo(
    podName: string,
    namespace: string
  ): Promise<{ diagnostics?: PodDebugDiagnostics; error?: string }> {
    try {
      const getPodCmd = `oc get pod "${podName}" -n "${namespace}" -o json`;
      const { stdout: podStdout, stderr: podStderr } = await this.runCommand(getPodCmd);
      if (!podStdout) {
        return { error: podStderr || `Failed to fetch pod ${podName}` };
      }

      const podJson = JSON.parse(podStdout);
      const phase = podJson.status?.phase || 'Unknown';
      const nodeName = podJson.spec?.nodeName || '-';
      const podIP = podJson.status?.podIP || '-';
      const startTime = podJson.status?.startTime;
      const reason = podJson.status?.reason;
      const message = podJson.status?.message;

      const parseContainers = (specs: any[], statuses: any[]): ContainerDebugState[] => {
        return (specs || []).map((spec: any) => {
          const status = (statuses || []).find((s: any) => s.name === spec.name) || {};
          const ready = !!status.ready;
          const restartCount = status.restartCount || 0;
          const image = status.image || spec.image || '-';

          let stateType: 'running' | 'waiting' | 'terminated' = 'waiting';
          let stateDetails: any = {};

          if (status.state?.running) {
            stateType = 'running';
            stateDetails = status.state.running;
          } else if (status.state?.terminated) {
            stateType = 'terminated';
            stateDetails = status.state.terminated;
          } else if (status.state?.waiting) {
            stateType = 'waiting';
            stateDetails = status.state.waiting;
          }

          let lastStateDetails: any = undefined;
          if (status.lastState?.terminated) {
            lastStateDetails = status.lastState.terminated;
          } else if (status.lastState?.waiting) {
            lastStateDetails = status.lastState.waiting;
          }

          return {
            name: spec.name,
            image,
            ready,
            restartCount,
            state: {
              type: stateType,
              reason: stateDetails.reason,
              message: stateDetails.message,
              exitCode: stateDetails.exitCode,
              signal: stateDetails.signal,
              startedAt: stateDetails.startedAt,
              finishedAt: stateDetails.finishedAt,
            },
            lastState: lastStateDetails
              ? {
                  reason: lastStateDetails.reason,
                  message: lastStateDetails.message,
                  exitCode: lastStateDetails.exitCode,
                  signal: lastStateDetails.signal,
                  startedAt: lastStateDetails.startedAt,
                  finishedAt: lastStateDetails.finishedAt,
                }
              : undefined,
          };
        });
      };

      const containers = parseContainers(
        podJson.spec?.containers || [],
        podJson.status?.containerStatuses || []
      );

      const initContainers = parseContainers(
        podJson.spec?.initContainers || [],
        podJson.status?.initContainerStatuses || []
      );

      // Fetch Previous Logs (if crashed/restarted) or Recent Logs
      let previousLogs = '';
      let recentLogs = '';

      try {
        const prevLogsCmd = `oc logs "${podName}" -n "${namespace}" --previous --tail=100`;
        const { stdout: prevOut } = await this.runCommand(prevLogsCmd, 8000);
        previousLogs = prevOut;
      } catch {}

      try {
        const curLogsCmd = `oc logs "${podName}" -n "${namespace}" --tail=100`;
        const { stdout: curOut } = await this.runCommand(curLogsCmd, 8000);
        recentLogs = curOut;
      } catch {}

      // Fetch Pod Events
      const events: any[] = [];
      try {
        const eventsCmd = `oc get events -n "${namespace}" --field-selector involvedObject.name="${podName}" -o json`;
        const { stdout: evtOut } = await this.runCommand(eventsCmd, 8000);
        if (evtOut) {
          const evtJson = JSON.parse(evtOut);
          for (const item of evtJson.items || []) {
            events.push({
              type: item.type || 'Normal',
              reason: item.reason || '-',
              message: item.message || '',
              count: item.count || 1,
              lastTimestamp: item.lastTimestamp || item.eventTime || item.metadata?.creationTimestamp || '',
              source: item.source?.component || item.reportingComponent || '',
            });
          }
        }
      } catch {}

      // Determine smart suggested action
      let suggestedAction = 'Inspect container logs and status above or start an interactive debug session.';
      const hasOOM = containers.some((c) => c.state.reason === 'OOMKilled' || c.lastState?.reason === 'OOMKilled');
      const hasCrash = containers.some((c) => c.state.reason === 'CrashLoopBackOff' || (c.state.exitCode !== undefined && c.state.exitCode !== 0));
      const hasImagePull = containers.some((c) => c.state.reason?.includes('ImagePull') || c.state.reason?.includes('ErrImagePull'));

      if (hasOOM) {
        suggestedAction = 'Container was killed due to Out Of Memory (OOMKilled / Exit 137). Increase memory request/limit in pod or deployment resources.';
      } else if (hasImagePull) {
        suggestedAction = 'Image pull failed. Verify container image repository URL, tag, and image pull secret / credentials.';
      } else if (hasCrash) {
        suggestedAction = 'Application crashed on entrypoint. Launch an interactive Debug Shell (oc debug) or check Previous Logs to inspect the traceback.';
      }

      return {
        diagnostics: {
          podName,
          namespace,
          phase,
          nodeName,
          podIP,
          startTime,
          reason,
          message,
          containers,
          initContainers,
          previousLogs,
          recentLogs,
          events,
          suggestedAction,
        },
      };
    } catch (err: any) {
      return { error: err.message || 'Failed to retrieve pod diagnostics' };
    }
  }

  /**
   * Fetches detailed node health, capacity, conditions, system info, and events for node debugging.
   */
  static async getNodeDebugInfo(
    nodeName: string
  ): Promise<{ diagnostics?: NodeDebugDiagnostics; error?: string }> {
    try {
      const getNodeCmd = `oc get node "${nodeName}" -o json`;
      const { stdout: nodeStdout, stderr: nodeStderr } = await this.runCommand(getNodeCmd);
      if (!nodeStdout) {
        return { error: nodeStderr || `Failed to fetch node ${nodeName}` };
      }

      const nodeJson = JSON.parse(nodeStdout);
      const roles: string[] = [];
      const labels = nodeJson.metadata?.labels || {};
      for (const key of Object.keys(labels)) {
        if (key.startsWith('node-role.kubernetes.io/')) {
          roles.push(key.replace('node-role.kubernetes.io/', ''));
        }
      }
      if (roles.length === 0) roles.push('worker');

      const conditions = (nodeJson.status?.conditions || []).map((c: any) => ({
        type: c.type || '-',
        status: c.status || '-',
        reason: c.reason || '-',
        message: c.message || '',
        lastTransitionTime: c.lastTransitionTime || '',
      }));

      const readyCond = conditions.find((c: any) => c.type === 'Ready');
      const status = readyCond?.status === 'True' ? 'Ready' : 'NotReady';

      const capacity = {
        cpu: nodeJson.status?.capacity?.cpu || '-',
        memory: nodeJson.status?.capacity?.memory || '-',
        pods: nodeJson.status?.capacity?.pods || '-',
        ephemeralStorage: nodeJson.status?.capacity?.['ephemeral-storage'] || '-',
      };

      const allocatable = {
        cpu: nodeJson.status?.allocatable?.cpu || '-',
        memory: nodeJson.status?.allocatable?.memory || '-',
        pods: nodeJson.status?.allocatable?.pods || '-',
        ephemeralStorage: nodeJson.status?.allocatable?.['ephemeral-storage'] || '-',
      };

      const nodeInfo = nodeJson.status?.nodeInfo || {};
      const systemInfo = {
        osImage: nodeInfo.osImage || '-',
        kernelVersion: nodeInfo.kernelVersion || '-',
        containerRuntime: nodeInfo.containerRuntimeVersion || '-',
        kubeletVersion: nodeInfo.kubeletVersion || '-',
        architecture: nodeInfo.architecture || '-',
        operatingSystem: nodeInfo.operatingSystem || '-',
      };

      const taints = (nodeJson.spec?.taints || []).map((t: any) => ({
        key: t.key,
        value: t.value,
        effect: t.effect,
      }));

      const addresses = (nodeJson.status?.addresses || []).map((a: any) => ({
        type: a.type,
        address: a.address,
      }));

      // Fetch Node Events
      const events: any[] = [];
      try {
        const eventsCmd = `oc get events -A --field-selector involvedObject.name="${nodeName}" -o json`;
        const { stdout: evtOut } = await this.runCommand(eventsCmd, 8000);
        if (evtOut) {
          const evtJson = JSON.parse(evtOut);
          for (const item of evtJson.items || []) {
            events.push({
              type: item.type || 'Normal',
              reason: item.reason || '-',
              message: item.message || '',
              count: item.count || 1,
              lastTimestamp: item.lastTimestamp || item.eventTime || item.metadata?.creationTimestamp || '',
              source: item.source?.component || item.reportingComponent || '',
            });
          }
        }
      } catch {}

      return {
        diagnostics: {
          nodeName,
          status,
          roles,
          conditions,
          capacity,
          allocatable,
          systemInfo,
          taints,
          events,
          addresses,
        },
      };
    } catch (err: any) {
      return { error: err.message || 'Failed to retrieve node diagnostics' };
    }
  }
}
