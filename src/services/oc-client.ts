import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ResourceKind, ResourceItem, ImageStreamResource, WorkloadDetails, WorkloadRevisionItem, WorkloadPodItem } from '../types/k8s.js';
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
    if (kind === 'helm') {
      return { items: [] };
    }

    const isAll = !namespace || namespace === 'all-projects' || namespace === '__all__';
    const nsFlag = isAll ? '-A' : `-n "${namespace}"`;

    let cmdKind = kind as string;
    if (kind === 'deploymentconfigs') cmdKind = 'dc';
    if (kind === 'imagestreams') cmdKind = 'is';
    if (kind === 'statefulsets') cmdKind = 'sts';
    if (kind === 'daemonsets') cmdKind = 'ds';
    if (kind === 'configmaps') cmdKind = 'cm';
    if (kind === 'events') cmdKind = 'events';

    const cmd = `oc get ${cmdKind} ${nsFlag} -o json || kubectl get ${cmdKind} ${nsFlag} -o json`;
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

          return {
            id: `${ns}/${name}`,
            name,
            namespace: ns,
            kind,
            status: type,
            statusColor: 'cyan' as const,
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
            statusColor: (admitted ? 'green' : 'yellow') as 'green' | 'yellow',
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
    const cmd = `oc describe ${cmdKind} "${name}" ${nsFlag} || kubectl describe ${cmdKind} "${name}" ${nsFlag}`;
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
    const cmd = `oc get ${cmdKind} "${name}" ${nsFlag} -o yaml || kubectl get ${cmdKind} "${name}" ${nsFlag} -o yaml`;
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
      const cmd = `oc apply -f "${tmpFile}" ${nsFlag} || kubectl apply -f "${tmpFile}" ${nsFlag}`;
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
   * Batch deletes Completed, Failed, and Error pods in a project.
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

      const podNames = matchingPods.map((p) => p.name);
      const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
      const cmd = `oc delete pod ${podNames.map((n) => `"${n}"`).join(' ')} ${nsFlag}`;
      const { stdout, stderr } = await this.runCommand(cmd, 30000);

      if (stderr && !stdout) {
        return { success: false, count: 0, deleted: [], message: stderr };
      }

      return {
        success: true,
        count: podNames.length,
        deleted: podNames,
        message: `Successfully cleared ${podNames.length} completed/failed pods: ${podNames.join(', ')}`,
      };
    } catch (err: any) {
      return { success: false, count: 0, deleted: [], message: err.message || 'Failed to prune pods' };
    }
  }

  /**
   * Scales a deployment, deploymentconfig, or statefulset.
   */
  static async scale(kind: string, name: string, namespace: string, replicas: number): Promise<{ success: boolean; message: string }> {
    let cmdKind = kind;
    if (kind === 'deploymentconfigs') cmdKind = 'dc';
    if (kind === 'statefulsets') cmdKind = 'sts';

    const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
    const cmd = `oc scale ${cmdKind} "${name}" --replicas=${replicas} ${nsFlag} || kubectl scale ${cmdKind} "${name}" --replicas=${replicas} ${nsFlag}`;
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
    let cmd = `oc rollout restart ${cmdKind}/${name} ${nsFlag} || kubectl rollout restart ${cmdKind}/${name} ${nsFlag}`;
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
    const cmd = `oc delete ${cmdKind} "${name}" ${nsFlag} || kubectl delete ${cmdKind} "${name}" ${nsFlag}`;
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
      const workloadCmd = `oc get ${cmdKind} "${name}" ${nsFlag} -o json || kubectl get ${cmdKind} "${name}" ${nsFlag} -o json`;
      
      // 2. Fetch revisions (RC for dc, RS for deployments, ControllerRevision for statefulset)
      let revisionsCmd = '';
      if (kind === 'deploymentconfigs') {
        revisionsCmd = `oc get rc ${nsFlag} -o json || kubectl get rc ${nsFlag} -o json`;
      } else if (kind === 'deployments') {
        revisionsCmd = `oc get rs ${nsFlag} -o json || kubectl get rs ${nsFlag} -o json`;
      } else if (kind === 'statefulsets') {
        revisionsCmd = `oc get controllerrevision ${nsFlag} -o json || kubectl get controllerrevision ${nsFlag} -o json`;
      }

      // 3. Fetch Pods
      const podsCmd = `oc get pods ${nsFlag} -o json || kubectl get pods ${nsFlag} -o json`;

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

      // Parse Pods
      const pods: WorkloadPodItem[] = [];
      if (podsRes.stdout.trim()) {
        try {
          const podList = JSON.parse(podsRes.stdout).items || [];
          for (const pod of podList) {
            const meta = pod.metadata || {};
            const podSpec = pod.spec || {};
            const podStatus = pod.status || {};
            const labels = meta.labels || {};

            let isMatch = false;
            if (kind === 'deploymentconfigs') {
              if (labels['deploymentconfig'] === name || 
                  labels['deployment']?.startsWith(`${name}-`) ||
                  meta.name?.startsWith(`${name}-`)) {
                isMatch = true;
              }
            } else if (kind === 'deployments') {
              const owners = meta.ownerReferences || [];
              const matchOwner = owners.some((o: any) => revisions.some(r => r.name === o.name) || o.name === name);
              const matchLabel = Object.entries(selectors).every(([k, v]) => labels[k] === v);
              if (matchOwner || (matchLabel && Object.keys(selectors).length > 0) || meta.name?.startsWith(`${name}-`)) {
                isMatch = true;
              }
            } else if (kind === 'statefulsets') {
              if (labels['app'] === name || 
                  labels['statefulset.kubernetes.io/pod-name']?.startsWith(name) ||
                  meta.name?.startsWith(`${name}-`)) {
                isMatch = true;
              }
            } else if (kind === 'daemonsets') {
              const matchLabel = Object.entries(selectors).every(([k, v]) => labels[k] === v);
              if ((matchLabel && Object.keys(selectors).length > 0) || meta.name?.startsWith(`${name}-`)) {
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
}
