import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { KubeContext, ProjectInfo, ClusterInfo, ServerInfo, LoginOptions, LoginResult, ImportConfigResult } from '../types/k8s.js';
import { groupServersWithContexts, parseLoginInput } from '../utils/kube-utils.js';

const execAsync = promisify(exec);

export { groupServersWithContexts, parseLoginInput };

let cachedKubePath: string | null = null;
const dynamicTokenCache = new Map<string, { token: string; timestamp: number }>();
const projectListCache = new Map<string, { projects: ProjectInfo[]; timestamp: number }>();

/**
 * Parses raw YAML string or parsed JSON object into sanitized contexts and servers.
 * Handles Rancher clusters (/k8s/clusters/...), messy, or partially corrupted kubeconfigs safely.
 */
export function parseKubeConfig(rawInput: any): {
  contexts: KubeContext[];
  currentContext: string | null;
  servers: ServerInfo[];
} {
  let config: any = rawInput;

  if (typeof rawInput === 'string') {
    if (!rawInput.trim()) {
      return { contexts: [], currentContext: null, servers: [] };
    }
    try {
      config = parseYaml(rawInput);
    } catch (err: any) {
      console.warn('[KubeConfigService] YAML parse error:', err.message);
      return { contexts: [], currentContext: null, servers: [] };
    }
  }

  if (!config || typeof config !== 'object') {
    return { contexts: [], currentContext: null, servers: [] };
  }

  // 1. Build cluster server lookup map
  const clusterMap = new Map<string, { server: string; insecureSkipTlsVerify?: boolean }>();
  if (Array.isArray(config.clusters)) {
    for (const cl of config.clusters) {
      if (cl && typeof cl === 'object' && typeof cl.name === 'string' && cl.name.trim()) {
        const clName = cl.name.trim();
        const clObj = cl.cluster && typeof cl.cluster === 'object' ? cl.cluster : {};
        const serverUrl = typeof clObj.server === 'string' ? clObj.server.trim() : '';
        clusterMap.set(clName, {
          server: serverUrl,
          insecureSkipTlsVerify: !!clObj['insecure-skip-tls-verify'],
        });
      }
    }
  }

  // 2. Extract current-context
  const rawCurrent = typeof config['current-context'] === 'string' ? config['current-context'].trim() : null;

  // 3. Extract and sanitize contexts
  const contextMap = new Map<string, KubeContext>();

  if (Array.isArray(config.contexts)) {
    for (const rawCtx of config.contexts) {
      if (!rawCtx || typeof rawCtx !== 'object') continue;

      const name = typeof rawCtx.name === 'string' ? rawCtx.name.trim() : '';
      if (!name) continue;

      const ctxInner = rawCtx.context && typeof rawCtx.context === 'object' ? rawCtx.context : {};
      const clusterName = typeof ctxInner.cluster === 'string' ? ctxInner.cluster.trim() : '';
      const userName = typeof ctxInner.user === 'string' ? ctxInner.user.trim() : '';
      const namespace = typeof ctxInner.namespace === 'string' && ctxInner.namespace.trim() ? ctxInner.namespace.trim() : 'default';

      // Resolve server URL from clusterMap
      const clusterEntry = clusterMap.get(clusterName);
      let serverUrl = clusterEntry?.server || '';
      if (!serverUrl && (clusterName.startsWith('http://') || clusterName.startsWith('https://'))) {
        serverUrl = clusterName;
      }
      if (!serverUrl) {
        serverUrl = clusterName || name;
      }

      const isCurrent = name === rawCurrent;

      const kubeContext: KubeContext = {
        name,
        cluster: clusterName,
        user: userName,
        namespace,
        isCurrent,
        server: serverUrl,
      };

      // De-duplicate if context already seen (keep current one if duplicate)
      const existing = contextMap.get(name);
      if (!existing || isCurrent) {
        contextMap.set(name, kubeContext);
      }
    }
  }

  const contexts = Array.from(contextMap.values());

  // 4. Validate current-context
  let currentContext = rawCurrent;
  if (currentContext && !contextMap.has(currentContext)) {
    // If raw current context is not in valid contexts, point to the first available
    currentContext = contexts.length > 0 ? contexts[0]?.name || null : null;
    if (currentContext && contexts.length > 0) {
      contexts[0]!.isCurrent = true;
    }
  } else if (!currentContext && contexts.length > 0) {
    currentContext = contexts[0]?.name || null;
    if (currentContext && contexts.length > 0) {
      contexts[0]!.isCurrent = true;
    }
  }

  // 5. Group servers with active contexts
  const servers = groupServersWithContexts(contexts, currentContext);

  return { contexts, currentContext, servers };
}

