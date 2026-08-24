import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml } from 'yaml';
import { KubeContext, ProjectInfo, ClusterInfo } from '../types/k8s.js';

const execAsync = promisify(exec);

export class KubeConfigService {
  private static kubeconfigPath = process.env['KUBECONFIG'] || path.join(os.homedir(), '.kube', 'config');

  /**
   * Reads raw kubeconfig and parses all contexts, current context, and cluster endpoints.
   */
  static async getContexts(): Promise<{ contexts: KubeContext[]; currentContext: string | null }> {
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
      const { stdout } = await execAsync('oc config view -o json || kubectl config view -o json');
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
    try {
      await execAsync(`oc config use-context "${contextName}" || kubectl config use-context "${contextName}"`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Retrieves all available projects / namespaces in the current cluster.
   */
  static async getProjects(): Promise<ProjectInfo[]> {
    try {
      // Try OpenShift projects first
      const { stdout } = await execAsync('oc get projects -o json');
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
      const { stdout } = await execAsync('kubectl get namespaces -o json || oc get namespaces -o json');
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
    } catch (e) {
      // Return empty if offline or not logged in
    }

    return [];
  }

  /**
   * Gets current active namespace/project.
   */
  static async getCurrentNamespace(): Promise<string> {
    try {
      const { stdout } = await execAsync('oc project -q');
      if (stdout.trim()) return stdout.trim();
    } catch (e) {
      // oc project might fail on standard k8s
    }

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
    try {
      await execAsync(`oc project "${projectName}"`);
      return true;
    } catch (e) {
      try {
        await execAsync(`kubectl config set-context --current --namespace="${projectName}"`);
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
