import { spawn, ChildProcess } from 'node:child_process';
import net from 'node:net';
import { getExecEnv } from './oc-client.js';
import { KubeHttpClient } from './kube-http-client.js';

export interface PortForwardSession {
  id: string;
  kind: 'services' | 'pods' | 'routes' | 'ingresses';
  name: string;
  namespace: string;
  localPort: number;
  targetPort: number | string;
  status: 'starting' | 'active' | 'error' | 'stopped';
  url: string;
  pid?: number;
  startedAt: string;
  error?: string;
}

export interface DetectedPort {
  port: number;
  targetPort?: number | string;
  name?: string;
  protocol?: string;
  nodePort?: number;
}

export class PortForwardService {
  private static activeProcesses = new Map<string, { process: ChildProcess; session: PortForwardSession }>();

  /**
   * Discovers available ports from a service, pod, or route spec.
   */
  static async getAvailablePorts(
    kind: string,
    name: string,
    namespace: string
  ): Promise<{ ports: DetectedPort[]; defaultLocalPort: number }> {
    const ns = namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : 'default';
    const normalizedKind = (kind || 'services').toLowerCase();
    const ports: DetectedPort[] = [];

    try {
      if (normalizedKind === 'services' || normalizedKind === 'service' || normalizedKind === 'svc') {
        const res = await KubeHttpClient.getResource('services', name, ns);
        const specPorts = res.data?.spec?.ports || [];
        for (const p of specPorts) {
          if (p.port) {
            ports.push({
              port: p.port,
              targetPort: p.targetPort || p.port,
              name: p.name || '',
              protocol: p.protocol || 'TCP',
              nodePort: p.nodePort,
            });
          }
        }
      } else if (normalizedKind === 'pods' || normalizedKind === 'pod') {
        const res = await KubeHttpClient.getResource('pods', name, ns);
        const containers = res.data?.spec?.containers || [];
        for (const c of containers) {
          const cPorts = c.ports || [];
          for (const p of cPorts) {
            if (p.containerPort) {
              ports.push({
                port: p.containerPort,
                targetPort: p.containerPort,
                name: p.name || c.name,
                protocol: p.protocol || 'TCP',
              });
            }
          }
        }
      } else if (normalizedKind === 'routes' || normalizedKind === 'route') {
        // Find backend service for route
        const res = await KubeHttpClient.getResource('routes', name, ns);
        const targetSvc = res.data?.spec?.to?.name;
        if (targetSvc) {
          return this.getAvailablePorts('services', targetSvc, ns);
        }
      }
    } catch (err: any) {
      console.warn(`[PortForwardService] Error discovering ports for ${kind}/${name}:`, err.message);
    }

    // Default port discovery fallback
    if (ports.length === 0) {
      ports.push({ port: 80, targetPort: 80, protocol: 'TCP' });
      ports.push({ port: 8080, targetPort: 8080, protocol: 'TCP' });
    }

    const defaultPort = ports[0]?.port || 8080;
    const defaultLocalPort = await this.findAvailableLocalPort(defaultPort > 1024 ? defaultPort : 8080);

    return { ports, defaultLocalPort };
  }

  /**
   * Finds an available free local TCP port on localhost.
   */
  static async findAvailableLocalPort(startingPort: number = 8080): Promise<number> {
    const isPortFree = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
          server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
      });
    };

    let port = startingPort;
    while (port < 65535) {
      if (await isPortFree(port)) {
        return port;
      }
      port++;
    }
    return startingPort;
  }

  /**
   * Starts a port-forward background session for a service or pod.
   */
  static async startPortForward(
    kind: 'services' | 'pods' | 'routes' | 'ingresses',
    name: string,
    namespace: string,
    localPort: number,
    targetPort: number | string
  ): Promise<PortForwardSession> {
    const ns = namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : 'default';
    const sessionId = `pf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const url = `http://localhost:${localPort}`;

    let targetResource = `${kind === 'services' ? 'svc' : 'pod'}/${name}`;
    if (kind === 'routes' || kind === 'ingresses') {
      // If route or ingress, discover target service
      try {
        const res = await KubeHttpClient.getResource('routes', name, ns);
        const svcName = res.data?.spec?.to?.name;
        if (svcName) {
          targetResource = `svc/${svcName}`;
        }
      } catch {}
    }

    const session: PortForwardSession = {
      id: sessionId,
      kind,
      name,
      namespace: ns,
      localPort,
      targetPort,
      status: 'starting',
      url,
      startedAt: new Date().toISOString(),
    };

    const env = getExecEnv();
    const args = [
      'port-forward',
      '-n',
      ns,
      targetResource,
      `${localPort}:${targetPort}`,
    ];

    return new Promise((resolve, reject) => {
      let resolved = false;
      let processInstance: ChildProcess;

      try {
        // Try kubectl or oc
        processInstance = spawn('kubectl', args, {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        try {
          processInstance = spawn('oc', args, {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (ocErr: any) {
          session.status = 'error';
          session.error = `Failed to spawn port-forward process: ${err.message || ocErr.message}`;
          return reject(new Error(session.error));
        }
      }

      session.pid = processInstance.pid;
      this.activeProcesses.set(sessionId, { process: processInstance, session });

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          session.status = 'active';
          resolve(session);
        }
      }, 3500);

      processInstance.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('Forwarding from') || text.includes('127.0.0.1:') || text.includes('localhost:')) {
          session.status = 'active';
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(session);
          }
        }
      });

      processInstance.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        // Ignore normal handling logs, check for fatal errors
        if (
          text.includes('error:') ||
          text.includes('bind: address already in use') ||
          text.includes('not found') ||
          text.includes('Unauthorized')
        ) {
          session.error = text.trim();
          session.status = 'error';
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(new Error(text.trim()));
          }
        }
      });

      processInstance.on('error', (err: Error) => {
        session.status = 'error';
        session.error = err.message;
        this.activeProcesses.delete(sessionId);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      processInstance.on('close', (code) => {
        session.status = code === 0 ? 'stopped' : 'error';
        this.activeProcesses.delete(sessionId);
      });
    });
  }

  /**
   * Stops an active port-forwarding session.
   */
  static stopPortForward(sessionId: string): boolean {
    const entry = this.activeProcesses.get(sessionId);
    if (entry) {
      try {
        entry.process.kill('SIGTERM');
        setTimeout(() => {
          try {
            entry.process.kill('SIGKILL');
          } catch {}
        }, 500);
      } catch {}
      this.activeProcesses.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Stops all active port-forward sessions.
   */
  static stopAll(): void {
    for (const [id, entry] of this.activeProcesses.entries()) {
      try {
        entry.process.kill('SIGKILL');
      } catch {}
    }
    this.activeProcesses.clear();
  }

  /**
   * Lists all active port-forward sessions.
   */
  static listSessions(): PortForwardSession[] {
    return Array.from(this.activeProcesses.values()).map((entry) => entry.session);
  }
}
