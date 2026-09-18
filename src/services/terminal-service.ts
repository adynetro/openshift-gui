import { BrowserWindow } from 'electron';
import WebSocket from 'ws';
import { KubeHttpClient } from './kube-http-client.js';
import { OcClient } from './oc-client.js';

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
  private static createdDebugPods = new Set<string>();

  /**
   * Spawns or resolves an active privileged debug pod on a Kubernetes/OpenShift node.
   */
  private static async getOrCreateNodeDebugPod(
    nodeName: string,
    sendData: (text: string) => void
  ): Promise<{ podName: string; namespace: string; cleanupOnExit: boolean }> {
    sendData(`\x1b[33m[Discovering debug pod for node '${nodeName}'...]\x1b[0m\r\n`);

    const cleanNode = nodeName.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'node';
    const candidateNamespaces = ['default', 'openshift-debug', 'kube-system'];

    // 1. Check if an active running debug pod already exists for this node
    for (const ns of candidateNamespaces) {
      try {
        const existingPods = await KubeHttpClient.getResourceList('pods', ns);
        if (existingPods.items && Array.isArray(existingPods.items)) {
          const matchingRunning = existingPods.items.find(
            (p: any) =>
              p.spec?.nodeName === nodeName &&
              (p.metadata?.name?.startsWith(`node-debugger-${cleanNode}`) ||
               p.metadata?.labels?.app === 'node-debugger' ||
               p.metadata?.labels?.['debug.openshift.io/node'] === cleanNode) &&
              p.status?.phase === 'Running'
          );
          if (matchingRunning && matchingRunning.metadata?.name) {
            sendData(`\x1b[32m[Connected to existing active debug pod '${matchingRunning.metadata.name}' in namespace '${ns}']\x1b[0m\r\n`);
            return { podName: matchingRunning.metadata.name, namespace: ns, cleanupOnExit: false };
          }
        }
      } catch {}
    }

    // 2. Discover cached image on target node to ensure zero ImagePullBackOff even in air-gapped clusters
    let selectedImage = 'registry.access.redhat.com/ubi9/ubi:latest';
    try {
      const allPods = await KubeHttpClient.getResourceList('pods', '');
      if (allPods.items && Array.isArray(allPods.items)) {
        const podOnNode = allPods.items.find(
          (p: any) => p.spec?.nodeName === nodeName && p.status?.phase === 'Running' && p.spec?.containers?.[0]?.image
        );
        if (podOnNode?.spec?.containers?.[0]?.image) {
          selectedImage = podOnNode.spec.containers[0].image;
        } else {
          const anyRunning = allPods.items.find(
            (p: any) => p.status?.phase === 'Running' && p.spec?.containers?.[0]?.image
          );
          if (anyRunning?.spec?.containers?.[0]?.image) {
            selectedImage = anyRunning.spec.containers[0].image;
          }
        }
      }
    } catch {}

    // 3. Create a privileged node debug pod
    const debugPodName = `node-debugger-${cleanNode}-${Date.now().toString(36).slice(-4)}`;
    const targetNs = 'default';

    sendData(`\x1b[33m[Spawning privileged debug pod '${debugPodName}' on node '${nodeName}' with image '${selectedImage}'...]\x1b[0m\r\n`);

    const podManifest = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: debugPodName,
        namespace: targetNs,
        labels: {
          app: 'node-debugger',
          node: cleanNode,
          'debug.openshift.io/node': cleanNode,
        },
      },
      spec: {
        nodeName: nodeName,
        hostPID: true,
        hostNetwork: true,
        hostIPC: true,
        tolerations: [
          { operator: 'Exists' },
        ],
        containers: [
          {
            name: 'debugger',
            image: selectedImage,
            command: ['/bin/sh', '-c', 'sleep 86400 || sleep 3600'],
            securityContext: {
              privileged: true,
            },
            volumeMounts: [
              {
                name: 'host-root',
                mountPath: '/host',
              },
            ],
          },
        ],
        volumes: [
          {
            name: 'host-root',
            hostPath: {
              path: '/',
            },
          },
        ],
        restartPolicy: 'Never',
      },
    };

    let createRes = await KubeHttpClient.requestJson(`/api/v1/namespaces/${targetNs}/pods`, {
      method: 'POST',
      body: podManifest,
    });

    let resolvedPodNs = targetNs;

    if (createRes.statusCode >= 400 || !createRes.data) {
      // If default fails, try openshift-debug
      const fallbackNs = 'openshift-debug';
      podManifest.metadata.namespace = fallbackNs;
      createRes = await KubeHttpClient.requestJson(`/api/v1/namespaces/${fallbackNs}/pods`, {
        method: 'POST',
        body: podManifest,
      });
      if (createRes.statusCode >= 400 || !createRes.data) {
        throw new Error(`Failed to create debug pod on node ${nodeName}: ${createRes.error || `HTTP ${createRes.statusCode}`}`);
      }
      resolvedPodNs = fallbackNs;
    }

    this.createdDebugPods.add(`${resolvedPodNs}/${debugPodName}`);
    sendData(`\x1b[32m[Debug pod '${debugPodName}' created in namespace '${resolvedPodNs}'. Waiting for container initialization...]\x1b[0m\r\n`);

    // 4. Poll until running (up to 30 seconds)
    const startTime = Date.now();
    while (Date.now() - startTime < 30000) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const podStatusRes = await KubeHttpClient.getResource('pods', debugPodName, resolvedPodNs);
        const phase = podStatusRes.data?.status?.phase;
        if (phase === 'Running') {
          sendData(`\x1b[32m[Debug pod '${debugPodName}' is Running on node '${nodeName}'. Connecting interactive shell...]\x1b[0m\r\n`);
          return { podName: debugPodName, namespace: resolvedPodNs, cleanupOnExit: true };
        } else if (phase === 'Failed') {
          throw new Error(`Debug pod entered Failed state: ${podStatusRes.data?.status?.message || 'Failed'}`);
        } else {
          sendData(`\x1b[90m.\x1b[0m`);
        }
      } catch (pollErr: any) {
        if (pollErr.message && pollErr.message.includes('Failed state')) {
          throw pollErr;
        }
      }
    }

    return { podName: debugPodName, namespace: resolvedPodNs, cleanupOnExit: true };
  }

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

    let resolvedTarget = targetName;
    let resolvedNs = namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : 'default';
    let resolvedContainer = container && container.trim() ? container.trim() : undefined;
    let shouldCleanupPodOnExit = false;

    // Shell command to initialize standard interactive environment
    const shellInit = mode === 'debug-node'
      ? [
          'sh',
          '-c',
          'export TERM=xterm-256color; export PS1="[\\u@\\h \\W]\\$ "; if [ -d /host/root ] && [ -x /host/bin/bash ]; then echo "\\033[36mℹ️  Host root filesystem is mounted at /host. Running chroot /host...\\033[0m\\r\\n"; chroot /host /bin/bash -i 2>/dev/null || chroot /host /bin/sh -i 2>/dev/null || exec /bin/sh -i; elif [ -d /host/bin ]; then chroot /host /bin/sh -i 2>/dev/null || exec /bin/sh -i; else exec /bin/sh -i; fi',
        ]
      : [
          'sh',
          '-c',
          'export TERM=xterm-256color; export PS1="[\\u@\\h \\W]\\$ "; if command -v bash >/dev/null 2>&1; then exec bash -i; elif command -v sh >/dev/null 2>&1; then exec sh -i; else exec /bin/sh -i; fi',
        ];

    const connect = async () => {
      // If mode is debug-node, resolve or spawn the privileged node debug pod
      if (mode === 'debug-node') {
        try {
          const debugPodInfo = await TerminalService.getOrCreateNodeDebugPod(targetName, sendData);
          resolvedTarget = debugPodInfo.podName;
          resolvedNs = debugPodInfo.namespace;
          resolvedContainer = 'debugger';
          shouldCleanupPodOnExit = debugPodInfo.cleanupOnExit;
        } catch (nodeDebugErr: any) {
          sendData(`\r\n\x1b[31m[Node Debugging Error: ${nodeDebugErr.message || nodeDebugErr}]\x1b[0m\r\n`);
          return;
        }
      } else {
        // If no container specified or namespace needs resolution, resolve from cluster
        if (!resolvedContainer || !namespace || namespace === 'all-projects' || namespace === '__all__') {
          try {
            const podInfo = await OcClient.getPodContainers(targetName, namespace);
            if (podInfo.resolvedNamespace) {
              resolvedNs = podInfo.resolvedNamespace;
            }
            if (!resolvedContainer && podInfo.defaultContainer) {
              resolvedContainer = podInfo.defaultContainer;
            }
          } catch {}
        }
      }

      let currentWs: WebSocket | null = null;
      let isRetrying = false;

      const attachWebSocket = async (targetCont?: string): Promise<WebSocket> => {
        const ws = await KubeHttpClient.createWebSocketExec(resolvedTarget, resolvedNs, {
          container: targetCont,
          command: shellInit,
          stdin: true,
          stdout: true,
          stderr: false,
          tty: true,
        });

        currentWs = ws;
        this.sessions.set(sessionId, {
          id: sessionId,
          ws,
          targetName: resolvedTarget,
          namespace: resolvedNs,
          container: targetCont,
          mode,
        });

        ws.on('open', () => {
          sendData(`\x1b[32m[Connected to ${mode === 'debug-node' ? `node ${targetName} via ${resolvedTarget}` : resolvedTarget}${targetCont ? ` (${targetCont})` : ''} in namespace ${resolvedNs}]\x1b[0m\r\n`);
        });

        ws.on('unexpected-response', (_req, res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let msg = `HTTP ${res.statusCode} ${res.statusMessage || ''}`;
            try {
              const parsed = JSON.parse(raw);
              if (parsed.message) {
                msg = `${parsed.message}`;
              } else if (parsed.reason) {
                msg = `${parsed.reason}`;
              }
            } catch {
              if (raw.trim()) {
                msg = `${raw.trim()}`;
              }
            }

            // Check if error is due to missing container name in multi-container pod:
            // "a container name must be specified for pod ..., choose one of: [csi-attacher vsphere-csi-controller ...]"
            const containerMatch = msg.match(/choose one of:\s*\[([^\]]+)\]/i);
            if (containerMatch && !targetCont && !isRetrying) {
              const candidates = containerMatch[1].trim().split(/\s+/).filter(Boolean);
              if (candidates.length > 0) {
                isRetrying = true;
                const autoCont = candidates[0];
                sendData(`\r\n\x1b[33m[Multiple containers detected: [${candidates.join(', ')}]. Automatically connecting to '${autoCont}']\x1b[0m\r\n`);
                try {
                  ws.terminate();
                } catch {}
                attachWebSocket(autoCont).catch((retryErr) => {
                  sendData(`\r\n\x1b[31m[Retry connection error: ${retryErr.message || retryErr}]\x1b[0m\r\n`);
                });
                return;
              }
            }

            sendData(`\r\n\x1b[31m[WebSocket connection rejected: ${msg} (HTTP ${res.statusCode})]\x1b[0m\r\n`);
          });
        });

        ws.on('message', (data: WebSocket.Data) => {
          if (ws !== currentWs) return;
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
          if (ws !== currentWs || isRetrying) return;
          const reasonStr = reason ? reason.toString() : '';
          sendData(`\r\n\x1b[33m[Session terminated (code ${code}${reasonStr ? `: ${reasonStr}` : ''})]\x1b[0m\r\n`);
          this.sessions.delete(sessionId);
          if (shouldCleanupPodOnExit && resolvedTarget.startsWith('node-debugger-')) {
            KubeHttpClient.requestJson(`/api/v1/namespaces/${resolvedNs}/pods/${resolvedTarget}`, {
              method: 'DELETE',
            }).catch(() => {});
          }
        });

        ws.on('error', (err) => {
          if (ws !== currentWs || isRetrying) return;
          sendData(`\r\n\x1b[31m[WebSocket connection error: ${err.message}]\x1b[0m\r\n`);
          this.sessions.delete(sessionId);
          if (shouldCleanupPodOnExit && resolvedTarget.startsWith('node-debugger-')) {
            KubeHttpClient.requestJson(`/api/v1/namespaces/${resolvedNs}/pods/${resolvedTarget}`, {
              method: 'DELETE',
            }).catch(() => {});
          }
        });

        return ws;
      };

      try {
        await attachWebSocket(resolvedContainer);
      } catch (err: any) {
        sendData(`\r\n\x1b[31m[Failed to initialize terminal session: ${err.message || err}]\x1b[0m\r\n`);
      }
    };

    connect();
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

  /**
   * Opens an interactive pod console session in the user's system default terminal (macOS Terminal/iTerm, Windows Terminal/PowerShell/cmd, Linux terminal).
   */
  static async openInDefaultTerminal(
    targetName: string,
    namespace: string,
    container?: string
  ): Promise<{ success: boolean; message: string }> {
    const { exec } = await import('node:child_process');
    const os = await import('node:os');

    let resolvedNs = namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : 'default';
    let resolvedContainer = container && container.trim() ? container.trim() : undefined;

    if (!resolvedContainer || !namespace || namespace === 'all-projects' || namespace === '__all__') {
      try {
        const podInfo = await OcClient.getPodContainers(targetName, namespace);
        if (podInfo.resolvedNamespace) {
          resolvedNs = podInfo.resolvedNamespace;
        }
        if (!resolvedContainer && podInfo.defaultContainer) {
          resolvedContainer = podInfo.defaultContainer;
        }
      } catch {}
    }

    const contFlag = resolvedContainer ? `-c ${resolvedContainer}` : '';
    const kubectlCmd = `kubectl exec -it ${targetName} -n ${resolvedNs} ${contFlag} -- /bin/sh -c "if command -v bash >/dev/null 2>&1; then exec bash -i; elif command -v sh >/dev/null 2>&1; then exec sh -i; else exec /bin/sh -i; fi" || oc rsh -n ${resolvedNs} ${contFlag} ${targetName}`;

    const platform = os.platform();

    return new Promise((resolve) => {
      if (platform === 'darwin') {
        // macOS Terminal.app or iTerm
        const escapedCmd = kubectlCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const appleScript = `tell application "Terminal"
          do script "${escapedCmd}"
          activate
        end tell`;
        exec(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`, (err) => {
          if (err) {
            resolve({ success: false, message: `Failed to open Terminal: ${err.message}` });
          } else {
            resolve({ success: true, message: `Opened ${targetName} console in macOS Terminal` });
          }
        });
      } else if (platform === 'win32') {
        // Windows: Try Windows Terminal (wt.exe), fallback to cmd.exe or PowerShell
        const winCmd = `start wt.exe cmd.exe /k "${kubectlCmd}" || start cmd.exe /k "${kubectlCmd}"`;
        exec(winCmd, (err) => {
          if (err) {
            resolve({ success: false, message: `Failed to open Windows Terminal: ${err.message}` });
          } else {
            resolve({ success: true, message: `Opened ${targetName} console in Windows Terminal` });
          }
        });
      } else {
        // Linux: Try standard terminal emulators
        const linuxCmd = `x-terminal-emulator -e '${kubectlCmd}' || gnome-terminal -- bash -c '${kubectlCmd}; exec bash' || konsole -e '${kubectlCmd}' || xfce4-terminal -e '${kubectlCmd}' || xterm -e '${kubectlCmd}'`;
        exec(linuxCmd, (err) => {
          if (err) {
            resolve({ success: false, message: `Failed to open Linux terminal: ${err.message}` });
          } else {
            resolve({ success: true, message: `Opened ${targetName} console in System Terminal` });
          }
        });
      }
    });
  }
}