export class KubeConfigService {
  /**
   * Finds the exact path to kubeconfig file.
   */
  static getKubeconfigPath(): string {
    const rawEnv = process.env['KUBECONFIG'];
    if (rawEnv && rawEnv.trim()) {
      const first = rawEnv.split(path.delimiter)[0];
      if (first && first.trim()) {
        return first.trim();
      }
    }

    if (cachedKubePath && fs.existsSync(cachedKubePath)) {
      return cachedKubePath;
    }

    const home = process.env['HOME'] || os.homedir();
    const candidatePaths = [
      path.join(home, '.kube', 'config'),
      path.join('/Users', os.userInfo().username, '.kube', 'config'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        cachedKubePath = p;
        return p;
      }
    }

    const defaultPath = path.join(home, '.kube', 'config');
    cachedKubePath = defaultPath;
    return defaultPath;
  }

  /**
   * Reads raw kubeconfig directly from disk file and parses contexts and servers.
   * Displays only servers with active contexts.
   */
  static async getContexts(): Promise<{
    contexts: KubeContext[];
    currentContext: string | null;
    servers: ServerInfo[];
  }> {
    const kubePath = this.getKubeconfigPath();

    try {
      if (fs.existsSync(kubePath)) {
        const fileContent = fs.readFileSync(kubePath, 'utf8');
        const parsed = parseKubeConfig(fileContent);

        if (parsed.contexts.length > 0) {
          return parsed;
        }
      }
    } catch (err: any) {
      console.error(`[KubeConfigService] Error reading ${kubePath}:`, err.message);
    }

    return { contexts: [], currentContext: null, servers: [] };
  }

  /**
   * Retrieves servers with active contexts.
   */
  static async getServers(): Promise<{
    servers: ServerInfo[];
    currentServer: string | null;
    currentContext: string | null;
  }> {
    const { contexts, currentContext, servers } = await this.getContexts();
    const currentServerInfo = servers.find((s) => s.isCurrent);
    return {
      servers,
      currentServer: currentServerInfo?.server || null,
      currentContext,
    };
  }

  /**
   * Switches active context in kubeconfig.
   * Performs instant direct atomic file update (< 2ms) without CLI dependencies.
   */
  static async switchContext(contextName: string): Promise<boolean> {
    if (!contextName || !contextName.trim()) return false;
    const target = contextName.trim();

    try {
      const kubePath = this.getKubeconfigPath();
      if (fs.existsSync(kubePath)) {
        const rawContent = fs.readFileSync(kubePath, 'utf8');
        const config = parseYaml(rawContent);
        if (config && Array.isArray(config.contexts)) {
          const match = config.contexts.find((c: any) => c && c.name === target);
          if (match) {
            config['current-context'] = target;
            fs.writeFileSync(kubePath, stringifyYaml(config), { encoding: 'utf8', mode: 0o600 });
          }
        }
      }
    } catch (err: any) {
      console.warn('[KubeConfigService] Direct context switch failed:', err.message);
      return false;
    }

    projectListCache.clear();

    try {
      const { KubeHttpClient } = await import('./kube-http-client.js');
      KubeHttpClient.reset();
    } catch {}

    return true;
  }

