import { spawn, ChildProcess } from 'node:child_process';
import { BrowserWindow } from 'electron';
import { getExecEnv } from './oc-client.js';

interface TerminalSession {
  id: string;
  process: ChildProcess;
  targetName: string;
  namespace: string;
  container?: string;
  mode?: 'exec' | 'debug-pod' | 'debug-node';
}

export class TerminalService {
  private static sessions = new Map<string, TerminalSession>();

  /**
   * Starts an interactive shell session in a pod or node using oc exec / oc debug.
   */
  static startSession(
    targetName: string,
    namespace: string,
    container?: string,
    window?: BrowserWindow,
    mode: 'exec' | 'debug-pod' | 'debug-node' = 'exec'
  ): string {
    const sessionId = `term-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const targetWin = window || BrowserWindow.getAllWindows()[0];

    const sendData = (text: string) => {
      const win = targetWin || BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:data', {
          sessionId,
          data: text,
        });
      }
    };

    let args: string[] = [];

    if (mode === 'debug-node') {
      // oc debug node/<nodeName> -> privileged host debugger
      args = ['debug', `node/${targetName}`];
    } else if (mode === 'debug-pod') {
      // oc debug pod/<podName> -n <namespace> -> replica debug container
      args = ['debug', `pod/${targetName}`];
      if (namespace && namespace !== 'all-projects' && namespace !== '__all__') {
        args.push('-n', namespace);
      }
      if (container) {
        args.push('-c', container);
      }
      args.push('--keep-annotations');
    } else {
      // Standard oc exec -i
      const execCmd = `stty onlcr 2>/dev/null || true; export TERM=xterm-256color; export PS1="[\\u@\\h \\W]\\$ "; if command -v bash >/dev/null 2>&1; then exec bash -i; elif command -v sh >/dev/null 2>&1; then exec sh -i; else exec /bin/sh -i; fi`;

      args = ['exec', '-i', targetName];
      if (namespace && namespace !== 'all-projects' && namespace !== '__all__') {
        args.push('-n', namespace);
      }
      if (container) {
        args.push('-c', container);
      }
      args.push('--', 'sh', '-c', execCmd);
    }

    const child = spawn('oc', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...getExecEnv(),
        TERM: 'xterm-256color',
      },
    });

    child.stdout.on('data', (chunk) => {
      sendData(chunk.toString('utf-8'));
    });

    child.stderr.on('data', (chunk) => {
      sendData(chunk.toString('utf-8'));
    });

    child.on('close', (code) => {
      sendData(`\r\n\x1b[33m[Session terminated (code ${code ?? 0})]\x1b[0m\r\n`);
      this.sessions.delete(sessionId);
    });

    child.on('error', (err) => {
      sendData(`\r\n\x1b[31m[Failed to connect: ${err.message}]\x1b[0m\r\n`);
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, {
      id: sessionId,
      process: child,
      targetName,
      namespace,
      container,
    });

    return sessionId;
  }

  /**
   * Writes input data to the terminal session's stdin.
   */
  static writeData(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.process.stdin && !session.process.stdin.destroyed) {
      // In xterm.js, Enter emits \r. Translate \r to \n for standard shell pipe
      const input = data.replace(/\r/g, '\n');
      session.process.stdin.write(input);
    }
  }

  /**
   * Stops and terminates an active terminal session.
   */
  static stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.process.kill('SIGTERM');
      } catch {}
      this.sessions.delete(sessionId);
    }
  }
}
