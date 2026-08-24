import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ResourceItem, HelmReleaseItem } from '../types/k8s.js';
import { formatAge, getStatusColor } from '../utils/formatters.js';
import { getExecEnv } from './oc-client.js';

const execAsync = promisify(exec);

export class HelmService {
  /**
   * Run a helm command safely.
   */
  static async runHelm(command: string, timeout = 15000): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execAsync(command, { timeout, env: getExecEnv(), maxBuffer: 20 * 1024 * 1024 });
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
   * Gets values for a Helm release without headers like COMPUTED VALUES.
   */
  static async getValues(releaseName: string, namespace: string): Promise<string> {
    const nsFlag = namespace ? `-n "${namespace}"` : '';

    // First try user-supplied values
    let cmd = `helm get values "${releaseName}" ${nsFlag}`;
    let { stdout, stderr } = await this.runHelm(cmd);

    // If user-supplied is empty, fallback to all computed values
    if (!stdout.trim() || stdout.trim() === 'null' || stdout.trim() === '{}') {
      const allCmd = `helm get values "${releaseName}" ${nsFlag} -a`;
      const res = await this.runHelm(allCmd);
      if (res.stdout.trim()) {
        stdout = res.stdout;
      }
    }

    let cleaned = (stdout || stderr || '').trim();

    // Strip COMPUTED VALUES / USER-SUPPLIED VALUES header banners
    cleaned = cleaned
      .replace(/^#?\s*COMPUTED VALUES:\s*\n?/im, '')
      .replace(/^#?\s*USER-SUPPLIED VALUES:\s*\n?/im, '')
      .replace(/^---\s*\n?/m, '')
      .trim();

    if (cleaned === 'null' || !cleaned) {
      return '# No custom values set for this release';
    }

    return cleaned;
  }

  /**
   * Updates / upgrades a Helm release with new YAML values.
   */
  static async upgradeValues(
    releaseName: string,
    valuesYaml: string,
    namespace: string
  ): Promise<{ success: boolean; message: string }> {
    const tmpFile = path.join(os.tmpdir(), `helm-vals-${Date.now()}.yaml`);
    try {
      // Strip any accidental headers if present
      const cleanYaml = valuesYaml
        .replace(/^#?\s*COMPUTED VALUES:\s*\n?/im, '')
        .replace(/^#?\s*USER-SUPPLIED VALUES:\s*\n?/im, '')
        .trim();

      fs.writeFileSync(tmpFile, cleanYaml, 'utf8');

      // Look up release chart name
      const { items } = await this.getReleases(namespace);
      const rel = items.find((r) => r.name === releaseName);
      const chart = rel?.extra?.chart || releaseName;

      const nsFlag = namespace ? `-n "${namespace}"` : '';
      const cmd = `helm upgrade "${releaseName}" "${chart}" -f "${tmpFile}" --reuse-values ${nsFlag}`;
      const { stdout, stderr } = await this.runHelm(cmd, 30000);

      if (stderr && !stdout) {
        // Retry without --reuse-values in case chart needs fresh values
        const fallbackCmd = `helm upgrade "${releaseName}" "${chart}" -f "${tmpFile}" ${nsFlag}`;
        const res = await this.runHelm(fallbackCmd, 30000);
        if (res.stderr && !res.stdout) {
          return { success: false, message: res.stderr };
        }
        return { success: true, message: res.stdout || `Helm release ${releaseName} upgraded successfully!` };
      }

      return { success: true, message: stdout || `Helm release ${releaseName} upgraded successfully!` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Helm upgrade failed' };
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
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
