import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml } from 'yaml';
import { KubeContext, ProjectInfo, ClusterInfo } from '../types/k8s.js';
import { getExecEnv } from './oc-client.js';

const execAsync = promisify(exec);

export class KubeConfigService {
  /**
   * Resolves the active kubeconfig path(s).
   */
  private static getKubeconfigPaths(): string[] {
    const raw = process.env['KUBECONFIG'];
    if (raw) {
      return raw.split(':').filter(Boolean);
    }
    const home = process.env['HOME'] || os.homedir();
    return [
      path.join(home, '.kube', 'config'),
      path.join('/Users', os.userInfo().username, '.kube', 'config'),
    ];
  }

  /**
   * Reads kubeconfig and parses all contexts, active context, clusters, and users.
   */
  static async getContexts(): Promise<{ contexts: KubeContext[]; currentContext: string | null }> {
    // Strategy 1: Direct YAML parsing of kubeconfig files
    for (const kubePath of this.getKubeconfigPaths()) {
      try {
        if (fs.existsSync(kubePath)) {
          const fileContent = fs.readFileSync(kubePath, 'utf8');
          const config = parseYaml(fileContent);

          if (config && Array.isArray(config.contexts) && config.contexts.length > 0) {
            const current = config['current-context'] || null;
            const contexts: KubeContext[] = config.contexts.map((ctx: any) => ({
              name: ctx.name,
              cluster: ctx.context?.cluster || '',
              user: ctx.context?.user || '',
              namespace: ctx.context?.namespace || 'default',
              isCurrent: ctx.name === current,
            }));

            return { contexts, currentContext: current };
          }
        }
      } catch (err) {
        console.warn(`Direct file read failed for ${kubePath}:`, err);
      }
    }

    // Strategy 2: CLI `oc config view -o json` / `kubectl config view -o json`
    try {
      const { stdout } = await execAsync('oc config view -o json || kubectl config view -o json', {
        env: getExecEnv(),
        maxBuffer: 20 * 1024 * 1024,
      });
      if (stdout.trim()) {
        const config = JSON.parse(stdout);
        const current = config['current-context'] || null;
        const contexts: KubeContext[] = (config.contexts || []).map((ctx: any) => ({
          name: ctx.name,
          cluster: ctx.context?.cluster || '',
          user: ctx.context?.user || '',
          namespace: ctx.context?.namespace || 'default',
          isCurrent: ctx.name === current,
        }));

        if (contexts.length > 0) {
          return { contexts, currentContext: current };
        }
      }
    } catch (error) {
      console.warn('CLI config view failed:', error);
    }

    // Strategy 3: Parse `oc config get-contexts` output
    try {
      const { stdout } = await execAsync('oc config get-contexts --no-headers || kubectl config get-contexts --no-headers', {
        env: getExecEnv(),
      });
      const lines = stdout.trim().split('\n').filter(Boolean);
      let current: string | null = null;
      const contexts: KubeContext[] = [];

      for (const line of lines) {
        const isCur = line.startsWith('*');
        const parts = line.replace(/^\*/, '').trim().split(/\s+/);
        if (parts.length >= 1) {
          const name = parts[0]!;
          if (isCur) current = name;
          contexts.push({
            name,
            cluster: parts[1] || '',
            user: parts[2] || '',
            namespace: parts[3] || 'default',
            isCurrent: isCur,
          });
        }
      }

      if (contexts.length > 0) {
        return { contexts, currentContext: current };
      }
    } catch (e) {
      console.warn('CLI get-contexts failed:', e);
    }

    return { contexts: [], currentContext: null };
  }

  /**
   * Switches active context in kubeconfig.
   */
  static async switchContext(contextName: string): Promise<boolean> {
    try {
      await execAsync(`oc config use-context "${contextName}" || kubectl config use-context "${contextName}"`, {
        env: getExecEnv(),
      });
      return true;
    } catch (error) {
      console.error('Failed to switch context:', error);
      return false;
    }
  }

  /**
   * Retrieves all available projects / namespaces in the current cluster.
   */
  static async getProjects(): Promise<ProjectInfo[]> {
    const currentNs = await this.getCurrentNamespace();

    // Strategy 1: oc get projects -o json
    try {
      const { stdout } = await execAsync('oc get projects -o json', { env: getExecEnv(), maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(stdout);
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        return data.items.map((item: any) => ({
          name: item.metadata?.name,
          displayName: item.metadata?.annotations?.['openshift.io/display-name'] || item.metadata?.name,
          status: item.status?.phase || 'Active',
          isCurrent: item.metadata?.name === currentNs,
        }));
      }
    } catch (e) {}

    // Strategy 2: oc projects -q
    try {
      const { stdout } = await execAsync('oc projects -q', { env: getExecEnv() });
      const lines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        return lines.map((name) => ({
          name,
          displayName: name,
          status: 'Active',
          isCurrent: name === currentNs,
        }));
      }
    } catch (e) {}

    // Strategy 3: kubectl get namespaces -o json
    try {
      const { stdout } = await execAsync('kubectl get namespaces -o json || oc get namespaces -o json', {
        env: getExecEnv(),
        maxBuffer: 10 * 1024 * 1024,
      });
      const data = JSON.parse(stdout);
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        return data.items.map((item: any) => ({
          name: item.metadata?.name,
          displayName: item.metadata?.name,
          status: item.status?.phase || 'Active',
          isCurrent: item.metadata?.name === currentNs,
        }));
      }
    } catch (e) {}

    return [
      { name: currentNs, displayName: currentNs, status: 'Active', isCurrent: true },
      { name: 'default', displayName: 'default', status: 'Active', isCurrent: currentNs === 'default' },
    ];
  }

  /**
   * Gets current active namespace/project.
   */
  static async getCurrentNamespace(): Promise<string> {
    try {
      const { stdout } = await execAsync('oc project -q', { env: getExecEnv() });
      if (stdout.trim()) return stdout.trim();
    } catch (e) {}

    try {
      const { contexts, currentContext } = await this.getContexts();
      const current = contexts.find((c) => c.isCurrent || c.name === currentContext);
      if (current && current.namespace) {
        return current.namespace;
      }
    } catch (e) {}

    return 'default';
  }

  /**
   * Switches current active namespace/project.
   */
  static async switchProject(projectName: string): Promise<boolean> {
    try {
      await execAsync(`oc project "${projectName}"`, { env: getExecEnv() });
      return true;
    } catch (e) {
      try {
        await execAsync(`kubectl config set-context --current --namespace="${projectName}"`, {
          env: getExecEnv(),
        });
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  /**
   * Gets cluster metadata.
   */
  static async getClusterInfo(): Promise<ClusterInfo> {
    const { contexts, currentContext } = await this.getContexts();
    const active = contexts.find((c) => c.isCurrent || c.name === currentContext);
    const ns = await this.getCurrentNamespace();

    let clusterUser = active?.user || '';
    try {
      const { stdout } = await execAsync('oc whoami', { env: getExecEnv() });
      if (stdout.trim()) clusterUser = stdout.trim();
    } catch (e) {}

    return {
      server: active?.cluster || 'Unknown Cluster',
      user: clusterUser || active?.user || 'Unknown User',
      context: currentContext || 'None',
      namespace: ns || 'default',
      connected: !!currentContext,
    };
  }
}
