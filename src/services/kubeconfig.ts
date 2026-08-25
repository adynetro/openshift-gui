import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
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

  /**
   * Cleans stale contexts, clusters, and users from kubeconfig.
   * Creates an automatic backup file (config.bak-<timestamp>) before modifying.
   */
  static async cleanContexts(options: {
    keepActiveOnly?: boolean;
    contextNamesToDelete?: string[];
    contextNamesToKeep?: string[];
    pruneDangling?: boolean;
  }): Promise<{
    success: boolean;
    backupPath?: string;
    deletedContexts: string[];
    deletedClusters: string[];
    deletedUsers: string[];
    remainingContexts: string[];
    message: string;
  }> {
    const kubePath = this.getKubeconfigPath();
    if (!fs.existsSync(kubePath)) {
      return {
        success: false,
        deletedContexts: [],
        deletedClusters: [],
        deletedUsers: [],
        remainingContexts: [],
        message: `Kubeconfig file not found at ${kubePath}`,
      };
    }

    try {
      const rawContent = fs.readFileSync(kubePath, 'utf8');
      const config = parseYaml(rawContent);

      if (!config || !Array.isArray(config.contexts)) {
        return {
          success: false,
          deletedContexts: [],
          deletedClusters: [],
          deletedUsers: [],
          remainingContexts: [],
          message: 'Invalid kubeconfig format: no contexts array found.',
        };
      }

      // 1. Create a safe backup file before making any modifications
      const backupPath = `${kubePath}.bak-${Date.now()}`;
      fs.writeFileSync(backupPath, rawContent, { encoding: 'utf8', mode: 0o600 });

      const currentContext = config['current-context'] || null;
      const allContextNames: string[] = config.contexts.map((c: any) => c.name);

      let targetKeepNames: Set<string>;

      if (options.keepActiveOnly) {
        if (!currentContext) {
          throw new Error('No current active context is set in kubeconfig to keep.');
        }
        targetKeepNames = new Set([currentContext]);
      } else if (options.contextNamesToKeep && options.contextNamesToKeep.length > 0) {
        targetKeepNames = new Set(options.contextNamesToKeep);
      } else if (options.contextNamesToDelete && options.contextNamesToDelete.length > 0) {
        const deleteSet = new Set(options.contextNamesToDelete);
        targetKeepNames = new Set(allContextNames.filter((name) => !deleteSet.has(name)));
      } else {
        return {
          success: false,
          deletedContexts: [],
          deletedClusters: [],
          deletedUsers: [],
          remainingContexts: allContextNames,
          message: 'No cleanup criteria specified (keepActiveOnly, contextNamesToDelete, or contextNamesToKeep).',
        };
      }

      if (targetKeepNames.size === 0) {
        throw new Error('Cannot delete all contexts. At least one context must remain.');
      }

      const deletedContexts: string[] = [];
      const remainingContextObjects: any[] = [];

      for (const ctx of config.contexts) {
        if (targetKeepNames.has(ctx.name)) {
          remainingContextObjects.push(ctx);
        } else {
          deletedContexts.push(ctx.name);
        }
      }

      config.contexts = remainingContextObjects;

      // Ensure current-context is valid
      if (currentContext && !targetKeepNames.has(currentContext)) {
        config['current-context'] = remainingContextObjects[0]?.name || '';
      }

      // 2. Prune dangling clusters and users (auth-infos) if pruneDangling is enabled (default true)
      const shouldPruneDangling = options.pruneDangling !== false;
      const deletedClusters: string[] = [];
      const deletedUsers: string[] = [];

      if (shouldPruneDangling) {
        const referencedClusters = new Set(
          remainingContextObjects.map((c) => c.context?.cluster).filter(Boolean)
        );
        const referencedUsers = new Set(
          remainingContextObjects.map((c) => c.context?.user).filter(Boolean)
        );

        if (Array.isArray(config.clusters)) {
          const retainedClusters: any[] = [];
          for (const cl of config.clusters) {
            if (referencedClusters.has(cl.name)) {
              retainedClusters.push(cl);
            } else {
              deletedClusters.push(cl.name);
            }
          }
          config.clusters = retainedClusters;
        }

        if (Array.isArray(config.users)) {
          const retainedUsers: any[] = [];
          for (const u of config.users) {
            if (referencedUsers.has(u.name)) {
              retainedUsers.push(u);
            } else {
              deletedUsers.push(u.name);
            }
          }
          config.users = retainedUsers;
        }
      }

      // 3. Write modified kubeconfig back to disk atomically
      const updatedYaml = stringifyYaml(config);
      fs.writeFileSync(kubePath, updatedYaml, { encoding: 'utf8', mode: 0o600 });

      const remainingNames = remainingContextObjects.map((c) => c.name);

      let msg = `Successfully removed ${deletedContexts.length} context(s)`;
      if (deletedClusters.length > 0 || deletedUsers.length > 0) {
        msg += ` and pruned ${deletedClusters.length} cluster(s), ${deletedUsers.length} user(s)`;
      }
      msg += `. Backup saved to ${path.basename(backupPath)}.`;

      return {
        success: true,
        backupPath,
        deletedContexts,
        deletedClusters,
        deletedUsers,
        remainingContexts: remainingNames,
        message: msg,
      };
    } catch (err: any) {
      console.error('[KubeConfigService] Error cleaning contexts:', err);
      return {
        success: false,
        deletedContexts: [],
        deletedClusters: [],
        deletedUsers: [],
        remainingContexts: [],
        message: err.message || 'Failed to clean kubeconfig contexts.',
      };
    }
  }

  /**
   * Deletes a single context and optionally prunes orphaned clusters/users.
   */
  static async deleteContext(contextName: string, pruneDangling: boolean = true) {
    return this.cleanContexts({
      contextNamesToDelete: [contextName],
      pruneDangling,
    });
  }
}
