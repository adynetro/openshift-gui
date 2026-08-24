import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getExecEnv } from './oc-client.js';

export interface LogEntry {
  id: number;
  pod?: string;
  container?: string;
  timestamp?: string;
  raw: string;
}

export class LogStreamer extends EventEmitter {
  private process: ChildProcess | null = null;
  private logs: LogEntry[] = [];
  private maxLines = 2500;
  private currentId = 0;
  private isStreaming = false;

  constructor(
    private targetName: string,
    private namespace: string,
    private kind: string = 'pods',
    private container?: string,
    private tailLines = 200
  ) {
    super();
  }

  start(): void {
    if (this.isStreaming) return;

    let args: string[] = [];
    const ns = this.namespace && this.namespace !== 'all-projects' ? this.namespace : 'default';

    if (this.kind === 'deployments') {
      args = [
        'logs',
        `deployment/${this.targetName}`,
        '-n',
        ns,
        '-f',
        `--tail=${this.tailLines}`,
        '--prefix=true',
        '--all-containers=true',
      ];
    } else if (this.kind === 'deploymentconfigs') {
      // Stream multi-pod aggregated logs from all pods belonging to this DeploymentConfig
      args = [
        'logs',
        '-l',
        `deploymentconfig=${this.targetName}`,
        '-n',
        ns,
        '-f',
        `--tail=${this.tailLines}`,
        '--prefix=true',
        '--all-containers=true',
      ];
    } else if (this.kind === 'statefulsets') {
      args = [
        'logs',
        `statefulset/${this.targetName}`,
        '-n',
        ns,
        '-f',
        `--tail=${this.tailLines}`,
        '--prefix=true',
        '--all-containers=true',
      ];
    } else if (this.kind === 'daemonsets') {
      args = [
        'logs',
        `daemonset/${this.targetName}`,
        '-n',
        ns,
        '-f',
        `--tail=${this.tailLines}`,
        '--prefix=true',
        '--all-containers=true',
      ];
    } else {
      // Pod logs
      args = ['logs', this.targetName, '-n', ns, '-f', `--tail=${this.tailLines}`, '--timestamps=true'];
      if (this.container) {
        args.push('-c', this.container);
      }
    }

    const env = getExecEnv();

    try {
      this.process = spawn('oc', args, { env });
    } catch (e) {
      this.process = spawn('kubectl', args, { env });
    }

    this.isStreaming = true;

    let partialLine = '';

    const handleData = (chunk: Buffer) => {
      const text = partialLine + chunk.toString('utf8');
      const lines = text.split('\n');
      partialLine = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        // Filter out CLI deprecation warning noise
        if (line.startsWith('Warning: apps.openshift.io/v1') || line.startsWith('Warning: DeploymentConfig')) {
          continue;
        }

        let pod: string | undefined;
        let container: string | undefined;
        let timestamp: string | undefined;
        let content = line;

        // 1. Parse multi-pod prefix [pod/<podName>/<containerName>] or [pod/<podName>]
        const prefixRegex = /^\[pod\/([^/\]]+)(?:\/([^\]]+))?\]\s*(.*)$/;
        const prefixMatch = content.match(prefixRegex);
        if (prefixMatch) {
          pod = prefixMatch[1];
          container = prefixMatch[2];
          content = prefixMatch[3];
        }

        // 2. Parse RFC3339 timestamp if present (e.g. 2026-08-24T12:00:00.123456789Z)
        const tsMatch = content.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)$/);
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

        this.logs.push(entry);
        if (this.logs.length > this.maxLines) {
          this.logs.shift();
        }

        this.emit('line', entry);
      }

      this.emit('update', [...this.logs]);
    };

    this.process.stdout?.on('data', handleData);
    this.process.stderr?.on('data', handleData);

    this.process.on('error', (err) => {
      this.emit('error', err);
    });

    this.process.on('close', (code) => {
      this.isStreaming = false;
      this.emit('end', code);
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.isStreaming = false;
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }
}
