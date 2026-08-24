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
   * Starts an interactive shell session in a pod using oc exec.
   */
  static startSession(
    targetName: string,
    namespace: string,
    container?: string,
    window?: BrowserWindow
  ): string {
    const sessionId = `term-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const targetWin = window || BrowserWindow.getAllWindows()[0];

    // Interactive shell command with colored prompt and fallback
    const execCmd = `stty onlcr 2>/dev/null || true; export TERM=xterm-256color; export PS1="[\\u@\\h \\W]\\$ "; if command -v bash >/dev/null 2>&1; then exec bash -i; elif command -v sh >/dev/null 2>&1; then exec sh -i; else exec /bin/sh -i; fi`;

    const args = ['exec', '-i', targetName];

    if (namespace && namespace !== 'all-projects') {
      args.push('-n', namespace);
    }

    if (container) {
      args.push('-c', container);
    }

    args.push('--', 'sh', '-c', execCmd);

    const child = spawn('oc', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    const sendData = (text: string) => {
      const win = targetWin || BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:data', {
          sessionId,
          data: text,
        });
      }
    };

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
