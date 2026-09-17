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
const PREFIX_REGEX = /^\[pod\/([^/\]]+)(?:\/([^\]]+))?\]\s*(.*)$/;
const TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)$/;

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

    if (['deployments', 'deploymentconfigs', 'statefulsets', 'daemonsets'].includes(this.kind)) {
      // Aggregate logs from all pods belonging to this workload
      try {
        const podListRes = await KubeHttpClient.getResourceList('pods', ns);
        const matchingPods = (podListRes.items || []).filter((pod: any) => {
          const podName = pod.metadata?.name || '';
          const generateName = pod.metadata?.generateName || '';
          const labels = pod.metadata?.labels || {};
          const ownerRefs = pod.metadata?.ownerReferences || [];

          // 1. Owner reference match
          if (ownerRefs.some((ref: any) => ref.name === this.targetName)) return true;

          // 2. Label matches
          if (labels.app === this.targetName || labels['app.kubernetes.io/name'] === this.targetName || labels['app.kubernetes.io/instance'] === this.targetName) return true;
          if (labels.deploymentconfig === this.targetName || labels.deployment === this.targetName || labels.statefulset === this.targetName) return true;

          // 3. Name prefix match
          if (podName.startsWith(`${this.targetName}-`) || generateName.startsWith(`${this.targetName}-`)) return true;

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
          this.isStreaming = false;
          this.emit('end', 0);
          return;
        }

        for (const pod of matchingPods) {
          const podName = pod.metadata?.name;
          if (!podName) continue;
          this.streamSinglePod(podName, ns, `[pod/${podName}] `);
        }
      } catch (err: any) {
        this.emit('error', err);
        this.isStreaming = false;
      }
    } else {
      // Single pod logs
      this.streamSinglePod(this.targetName, ns, '');
    }
  }

  private async streamSinglePod(podName: string, namespace: string, prefix: string): Promise<void> {
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
        let container: string | undefined = this.container;
        let timestamp: string | undefined;
        let content = line;

        // 1. Parse multi-pod prefix [pod/<podName>/<containerName>] or [pod/<podName>]
        const prefixMatch = content.match(PREFIX_REGEX);
        if (prefixMatch) {
          pod = prefixMatch[1];
          container = prefixMatch[2] || container;
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
          container,
          timestamp,
          raw: content,
        };

        batch.push(entry);
        this.logs.push(entry);
        this.emit('line', entry);
      }

      if (batch.length > 0) {
        this.emit('lines', batch);
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
          container: this.container,
          tailLines: this.tailLines,
          follow: true,
          timestamps: true,
        },
        handleChunk,
        (err) => {
          this.emit('error', err);
        },
        (code) => {
          this.emit('end', code);
        }
      );

      this.abortControllers.push(stream.abort);
    } catch (err: any) {
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
