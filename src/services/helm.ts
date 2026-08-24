import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ResourceItem, HelmReleaseItem } from '../types/k8s.js';
import { formatAge, getStatusColor } from '../utils/formatters.js';
import { getExecEnv } from './oc-client.js';
import { MOCK_HELM } from './mock-data.js';

const execAsync = promisify(exec);

export class HelmService {
  public static isDemoMode = false;

  /**
   * Run a helm command safely.
   */
  static async runHelm(command: string, timeout = 10000): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execAsync(command, { timeout, env: getExecEnv() });
      return result;
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || 'Helm command failed',
      };
    }
  }

  /**
   * Fetches all Helm releases in the given namespace.
   */
  static async getReleases(namespace: string): Promise<{ items: ResourceItem[]; error?: string }> {
    if (this.isDemoMode) {
      return { items: MOCK_HELM };
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '-A';
    const cmd = `helm list ${nsFlag} -o json`;
    const { stdout, stderr } = await this.runHelm(cmd);

    if (!stdout.trim()) {
      if (stderr.trim()) {
        return { items: [], error: stderr.trim() };
      }
      return { items: [] };
    }

    try {
      const releases: HelmReleaseItem[] = JSON.parse(stdout);
      if (!Array.isArray(releases)) return { items: [] };

      const items = releases.map((rel: any) => {
        const name = rel.name || 'unknown';
        const ns = rel.namespace || namespace || 'default';
        const status = rel.status || 'unknown';
        const updated = rel.updated ? formatAge(rel.updated) : '-';

        return {
          id: `${ns}/${name}`,
          name,
          namespace: ns,
          kind: 'helm' as const,
          status,
          statusColor: getStatusColor(status),
          age: updated,
          extra: {
            revision: rel.revision || '1',
            chart: rel.chart || '-',
            appVersion: rel.app_version || '-',
            updated: rel.updated || '',
          },
          raw: rel,
        };
      });

      return { items };
    } catch (err: any) {
      return { items: [], error: `Failed to parse helm output: ${err.message}` };
    }
  }

  /**
   * Gets values for a Helm release.
   */
  static async getValues(releaseName: string, namespace: string): Promise<string> {
    if (this.isDemoMode) {
      return `# Helm values for ${releaseName}\nreplicaCount: 3\nimage:\n  repository: bitnami/redis\n  tag: 7.2.5\n  pullPolicy: IfNotPresent\nresources:\n  limits:\n    cpu: 500m\n    memory: 512Mi\n  requests:\n    cpu: 100m\n    memory: 128Mi\nmetrics:\n  enabled: true`;
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `helm get values "${releaseName}" ${nsFlag} -a`;
    const { stdout, stderr } = await this.runHelm(cmd);
    return stdout || stderr || 'No user-supplied values found.';
  }

  /**
   * Gets manifest for a Helm release.
   */
  static async getManifest(releaseName: string, namespace: string): Promise<string> {
    if (this.isDemoMode) {
      return `---\n# Source: ${releaseName}/templates/deployment.yaml\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${releaseName}\n  namespace: ${namespace}\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app.kubernetes.io/name: ${releaseName}\n  template:\n    metadata:\n      labels:\n        app.kubernetes.io/name: ${releaseName}\n    spec:\n      containers:\n      - name: ${releaseName}\n        image: bitnami/${releaseName}:latest`;
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `helm get manifest "${releaseName}" ${nsFlag}`;
    const { stdout, stderr } = await this.runHelm(cmd);
    return stdout || stderr || 'No manifest available.';
  }

  /**
   * Gets history of a Helm release.
   */
  static async getHistory(releaseName: string, namespace: string): Promise<any[]> {
    if (this.isDemoMode) {
      return [
        { revision: 2, updated: '2026-08-20 14:00:00', status: 'deployed', chart: `${releaseName}-1.2.0`, app_version: '1.2.0', description: 'Upgrade complete' },
        { revision: 1, updated: '2026-08-10 10:00:00', status: 'superseded', chart: `${releaseName}-1.1.0`, app_version: '1.1.0', description: 'Initial install' },
      ];
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `helm history "${releaseName}" ${nsFlag} -o json`;
    const { stdout } = await this.runHelm(cmd);
    try {
      return JSON.parse(stdout) || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Rolls back a Helm release.
   */
  static async rollback(releaseName: string, revision: string | number, namespace: string): Promise<{ success: boolean; message: string }> {
    if (this.isDemoMode) {
      return { success: true, message: `[Demo] Rolled back ${releaseName} to revision ${revision}.` };
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `helm rollback "${releaseName}" ${revision} ${nsFlag}`;
    const { stdout, stderr } = await this.runHelm(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Rolled back ${releaseName} to revision ${revision}.` };
  }

  /**
   * Uninstalls a Helm release.
   */
  static async uninstall(releaseName: string, namespace: string): Promise<{ success: boolean; message: string }> {
    if (this.isDemoMode) {
      return { success: true, message: `[Demo] Uninstalled release ${releaseName}.` };
    }

    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `helm uninstall "${releaseName}" ${nsFlag}`;
    const { stdout, stderr } = await this.runHelm(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Uninstalled release ${releaseName}.` };
  }
}
