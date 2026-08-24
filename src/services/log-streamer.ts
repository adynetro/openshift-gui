import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface LogEntry {
  id: number;
  timestamp?: string;
  raw: string;
}

export class LogStreamer extends EventEmitter {
  private process: ChildProcess | null = null;
  private logs: LogEntry[] = [];
  private maxLines = 1000;
  private currentId = 0;
  private isStreaming = false;

  constructor(
    private podName: string,
    private namespace: string,
    private container?: string,
    private tailLines = 100
  ) {
    super();
  }

  start(): void {
    if (this.isStreaming) return;

    const args = ['logs', '-f', this.podName, '-n', this.namespace, `--tail=${this.tailLines}`, '--timestamps=true'];
    if (this.container) {
      args.push('-c', this.container);
    }

    try {
      this.process = spawn('oc', args);
    } catch (e) {
      this.process = spawn('kubectl', args);
    }

    this.isStreaming = true;

    let partialLine = '';

    const handleData = (chunk: Buffer) => {
      const text = partialLine + chunk.toString('utf8');
      const lines = text.split('\n');
      partialLine = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        let timestamp: string | undefined;
        let content = line;

        // Parse RFC3339 timestamp if present (e.g. 2026-08-24T12:00:00.123456789Z)
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z)\s+(.*)$/);
        if (tsMatch) {
          timestamp = tsMatch[1];
          content = tsMatch[3];
        }

        const entry: LogEntry = {
          id: ++this.currentId,
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
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
    this.emit('update', []);
  }
}
