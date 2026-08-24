import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml } from 'yaml';
import { KubeContext, ProjectInfo, ClusterInfo } from '../types/k8s.js';
import { getExecEnv } from './oc-client.js';
import { MOCK_CONTEXTS, MOCK_PROJECTS } from './mock-data.js';

const execAsync = promisify(exec);

export class KubeConfigService {
  public static isDemoMode = false;
  private static kubeconfigPath = process.env['KUBECONFIG'] || path.join(os.homedir(), '.kube', 'config');

  /**
   * Reads raw kubeconfig and parses all contexts, current context, and cluster endpoints.
   */
  static async getContexts(): Promise<{ contexts: KubeContext[]; currentContext: string | null }> {
    if (this.isDemoMode) {
      return { contexts: MOCK_CONTEXTS, currentContext: MOCK_CONTEXTS[0]?.name || null };
    }

    try {
      if (fs.existsSync(this.kubeconfigPath)) {
        const fileContent = fs.readFileSync(this.kubeconfigPath, 'utf8');
        const config = parseYaml(fileContent);

        if (config && Array.isArray(config.contexts)) {
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
      // Fall back to CLI command
    }

    try {
      const { stdout } = await execAsync('oc config view -o json || kubectl config view -o json', {
        env: getExecEnv(),
      });
      const config = JSON.parse(stdout);
      const current = config['current-context'] || null;
      const contexts: KubeContext[] = (config.contexts || []).map((ctx: any) => ({
        name: ctx.name,
        cluster: ctx.context?.cluster || '',
        user: ctx.context?.user || '',
        namespace: ctx.context?.namespace || 'default',
        isCurrent: ctx.name === current,
      }));

      return { contexts, currentContext: current };
    } catch (error) {
      return { contexts: [], currentContext: null };
    }
  }

  /**
   * Switches active context in kubeconfig.
   */
  static async switchContext(contextName: string): Promise<boolean> {
    if (this.isDemoMode) {
      MOCK_CONTEXTS.forEach((c) => {
        c.isCurrent = c.name === contextName;
      });
      return true;
    }

    try {
      await execAsync(`oc config use-context "${contextName}" || kubectl config use-context "${contextName}"`, {
        env: getExecEnv(),
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Retrieves all available projects / namespaces in the current cluster.
   */
  static async getProjects(): Promise<ProjectInfo[]> {
    if (this.isDemoMode) {
      return MOCK_PROJECTS;
    }

    try {
      const { stdout } = await execAsync('oc get projects -o json', { env: getExecEnv() });
      const data = JSON.parse(stdout);
      if (data && Array.isArray(data.items)) {
        const currentNs = await this.getCurrentNamespace();
        return data.items.map((item: any) => ({
          name: item.metadata.name,
          displayName: item.metadata.annotations?.['openshift.io/display-name'] || item.metadata.name,
          status: item.status?.phase || 'Active',
          isCurrent: item.metadata.name === currentNs,
        }));
      }
    } catch (e) {
      // Fallback to namespaces
    }

    try {
      const { stdout } = await execAsync('kubectl get namespaces -o json || oc get namespaces -o json', {
        env: getExecEnv(),
      });
      const data = JSON.parse(stdout);
      if (data && Array.isArray(data.items)) {
        const currentNs = await this.getCurrentNamespace();
        return data.items.map((item: any) => ({
          name: item.metadata.name,
          displayName: item.metadata.name,
          status: item.status?.phase || 'Active',
          isCurrent: item.metadata.name === currentNs,
        }));
      }
    } catch (e) {}

    // If cluster query failed (e.g. unauthorized), return current namespace from kubeconfig context
    const currentNs = await this.getCurrentNamespace();
    return [
      { name: currentNs, displayName: currentNs, status: 'Active', isCurrent: true },
      { name: 'default', displayName: 'default', status: 'Active', isCurrent: currentNs === 'default' },
    ];
  }

  /**
   * Gets current active namespace/project.
   */
  static async getCurrentNamespace(): Promise<string> {
    if (this.isDemoMode) {
      return 'devops';
    }

    try {
      const { stdout } = await execAsync('oc project -q', { env: getExecEnv() });
      if (stdout.trim()) return stdout.trim();
    } catch (e) {}

    try {
      const { contexts, currentContext } = await this.getContexts();
      const current = contexts.find((c) => c.name === currentContext);
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
    if (this.isDemoMode) {
      MOCK_PROJECTS.forEach((p) => {
        p.isCurrent = p.name === projectName;
      });
      return true;
    }

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
    if (this.isDemoMode) {
      return {
        server: 'https://api-devops-bt-wan:6443',
        user: 'alexandru.chiscari@btrl.ro',
        context: 'devops/api-devops-bt-wan:6443/alexandru.chiscari@btrl.ro',
        namespace: 'devops',
        connected: true,
      };
    }

    const { contexts, currentContext } = await this.getContexts();
    const active = contexts.find((c) => c.isCurrent);
    const ns = await this.getCurrentNamespace();

    return {
      server: active?.cluster || 'Unknown',
      user: active?.user || 'Unknown',
      context: currentContext || 'None',
      namespace: ns || 'default',
      connected: !!currentContext,
    };
  }
}
