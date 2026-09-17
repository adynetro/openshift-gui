import { EventEmitter } from 'node:events';
import { KubeHttpClient } from './kube-http-client.js';

export interface LogEntry {
  id: number;
  pod?: string;
  container?: string;
  timestamp?: string;
  raw: string;
}

// Pre-compiled regex patterns to avoid per-line instantiation
const PREFIX_REGEX = /^\[(?:pod\/)?([^/\]]+)(?:\/([^\]]+))?\]\s*(.*)$/;
const TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)$/;

const WORKLOAD_KINDS = new Set([
  'deployments',
  'deployment',
  'deploy',
  'deploymentconfigs',
  'deploymentconfig',
  'dc',
  'statefulsets',
  'statefulset',
  'sts',
  'daemonsets',
  'daemonset',
  'ds',
  'jobs',
  'job',
  'cronjobs',
  'cronjob',
  'cj',
  'replicasets',
  'replicaset',
  'rs',
  'replicationcontrollers',
  'replicationcontroller',
  'rc',
]);

export class LogStreamer extends EventEmitter {
  private abortControllers: Array<() => void> = [];
  private logs: LogEntry[] = [];
  private maxLines = 3000;
  private currentId = 0;
  private isStreaming = false;

  constructor(
    private targetName: string,
    private namespace: string,
    private kind: string = 'pods',
    private container?: string,
    private tailLines = 250
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.isStreaming) return;
    this.isStreaming = true;

    const ns = this.namespace && this.namespace !== 'all-projects' ? this.namespace : 'default';
    const normalizedKind = (this.kind || 'pods').toLowerCase();