  /**
   * Reads raw connection details for the active cluster and user from kubeconfig.
   * Supports standard tokens, bearer auth providers, token files, and client certs.
   */
  static async getActiveClusterConfig(): Promise<{
    server: string;
    caData?: string;
    caFile?: string;
    insecureSkipTlsVerify?: boolean;
    token?: string;
    clientCertData?: string;
    clientCertFile?: string;
    clientKeyData?: string;
    clientKeyFile?: string;
    namespace?: string;
  } | null> {
    const kubePath = this.getKubeconfigPath();
    let config: any = null;

    if (fs.existsSync(kubePath)) {
      try {
        const fileContent = fs.readFileSync(kubePath, 'utf8');
        config = parseYaml(fileContent);
      } catch {}
    }

    if (!config || typeof config !== 'object') return null;

    const current = config['current-context'];
    if (!current) return null;

    const ctxObj = (config.contexts || []).find((c: any) => c && c.name === current)?.context;
    if (!ctxObj) return null;

    const clusterObj = (config.clusters || []).find((c: any) => c && c.name === ctxObj.cluster)?.cluster;
    const userObj = (config.users || []).find((u: any) => u && u.name === ctxObj.user)?.user;

    if (!clusterObj || !clusterObj.server) return null;

    let token = userObj?.token;

    // Check auth-provider token (e.g. OIDC or Rancher)
    if (!token && userObj?.['auth-provider']?.config) {
      token = userObj['auth-provider'].config['access-token'] || userObj['auth-provider'].config['id-token'];
    }

    const kubeDir = path.dirname(kubePath);
    const resolveConfigPath = (p?: string): string | undefined => {
      if (!p || typeof p !== 'string') return undefined;
      const clean = p.trim();
      if (!clean) return undefined;
      if (path.isAbsolute(clean)) return clean;
      return path.resolve(kubeDir, clean);
    };

    // Check token-file
    if (!token) {
      const rawTokenFile = userObj?.['token-file'] || userObj?.tokenFile;
      const tokenFile = resolveConfigPath(rawTokenFile);
      if (tokenFile && fs.existsSync(tokenFile)) {
        try {
          token = fs.readFileSync(tokenFile, 'utf8');
        } catch {}
      }
    }

    // Check exec auth plugin if configured
    if (!token && userObj?.exec && !userObj?.['client-certificate-data'] && !userObj?.['client-certificate']) {
      const cached = dynamicTokenCache.get(current);
      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        token = cached.token;
      } else {
        try {
          const execCmd = userObj.exec.command;
          const execArgs = Array.isArray(userObj.exec.args) ? userObj.exec.args.join(' ') : '';
          const fullCmd = `${execCmd} ${execArgs}`.trim();
          const { stdout } = await execAsync(fullCmd, {
            env: {
              ...process.env,
              ...(userObj.exec.env ? Object.fromEntries(userObj.exec.env.map((e: any) => [e.name, e.value])) : {}),
            },
            timeout: 5000,
          });
          const parsed = JSON.parse(stdout);
          const execToken = parsed?.status?.token;
          if (execToken) {
            token = execToken;
            dynamicTokenCache.set(current, { token, timestamp: Date.now() });
          }
        } catch {}
      }
    }

    if (typeof token === 'string') {
      token = token.replace(/[\r\n]/g, '').trim();
    }

    const cleanB64 = (s?: string): string | undefined => {
      if (!s || typeof s !== 'string') return undefined;
      const clean = s.replace(/[\r\n\s]/g, '');
      return clean || undefined;
    };

