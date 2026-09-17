import { BrowserWindow } from 'electron';
import WebSocket from 'ws';
import { KubeHttpClient } from './kube-http-client.js';

interface TerminalSession {
  id: string;
  ws: WebSocket;
  targetName: string;
  namespace: string;
  container?: string;
  mode?: 'exec' | 'debug-pod' | 'debug-node';
}

export class TerminalService {
  private static sessions = new Map<string, TerminalSession>();

  /**
   * Starts an interactive shell session in a pod or node using native Kubernetes WebSocket Exec.
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

    const ns = namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : 'default';

    // Shell command to initialize standard interactive environment
    const shellInit = [
      'sh',
      '-c',
      'export TERM=xterm-256color; export PS1="[\\u@\\h \\W]\\$ "; if command -v bash >/dev/null 2>&1; then exec bash -i; elif command -v sh >/dev/null 2>&1; then exec sh -i; else exec /bin/sh -i; fi',
    ];

    KubeHttpClient.createWebSocketExec(targetName, ns, {
      container,
      command: shellInit,
      stdin: true,
      stdout: true,
      stderr: true,
      tty: true,
    })
      .then((ws) => {
        this.sessions.set(sessionId, {
          id: sessionId,
          ws,
          targetName,
          namespace: ns,
          container,
          mode,
        });

        ws.on('open', () => {
          sendData(`\x1b[32m[Connected to ${targetName}${container ? ` (${container})` : ''} in namespace ${ns}]\x1b[0m\r\n`);
        });

        ws.on('message', (data: WebSocket.Data) => {
          let buffer: Buffer;
          if (Buffer.isBuffer(data)) {
            buffer = data;
          } else if (Array.isArray(data)) {
            buffer = Buffer.concat(data);
          } else if (data instanceof ArrayBuffer) {
            buffer = Buffer.from(data);
          } else {
            buffer = Buffer.from(data as string);
          }

          if (buffer.length === 0) return;

          const channel = buffer[0];
          const payload = buffer.subarray(1).toString('utf8');

          if (channel === 1 || channel === 2) {
            // Stdout or Stderr
            sendData(payload);
          } else if (channel === 3) {
            // Error / Exit code JSON
            try {
              const statusObj = JSON.parse(payload);
              if (statusObj.status === 'Failure') {
                sendData(`\r\n\x1b[31m[Exec status: ${statusObj.message || 'Failure'}]\x1b[0m\r\n`);
              }
            } catch {}
          }
        });

        ws.on('close', (code, reason) => {
          sendData(`\r\n\x1b[33m[Session terminated (code ${code}${reason ? `: ${reason}` : ''})]\x1b[0m\r\n`);
          this.sessions.delete(sessionId);
        });

        ws.on('error', (err) => {
          sendData(`\r\n\x1b[31m[WebSocket connection error: ${err.message}]\x1b[0m\r\n`);
          this.sessions.delete(sessionId);
        });
      })
      .catch((err: any) => {
        sendData(`\r\n\x1b[31m[Failed to initialize terminal session: ${err.message || err}]\x1b[0m\r\n`);
      });

    return sessionId;
  }

  /**
   * Writes input data to the terminal session's stdin (Channel 0).
   */
  static writeData(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
      // Channel 0 = Stdin
      const payload = Buffer.from(data, 'utf8');
      const packet = Buffer.concat([Buffer.from([0x00]), payload]);
      session.ws.send(packet);
    }
  }

  /**
   * Resizes the remote terminal dimensions (Channel 4).
   */
  static resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
      // Channel 4 = Terminal Resize JSON
      const resizePayload = JSON.stringify({ Width: cols, Height: rows });
      const packet = Buffer.concat([Buffer.from([0x04]), Buffer.from(resizePayload, 'utf8')]);
      session.ws.send(packet);
    }
  }

  /**
   * Stops and terminates an active terminal session.
   */
  static stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.close();
        }
      } catch {}
      this.sessions.delete(sessionId);
    }
  }
}