    if (WORKLOAD_KINDS.has(normalizedKind)) {
      // Aggregate logs from all pods belonging to this workload
      try {
        const podListRes = await KubeHttpClient.getResourceList('pods', ns);
        const matchingPods = (podListRes.items || []).filter((pod: any) => {
          const podName = pod.metadata?.name || '';
          const generateName = pod.metadata?.generateName || '';
          const labels = pod.metadata?.labels || {};
          const ownerRefs = pod.metadata?.ownerReferences || [];

          // 1. Direct pod name or exact match
          if (podName === this.targetName) return true;

          // 2. Owner reference match (direct or prefixed by workload name)
          if (
            ownerRefs.some(
              (ref: any) =>
                ref.name === this.targetName ||
                ref.name.startsWith(`${this.targetName}-`)
            )
          ) {
            return true;
          }

          // 3. Label matches
          if (
            labels.app === this.targetName ||
            labels['app.kubernetes.io/name'] === this.targetName ||
            labels['app.kubernetes.io/instance'] === this.targetName ||
            labels.deploymentconfig === this.targetName ||
            labels.deployment === this.targetName ||
            labels.statefulset === this.targetName ||
            labels.daemonset === this.targetName ||
            labels['job-name'] === this.targetName
          ) {
            return true;
          }

          // 4. Name prefix match
          if (
            podName.startsWith(`${this.targetName}-`) ||
            generateName.startsWith(`${this.targetName}-`)
          ) {
            return true;
          }

          return false;
        });

        if (matchingPods.length === 0) {
          // No running pods found yet
          const entry: LogEntry = {
            id: ++this.currentId,
            raw: `[No running pods found for ${this.kind}/${this.targetName} in namespace ${ns}]`,
          };
          this.logs.push(entry);
          this.emit('line', entry);
          this.emit('lines', [entry]);
          this.emit('update', this.logs);
          this.isStreaming = false;
          this.emit('end', 0);
          return;
        }

        for (const pod of matchingPods) {
          const podName = pod.metadata?.name;
          if (!podName) continue;
          await this.streamSinglePod(podName, ns, `[pod/${podName}] `, pod);
        }
      } catch (err: any) {
        this.safeEmitError(err);
        this.isStreaming = false;
      }
    } else {
      // Single pod logs
      await this.streamSinglePod(this.targetName, ns, '');
    }
  }

  private async streamSinglePod(
    podName: string,
    namespace: string,
    prefix: string,
    podObj?: any
  ): Promise<void> {
    // If container is specified, stream that container directly
    if (this.container) {
      await this.attachPodStream(podName, namespace, this.container, prefix);
      return;
    }

    // Auto-discover containers for this pod
    let containers: string[] = [];
    if (podObj?.spec?.containers && Array.isArray(podObj.spec.containers)) {
      containers = podObj.spec.containers.map((c: any) => c.name);
    } else {
      try {
        const podRes = await KubeHttpClient.getResource('pods', podName, namespace);
        if (podRes.data?.spec?.containers && Array.isArray(podRes.data.spec.containers)) {
          containers = podRes.data.spec.containers.map((c: any) => c.name);
        }
      } catch {}
    }

    if (containers.length > 1) {
      // Stream all containers in parallel with container badges
      for (const c of containers) {
        const contPrefix = prefix ? `${prefix}[${c}] ` : `[${c}] `;
        await this.attachPodStream(podName, namespace, c, contPrefix);
      }
    } else if (containers.length === 1) {
      await this.attachPodStream(podName, namespace, containers[0], prefix);
    } else {
      // Fallback: try default log endpoint
      await this.attachPodStream(podName, namespace, undefined, prefix);
    }
  }

  private async attachPodStream(
    podName: string,
    namespace: string,
    container: string | undefined,
    prefix: string
  ): Promise<void> {
    let partialLine = '';

    const handleChunk = (chunk: string) => {
      const text = partialLine + chunk;
      const lines = text.split('\n');
      partialLine = lines.pop() || '';

      const batch: LogEntry[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        let pod: string | undefined = prefix ? podName : undefined;
        let cont: string | undefined = container || this.container;
        let timestamp: string | undefined;
        let content = line;

        // 1. Parse multi-pod prefix [pod/<podName>/<containerName>] or [pod/<podName>]
        const prefixMatch = content.match(PREFIX_REGEX);
        if (prefixMatch) {
          pod = prefixMatch[1];
          cont = prefixMatch[2] || cont;
          content = prefixMatch[3];
        }

        // 2. Parse RFC3339 timestamp if present (e.g. 2026-08-24T12:00:00.123456789Z)
        const tsMatch = content.match(TIMESTAMP_REGEX);
        if (tsMatch) {
          timestamp = tsMatch[1];
          content = tsMatch[2];
        }

        const entry: LogEntry = {
          id: ++this.currentId,
          pod,
          container: cont,
          timestamp,
          raw: content,
        };

        batch.push(entry);
        this.logs.push(entry);
        this.emit('line', entry);
      }

      if (batch.length > 0) {
        this.emit('lines', batch);
        this.emit('update', this.logs);
      }

      // Bulk trim to avoid memory growth
      if (this.logs.length > this.maxLines + 200) {
        this.logs = this.logs.slice(-this.maxLines);
      }
    };

    try {
      const stream = await KubeHttpClient.streamLog(
        podName,
        namespace,
        {
          container,
          tailLines: this.tailLines,
          follow: true,
          timestamps: true,
        },
        handleChunk,
        async (err) => {
          const errMsg = err.message || '';

          // Handle CrashLoopBackOff or Container Waiting
          if (
            errMsg.includes('CrashLoopBackOff') ||
            errMsg.includes('waiting to start') ||
            errMsg.includes('terminated')
          ) {
            const warnEntry: LogEntry = {
              id: ++this.currentId,
              pod: podName,
              container,
              raw: `[${podName}${container ? `/${container}` : ''}] ${errMsg}`,
            };
            this.logs.push(warnEntry);
            this.emit('line', warnEntry);
            this.emit('lines', [warnEntry]);
            this.emit('update', this.logs);

            // Fetch previous terminated logs if available
            try {
              const contParam = container ? `&container=${encodeURIComponent(container)}` : '';
              const prevRes = await KubeHttpClient.requestRaw(
                `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/log?previous=true&tailLines=${this.tailLines}&timestamps=true${contParam}`
              );
              if (
                prevRes.statusCode >= 200 &&
                prevRes.statusCode < 300 &&
                prevRes.data?.trim()
              ) {
                const headerEntry: LogEntry = {
                  id: ++this.currentId,
                  pod: podName,
                  container,
                  raw: `[${podName}${container ? `/${container}` : ''}] --- Previous Terminated Logs ---`,
                };
                this.logs.push(headerEntry);
                this.emit('line', headerEntry);
                this.emit('lines', [headerEntry]);
                this.emit('update', this.logs);
                handleChunk(prevRes.data + '\n');
              }
            } catch {}
          } else if (errMsg.includes('choose one of:')) {
            // Container name was required: parse and stream each container
            const match = errMsg.match(/choose one of:\s*\[(.*?)\]/);
            if (match && match[1]) {
              const parsedContainers = match[1].split(/\s+/).filter(Boolean);
              for (const c of parsedContainers) {
                const contPrefix = prefix ? `${prefix}[${c}] ` : `[${c}] `;
                await this.attachPodStream(podName, namespace, c, contPrefix);
              }
              return;
            }
            this.safeEmitError(err, podName, container);
          } else {
            this.safeEmitError(err, podName, container);
          }
        },
        (code) => {
          this.emit('end', code);
        }
      );

      this.abortControllers.push(stream.abort);
    } catch (err: any) {
      this.safeEmitError(err, podName, container);
    }
  }

  private safeEmitError(err: Error, podName?: string, container?: string): void {
    const entry: LogEntry = {
      id: ++this.currentId,
      pod: podName,
      container,
      raw: `[Log Error: ${err.message || 'Stream failed'}]`,
    };
    this.logs.push(entry);
    this.emit('line', entry);
    this.emit('lines', [entry]);
    this.emit('update', this.logs);

    if (this.listenerCount('error') > 0) {
      this.emit('error', err);
    }
  }

  stop(): void {
    for (const abort of this.abortControllers) {
      try {
        abort();
      } catch {}
    }
    this.abortControllers = [];
    this.isStreaming = false;
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }
}