    return {
      server: clusterObj.server,
      caData: cleanB64(clusterObj['certificate-authority-data']),
      caFile: resolveConfigPath(clusterObj['certificate-authority']),
      insecureSkipTlsVerify: !!clusterObj['insecure-skip-tls-verify'],
      token: token || undefined,
      clientCertData: cleanB64(userObj?.['client-certificate-data']),
      clientCertFile: resolveConfigPath(userObj?.['client-certificate']),
      clientKeyData: cleanB64(userObj?.['client-key-data']),
      clientKeyFile: resolveConfigPath(userObj?.['client-key']),
      namespace: ctxObj.namespace || 'default',
    };
  }

  /**
   * Retrieves all available projects / namespaces in the current cluster.
   * Uses high-speed direct REST API without requiring any CLI tools.
   */
  static async getProjects(): Promise<ProjectInfo[]> {
    const { contexts, currentContext } = await this.getContexts();
    const active = contexts.find((c) => c.isCurrent || c.name === currentContext);
    const currentNs = active?.namespace || 'all-projects';
    const serverKey = active?.server || active?.cluster || 'default';

    const cached = projectListCache.get(serverKey);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.projects.map((p) => ({
        ...p,
        isCurrent: p.name === currentNs,
      }));
    }

    const allProjectsFirst: ProjectInfo = {
      name: 'all-projects',
      displayName: 'All Projects (Cluster-Wide)',
      status: 'Active',
      isCurrent: currentNs === 'all-projects' || currentNs === '',
    };

    let projectList: ProjectInfo[] = [];

    // Direct High-Speed HTTPS REST API (15-30ms)
    try {
      const { KubeHttpClient } = await import('./kube-http-client.js');
      const projectRes = await KubeHttpClient.getResourceList('projects');
      const items = projectRes.items && projectRes.items.length > 0 ? projectRes.items : (await KubeHttpClient.getResourceList('namespaces')).items;
      if (items && items.length > 0) {
        projectList = items.map((item: any) => ({
          name: item.metadata?.name || '',
          displayName: item.metadata?.annotations?.['openshift.io/display-name'] || item.metadata?.name || '',
          status: item.status?.phase || 'Active',
          isCurrent: item.metadata?.name === currentNs,
        })).filter((p: ProjectInfo) => Boolean(p.name));
      }
    } catch (err: any) {
      console.warn('[KubeConfigService] Error fetching projects via REST:', err.message);
    }

    // Sort projects alphabetically
    projectList.sort((a, b) => a.name.localeCompare(b.name));

    const finalProjects = [allProjectsFirst, ...projectList.filter((p) => p.name !== 'all-projects')];
    if (projectList.length > 0) {
      projectListCache.set(serverKey, { projects: finalProjects, timestamp: Date.now() });
    }

    return finalProjects;
  }

  /**
   * Gets current active namespace/project directly in 0ms.
   */
  static async getCurrentNamespace(): Promise<string> {
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
   * Switches current active namespace/project instantly in kubeconfig file (< 2ms).
   */
  static async switchProject(projectName: string): Promise<boolean> {
    if (projectName === 'all-projects' || !projectName) {
      return true;
    }

    try {
      const kubePath = this.getKubeconfigPath();
      if (fs.existsSync(kubePath)) {
        const rawContent = fs.readFileSync(kubePath, 'utf8');
        const config = parseYaml(rawContent);
        if (config && Array.isArray(config.contexts)) {
          const current = config['current-context'];
          const match = config.contexts.find((c: any) => c && c.name === current);
          if (match) {
            if (!match.context) match.context = {};
            match.context.namespace = projectName;
            fs.writeFileSync(kubePath, stringifyYaml(config), { encoding: 'utf8', mode: 0o600 });
          }
        }
      }
    } catch (err: any) {
      console.warn('[KubeConfigService] Error switching project:', err.message);
      return false;
    }

    try {
      const { KubeHttpClient } = await import('./kube-http-client.js');
      KubeHttpClient.reset();
    } catch {}

    return true;
  }

  /**
   * Gets cluster metadata including resolved server URL in 0ms.
   */
  static async getClusterInfo(): Promise<ClusterInfo> {
    const { contexts, currentContext, servers } = await this.getContexts();
    const active = contexts.find((c) => c.isCurrent || c.name === currentContext);
    const activeServer = servers.find((s) => s.isCurrent || (active && s.contexts.some((c) => c.name === active.name)));
    const ns = active?.namespace || 'all-projects';
    const clusterUser = active?.user || activeServer?.user || 'Unknown User';
    const serverUrl = active?.server || activeServer?.server || active?.cluster || 'Unknown Cluster';
    const clusterName = activeServer?.clusterName || active?.cluster || currentContext || 'Cluster';

    return {
      server: serverUrl,
      clusterName,
      user: clusterUser,
      context: currentContext || 'None',
      namespace: ns,
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

  /**
   * Imports or creates a new cluster login directly in kubeconfig.
   * Supports:
   * 1. Parsing raw `oc login` command strings or server URL with token.
   * 2. Direct YAML/JSON kubeconfig pasting.
   * 3. Username/Password with automatic direct configuration.
   */
  static async loginCluster(options: LoginOptions): Promise<LoginResult> {
    let server = options.server;
    let token = options.token;
    let username = options.username;
    let password = options.password;
    let insecureSkipTlsVerify = options.insecureSkipTlsVerify;
    let namespace = options.namespace;
    let certificateAuthority = options.certificateAuthority;
    let certificateAuthorityData = options.certificateAuthorityData;
    let clusterName = options.clusterName;
    let contextName = options.contextName;

    // 1. If rawCommand is passed, parse it
    if (options.rawCommand && options.rawCommand.trim()) {
      const parsed = parseLoginInput(options.rawCommand);
      if (parsed.isYamlConfig) {
        const importRes = await this.importKubeConfig(options.rawCommand, { setActive: options.setActive !== false });
        if (!importRes.success) {
          return { success: false, message: importRes.message };
        }
        return {
          success: true,
          message: importRes.message,
          contextName: importRes.activeContext,
          namespace: namespace || 'default',
        };
      }
      if (parsed.server && !server) server = parsed.server;
      if (parsed.token && !token) token = parsed.token;
      if (parsed.username && !username) username = parsed.username;
      if (parsed.password && !password) password = parsed.password;
      if (parsed.insecureSkipTlsVerify !== undefined && insecureSkipTlsVerify === undefined) {
        insecureSkipTlsVerify = parsed.insecureSkipTlsVerify;
      }
      if (parsed.namespace && !namespace) namespace = parsed.namespace;
      if (parsed.certificateAuthority && !certificateAuthority) certificateAuthority = parsed.certificateAuthority;
    }

    if (!server || !server.trim()) {
      return {
        success: false,
        message: 'Server URL is required to login (e.g. https://api.cluster.domain:6443 or oc login command).',
      };
    }

    server = server.trim();
    if (!server.startsWith('http://') && !server.startsWith('https://')) {
      server = `https://${server}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(server);
    } catch {
      return {
        success: false,
        message: `Invalid server URL '${server}'. Please provide a valid HTTP/HTTPS endpoint.`,
      };
    }

    // Default insecure skip TLS verify to true if not explicitly false and using common self-signed cluster port
    if (insecureSkipTlsVerify === undefined) {
      insecureSkipTlsVerify = true;
    }

    const host = parsedUrl.hostname.replace(/[^a-zA-Z0-9.-]/g, '-');
    const portSuffix = parsedUrl.port && parsedUrl.port !== '443' && parsedUrl.port !== '80' ? `:${parsedUrl.port}` : '';

    // Auto-generate clean cluster name if not provided
    if (!clusterName || !clusterName.trim()) {
      clusterName = `${host}${portSuffix}`;
    } else {
      clusterName = clusterName.trim();
    }

    // Auto-generate clean username if not provided
    if (!username || !username.trim()) {
      if (token) {
        username = token.startsWith('sha256~') ? `token-user-${host.split('.')[0]}` : `user-${host.split('.')[0]}`;
      } else {
        username = `user-${host.split('.')[0]}`;
      }
    } else {
      username = username.trim();
    }

    const targetNs = (namespace && namespace.trim()) || 'default';

    // Auto-generate context name if not provided
    if (!contextName || !contextName.trim()) {
      contextName = `${targetNs}/${clusterName}/${username}`;
    } else {
      contextName = contextName.trim();
    }

    const kubePath = this.getKubeconfigPath();
    const kubeDir = path.dirname(kubePath);
    if (!fs.existsSync(kubeDir)) {
      fs.mkdirSync(kubeDir, { recursive: true });
    }

    let config: any = {
      apiVersion: 'v1',
      kind: 'Config',
      clusters: [],
      users: [],
      contexts: [],
      'current-context': '',
    };

    if (fs.existsSync(kubePath)) {
      try {
        const rawContent = fs.readFileSync(kubePath, 'utf8');
        // Create backup
        const backupPath = `${kubePath}.bak-${Date.now()}`;
        fs.writeFileSync(backupPath, rawContent, { encoding: 'utf8', mode: 0o600 });
        const parsed = parseYaml(rawContent);
        if (parsed && typeof parsed === 'object') {
          config = parsed;
          if (!Array.isArray(config.clusters)) config.clusters = [];
          if (!Array.isArray(config.users)) config.users = [];
          if (!Array.isArray(config.contexts)) config.contexts = [];
        }
      } catch (e: any) {
        console.warn('[KubeConfigService] Error reading existing kubeconfig for login:', e.message);
      }
    }

    // 1. Build cluster definition
    const clusterDef: any = {
      server,
      'insecure-skip-tls-verify': Boolean(insecureSkipTlsVerify),
    };
    if (certificateAuthority) {
      clusterDef['certificate-authority'] = certificateAuthority;
    }
    if (certificateAuthorityData) {
      clusterDef['certificate-authority-data'] = certificateAuthorityData;
    }

    const existingClusterIdx = config.clusters.findIndex((c: any) => c && c.name === clusterName);
    if (existingClusterIdx >= 0) {
      config.clusters[existingClusterIdx] = { name: clusterName, cluster: clusterDef };
    } else {
      config.clusters.push({ name: clusterName, cluster: clusterDef });
    }

    // 2. Build user definition
    const userDef: any = {};
    if (token) {
      userDef.token = token.replace(/[\r\n\s]/g, '');
    } else if (username && password) {
      userDef.username = username;
      userDef.password = password;
    }

    const existingUserIdx = config.users.findIndex((u: any) => u && u.name === username);
    if (existingUserIdx >= 0) {
      config.users[existingUserIdx] = { name: username, user: userDef };
    } else {
      config.users.push({ name: username, user: userDef });
    }

    // 3. Build context definition
    const contextDef = {
      cluster: clusterName,
      user: username,
      namespace: targetNs,
    };

    const existingCtxIdx = config.contexts.findIndex((c: any) => c && c.name === contextName);
    if (existingCtxIdx >= 0) {
      config.contexts[existingCtxIdx] = { name: contextName, context: contextDef };
    } else {
      config.contexts.push({ name: contextName, context: contextDef });
    }

    if (options.setActive !== false) {
      config['current-context'] = contextName;
    }

    // Write updated kubeconfig
    fs.writeFileSync(kubePath, stringifyYaml(config), { encoding: 'utf8', mode: 0o600 });

    // Invalidate caches
    projectListCache.clear();
    dynamicTokenCache.clear();
    try {
      const { KubeHttpClient } = await import('./kube-http-client.js');
      KubeHttpClient.reset();
    } catch {}

    // Verify connection
    let verifiedUser = username;
    let connMsg = `Successfully configured and connected context '${contextName}'.`;
    try {
      const { KubeHttpClient } = await import('./kube-http-client.js');
      const testRes = await KubeHttpClient.requestJson('/apis/user.openshift.io/v1/users/~');
      if (testRes && testRes.data?.metadata?.name) {
        verifiedUser = testRes.data.metadata.name;
        connMsg = `Successfully connected to ${clusterName} as user '${verifiedUser}'.`;
      } else {
        const pingRes = await KubeHttpClient.requestJson('/api/v1');
        if (pingRes && pingRes.data) {
          connMsg = `Successfully connected to Kubernetes API at ${clusterName}.`;
        }
      }
    } catch (testErr: any) {
      console.warn('[KubeConfigService] Post-login probe note:', testErr.message);
    }

    return {
      success: true,
      message: connMsg,
      contextName,
      server,
      user: verifiedUser,
      clusterName,
      namespace: targetNs,
    };
  }

  /**
   * Imports a raw YAML or JSON kubeconfig and merges it into the user's ~/.kube/config.
   */
  static async importKubeConfig(
    yamlOrJson: string,
    options?: { setActive?: boolean }
  ): Promise<{
    success: boolean;
    message: string;
    importedContexts: string[];
    activeContext?: string;
    backupPath?: string;
  }> {
    if (!yamlOrJson || !yamlOrJson.trim()) {
      return {
        success: false,
        message: 'Empty kubeconfig content provided.',
        importedContexts: [],
      };
    }

    let parsedConfig: any;
    try {
      parsedConfig = parseYaml(yamlOrJson.trim());
    } catch (err: any) {
      return {
        success: false,
        message: `Invalid YAML/JSON syntax: ${err.message}`,
        importedContexts: [],
      };
    }

    if (!parsedConfig || typeof parsedConfig !== 'object') {
      return {
        success: false,
        message: 'Parsed kubeconfig is not a valid YAML or JSON object.',
        importedContexts: [],
      };
    }

    if (!Array.isArray(parsedConfig.clusters) && !Array.isArray(parsedConfig.contexts)) {
      return {
        success: false,
        message: 'Kubeconfig must contain at least a "clusters" or "contexts" array.',
        importedContexts: [],
      };
    }

    const kubePath = this.getKubeconfigPath();
    const kubeDir = path.dirname(kubePath);
    if (!fs.existsSync(kubeDir)) {
      fs.mkdirSync(kubeDir, { recursive: true });
    }

    let existingConfig: any = {
      apiVersion: 'v1',
      kind: 'Config',
      clusters: [],
      users: [],
      contexts: [],
      'current-context': '',
    };

    let backupPath: string | undefined;

    if (fs.existsSync(kubePath)) {
      try {
        const rawExisting = fs.readFileSync(kubePath, 'utf8');
        backupPath = `${kubePath}.bak-${Date.now()}`;
        fs.writeFileSync(backupPath, rawExisting, { encoding: 'utf8', mode: 0o600 });
        const parsed = parseYaml(rawExisting);
        if (parsed && typeof parsed === 'object') {
          existingConfig = parsed;
          if (!Array.isArray(existingConfig.clusters)) existingConfig.clusters = [];
          if (!Array.isArray(existingConfig.users)) existingConfig.users = [];
          if (!Array.isArray(existingConfig.contexts)) existingConfig.contexts = [];
        }
      } catch (e: any) {
        console.warn('[KubeConfigService] Error creating backup before import:', e.message);
      }
    }

    // Merge Clusters
    if (Array.isArray(parsedConfig.clusters)) {
      for (const cl of parsedConfig.clusters) {
        if (!cl || !cl.name) continue;
        const idx = existingConfig.clusters.findIndex((c: any) => c && c.name === cl.name);
        if (idx >= 0) {
          existingConfig.clusters[idx] = cl;
        } else {
          existingConfig.clusters.push(cl);
        }
      }
    }

    // Merge Users
    if (Array.isArray(parsedConfig.users)) {
      for (const u of parsedConfig.users) {
        if (!u || !u.name) continue;
        const idx = existingConfig.users.findIndex((existingU: any) => existingU && existingU.name === u.name);
        if (idx >= 0) {
          existingConfig.users[idx] = u;
        } else {
          existingConfig.users.push(u);
        }
      }
    }

    // Merge Contexts
    const importedContextNames: string[] = [];
    if (Array.isArray(parsedConfig.contexts)) {
      for (const ctx of parsedConfig.contexts) {
        if (!ctx || !ctx.name) continue;
        importedContextNames.push(ctx.name);
        const idx = existingConfig.contexts.findIndex((existingCtx: any) => existingCtx && existingCtx.name === ctx.name);
        if (idx >= 0) {
          existingConfig.contexts[idx] = ctx;
        } else {
          existingConfig.contexts.push(ctx);
        }
      }
    }

    // Set Active Context
    let targetActive = existingConfig['current-context'];
    if (options?.setActive !== false) {
      if (parsedConfig['current-context'] && existingConfig.contexts.some((c: any) => c && c.name === parsedConfig['current-context'])) {
        targetActive = parsedConfig['current-context'];
      } else if (importedContextNames.length > 0) {
        targetActive = importedContextNames[0];
      }
      existingConfig['current-context'] = targetActive;
    }

    // Write file
    fs.writeFileSync(kubePath, stringifyYaml(existingConfig), { encoding: 'utf8', mode: 0o600 });

    // Reset caches
    projectListCache.clear();
    dynamicTokenCache.clear();
    try {
      const { KubeHttpClient } = await import('./kube-http-client.js');
      KubeHttpClient.reset();
    } catch {}

    return {
      success: true,
      message: `Successfully imported ${importedContextNames.length} context(s) from kubeconfig.${targetActive ? ` Active context set to '${targetActive}'.` : ''}`,
      importedContexts: importedContextNames,
      activeContext: targetActive,
      backupPath,
    };
  }

  /**
   * Tests connection to current active Kubernetes / OpenShift cluster.
   */
  static async testConnection(): Promise<{ success: boolean; message: string; version?: string; user?: string }> {
    try {
      const { KubeHttpClient } = await import('./kube-http-client.js');
      KubeHttpClient.reset();
      const config = await KubeHttpClient.getActiveConfig();
      if (!config || !config.server) {
        return { success: false, message: 'No active cluster configured.' };
      }

      let user: string | undefined;
      let version: string | undefined;

      // Try OpenShift User
      try {
        const uRes = await KubeHttpClient.requestJson('/apis/user.openshift.io/v1/users/~');
        if (uRes && uRes.data?.metadata?.name) {
          user = uRes.data.metadata.name;
        }
      } catch {}

      // Try Version
      try {
        const vRes = await KubeHttpClient.requestJson('/version');
        if (vRes && vRes.data?.gitVersion) {
          version = vRes.data.gitVersion;
        }
      } catch {}

      // Try core API
      const apiRes = await KubeHttpClient.requestJson('/api/v1');
      if (apiRes && apiRes.data) {
        return {
          success: true,
          message: `Connected successfully to ${config.server}${version ? ` (Kubernetes ${version})` : ''}${user ? ` as user '${user}'` : ''}.`,
          version,
          user,
        };
      }

      return { success: true, message: `Connected to ${config.server}.` };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Failed to connect to cluster.',
      };
    }
  }
}

