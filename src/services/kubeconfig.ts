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
   * Finds the exact path to kubeconfig file.
   */
  static getKubeconfigPath(): string {
    const rawEnv = process.env['KUBECONFIG'];
    if (rawEnv) {
      const first = rawEnv.split(':')[0];
      if (first && fs.existsSync(first)) {
        return first;
      }
    }

    const home = process.env['HOME'] || os.homedir();
    const candidatePaths = [
      path.join(home, '.kube', 'config'),
      path.join('/Users', os.userInfo().username, '.kube', 'config'),
      '/Users/alexandru.chiscari/.kube/config',
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return path.join(home, '.kube', 'config');
  }

  /**
   * Reads raw kubeconfig directly from disk file.
   */
  static async getContexts(): Promise<{ contexts: KubeContext[]; currentContext: string | null }> {
    const kubePath = this.getKubeconfigPath();

    // 1. Direct synchronous file read and parse
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
    } catch (err: any) {
      console.error(`[KubeConfigService] Error reading ${kubePath}:`, err.message);
    }

    // 2. CLI fallback (oc config view -o json)
    try {
      const { stdout } = await execAsync('oc config view -o json', {
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
    } catch (error: any) {
      console.error('[KubeConfigService] Fallback oc config view failed:', error.message);
    }

    return { contexts: [], currentContext: null };
  }

  /**
   * Switches active context in kubeconfig.
   */
  static async switchContext(contextName: string): Promise<boolean> {
    try {
      await execAsync(`oc config use-context "${contextName}"`, {
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
   * 'All Projects (Cluster-Wide)' is ALWAYS the first option in the list.
   */
  static async getProjects(): Promise<ProjectInfo[]> {
    const currentNs = await this.getCurrentNamespace();

    const allProjectsFirst: ProjectInfo = {
      name: 'all-projects',
      displayName: 'All Projects (Cluster-Wide)',
      status: 'Active',
      isCurrent: currentNs === 'all-projects' || currentNs === '',
    };

    let projectList: ProjectInfo[] = [];

    // Strategy 1: oc get projects -o json
    try {
      const { stdout } = await execAsync('oc get projects -o json', { env: getExecEnv(), maxBuffer: 15 * 1024 * 1024 });
      const data = JSON.parse(stdout);
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        projectList = data.items.map((item: any) => ({
          name: item.metadata?.name,
          displayName: item.metadata?.annotations?.['openshift.io/display-name'] || item.metadata?.name,
          status: item.status?.phase || 'Active',
          isCurrent: item.metadata?.name === currentNs,
        }));
      }
    } catch (e) {}

    // Strategy 2: oc projects -q
    if (projectList.length === 0) {
      try {
        const { stdout } = await execAsync('oc projects -q', { env: getExecEnv() });
        const lines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          projectList = lines.map((name) => ({
            name,
            displayName: name,
            status: 'Active',
            isCurrent: name === currentNs,
          }));
        }
      } catch (e) {}
    }

    // Strategy 3: oc get namespaces -o json
    if (projectList.length === 0) {
      try {
        const { stdout } = await execAsync('oc get namespaces -o json', {
          env: getExecEnv(),
          maxBuffer: 15 * 1024 * 1024,
        });
        const data = JSON.parse(stdout);
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          projectList = data.items.map((item: any) => ({
            name: item.metadata?.name,
            displayName: item.metadata?.name,
            status: item.status?.phase || 'Active',
            isCurrent: item.metadata?.name === currentNs,
          }));
        }
      } catch (e) {}
    }

    // Sort projects alphabetically
    projectList.sort((a, b) => a.name.localeCompare(b.name));

    // Guarantee All Projects is FIRST
    return [allProjectsFirst, ...projectList.filter((p) => p.name !== 'all-projects')];
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

    return 'all-projects';
  }

  /**
   * Switches current active namespace/project.
   */
  static async switchProject(projectName: string): Promise<boolean> {
    if (projectName === 'all-projects' || !projectName) {
      return true;
    }

    try {
      await execAsync(`oc project "${projectName}"`, { env: getExecEnv() });
      return true;
    } catch (e) {
      try {
        await execAsync(`oc config set-context --current --namespace="${projectName}"`, {
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
      namespace: ns || 'all-projects',
      connected: !!currentContext,
    };
  }
}
