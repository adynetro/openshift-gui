import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ResourceItem, HelmReleaseItem } from '../types/k8s.js';
import { formatAge, getStatusColor } from '../utils/formatters.js';

const execAsync = promisify(exec);

export class HelmService {
  /**
   * Run a helm command safely.
   */
  static async runHelm(command: string, timeout = 10000): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execAsync(command, { timeout });
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
  static async getReleases(namespace: string): Promise<ResourceItem[]> {
    const nsFlag = namespace ? `-n "${namespace}"` : '-A';
    const cmd = `helm list ${nsFlag} -o json`;
    const { stdout } = await this.runHelm(cmd);

    if (!stdout.trim()) {
      return [];
    }

    try {
      const releases: HelmReleaseItem[] = JSON.parse(stdout);
      if (!Array.isArray(releases)) return [];

      return releases.map((rel: any) => {
        const name = rel.name || 'unknown';
        const ns = rel.namespace || namespace || 'default';
        const status = rel.status || 'unknown';
        const updated = rel.updated ? formatAge(rel.updated) : '-';

        return {
          id: `${ns}/${name}`,
          name,
          namespace: ns,
          kind: 'helm',
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
    } catch (err) {
      return [];
    }
  }

  /**
   * Gets values for a Helm release.
   */
  static async getValues(releaseName: string, namespace: string): Promise<string> {
    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `helm get values "${releaseName}" ${nsFlag} -a`;
    const { stdout, stderr } = await this.runHelm(cmd);
    return stdout || stderr || 'No user-supplied values found.';
  }

  /**
   * Gets manifest for a Helm release.
   */
  static async getManifest(releaseName: string, namespace: string): Promise<string> {
    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `helm get manifest "${releaseName}" ${nsFlag}`;
    const { stdout, stderr } = await this.runHelm(cmd);
    return stdout || stderr || 'No manifest available.';
  }

  /**
   * Gets history of a Helm release.
   */
  static async getHistory(releaseName: string, namespace: string): Promise<any[]> {
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
    const nsFlag = namespace ? `-n "${namespace}"` : '';
    const cmd = `helm uninstall "${releaseName}" ${nsFlag}`;
    const { stdout, stderr } = await this.runHelm(cmd);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout.trim() || `Uninstalled release ${releaseName}.` };
  }
}
