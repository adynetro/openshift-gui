import { spawn, ChildProcess } from 'node:child_process';
import { BrowserWindow } from 'electron';

interface TerminalSession {
  id: string;
  process: ChildProcess;
  targetName: string;
  namespace: string;
  container?: string;
}

export class TerminalService {
  private static sessions = new Map<string, TerminalSession>();

  /**
   * Starts an interactive shell session in a pod using oc exec or kubectl exec.
   */
  static startSession(
    targetName: string,
    namespace: string,
    container?: string,
    window?: BrowserWindow
  ): string {
    const sessionId = `term-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const nsFlag = namespace && namespace !== 'all-projects' ? `-n "${namespace}"` : '';
    const containerFlag = container ? `-c "${container}"` : '';

    // Shell command trying bash first, falling back to sh with proper environment
    const execCmd = `export TERM=xterm-256color; if command -v bash >/dev/null 2>&1; then exec bash; elif command -v sh >/dev/null 2>&1; then exec sh; else exec /bin/sh; fi`;

    const args = [
      'exec',
      '-i',
      targetName,
    ];

    if (namespace && namespace !== 'all-projects') {
      args.push('-n', namespace);
    }

    if (container) {
      args.push('-c', container);
    }

    args.push('--', 'sh', '-c', execCmd);

    // Try oc first, or fallback to kubectl
    const child = spawn('oc', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    child.stdout.on('data', (chunk) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('terminal:data', {
          sessionId,
          data: chunk.toString('utf-8'),
        });
      }
    });

    child.stderr.on('data', (chunk) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('terminal:data', {
          sessionId,
          data: chunk.toString('utf-8'),
        });
      }
    });

    child.on('close', (code) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('terminal:data', {
          sessionId,
          data: `\r\n\x1b[33m[Process exited with code ${code ?? 0}]\x1b[0m\r\n`,
        });
      }
      this.sessions.delete(sessionId);
    });

    child.on('error', (err) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('terminal:data', {
          sessionId,
          data: `\r\n\x1b[31m[Failed to launch terminal: ${err.message}]\x1b[0m\r\n`,
        });
      }
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
      session.process.stdin.write(data);
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
