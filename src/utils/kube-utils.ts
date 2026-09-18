import { KubeContext, ServerInfo } from '../types/k8s.js';

/**
 * Groups a list of contexts by their cluster server URL.
 * Only returns servers that have active/valid contexts.
 */
export function groupServersWithContexts(
  contexts: KubeContext[],
  currentContext: string | null
): ServerInfo[] {
  if (!Array.isArray(contexts) || contexts.length === 0) {
    return [];
  }

  const serverMap = new Map<string, ServerInfo>();

  for (const ctx of contexts) {
    if (!ctx || typeof ctx !== 'object' || !ctx.name) continue;

    // Server key is the server URL if available, otherwise the cluster name
    const serverKey = (ctx.server && ctx.server.trim()) || (ctx.cluster && ctx.cluster.trim()) || ctx.name;
    const existing = serverMap.get(serverKey);
    const isThisContextCurrent = ctx.isCurrent || ctx.name === currentContext;

    if (!existing) {
      serverMap.set(serverKey, {
        server: ctx.server || ctx.cluster || 'Unknown Server',
        clusterName: ctx.cluster || ctx.name,
        activeContextName: ctx.name,
        user: ctx.user || 'Unknown User',
        namespace: ctx.namespace || 'default',
        contextCount: 1,
        contexts: [ctx],
        isCurrent: isThisContextCurrent,
      });
    } else {
      existing.contextCount++;
      // Avoid duplicate contexts in the list
      if (!existing.contexts.some((c) => c.name === ctx.name)) {
        existing.contexts.push(ctx);
      }
      // If this context is the current active context, promote it to active for this server
      if (isThisContextCurrent) {
        existing.isCurrent = true;
        existing.activeContextName = ctx.name;
        if (ctx.user) existing.user = ctx.user;
        if (ctx.namespace) existing.namespace = ctx.namespace;
      }
    }
  }

  // Sort servers: Active current server first, then alphabetically
  const servers = Array.from(serverMap.values());
  servers.sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return a.server.localeCompare(b.server);
  });

  return servers;
}

/**
 * Parses raw oc/kubectl login commands, server URLs, or flags.
 * Handles patterns such as:
 *   oc login https://api.cluster.example.com:6443 --token=sha256~xxx
 *   oc login --server=https://api.cluster.example.com:6443 --token sha256~xxx -n my-project
 *   oc login https://api.cluster.example.com:6443 -u admin -p mypass --insecure-skip-tls-verify=true
 *   https://api.cluster.example.com:6443
 */
export function parseLoginInput(input: string): {
  server?: string;
  token?: string;
  username?: string;
  password?: string;
  insecureSkipTlsVerify?: boolean;
  namespace?: string;
  clusterName?: string;
  contextName?: string;
  certificateAuthority?: string;
  isYamlConfig?: boolean;
} {
  if (!input || typeof input !== 'string') return {};
  const trimmed = input.trim();
  if (!trimmed) return {};

  // If it starts with YAML or JSON kubeconfig markers
  if (
    trimmed.startsWith('apiVersion:') ||
    trimmed.startsWith('clusters:') ||
    trimmed.startsWith('kind: Config') ||
    trimmed.startsWith('contexts:') ||
    (trimmed.startsWith('{') && trimmed.includes('"apiVersion"'))
  ) {
    return { isYamlConfig: true };
  }

  const result: {
    server?: string;
    token?: string;
    username?: string;
    password?: string;
    insecureSkipTlsVerify?: boolean;
    namespace?: string;
    clusterName?: string;
    contextName?: string;
    certificateAuthority?: string;
  } = {};

  // Token: --token=... or --token ... or -t ... or standalone sha256~...
  const tokenMatch =
    trimmed.match(/(?:--token[=\s]+|-t\s+)(['"]?)(sha256~[^\s'"]+|[A-Za-z0-9_.\-]+)\1/i) ||
    trimmed.match(/(sha256~[A-Za-z0-9_\-]+)/);
  if (tokenMatch) {
    result.token = (tokenMatch[2] || tokenMatch[1] || '').trim();
  }

  // Server: --server=... or --server ... or standalone https?://... or domain:port
  const serverExplicitMatch = trimmed.match(/(?:--server[=\s]+)(['"]?)(https?:\/\/[^\s'"]+)\1/i);
  if (serverExplicitMatch) {
    result.server = serverExplicitMatch[2].trim();
  } else {
    // Check for URL in the command
    const urlMatch = trimmed.match(/(https?:\/\/[^\s'"]+)/i);
    if (urlMatch) {
      result.server = urlMatch[1].trim();
    } else {
      // Check for domain:port (e.g. api.crc.testing:6443 or 192.168.1.100:6443)
      const hostPortMatch =
        trimmed.match(/(?:--server[=\s]+)(['"]?)([a-zA-Z0-9.-]+:\d{2,5})\1/i) ||
        trimmed.match(/\b([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}:\d{2,5})\b/) ||
        trimmed.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5})\b/);
      if (hostPortMatch) {
        result.server = `https://${hostPortMatch[2] || hostPortMatch[1]}`.trim();
      }
    }
  }

  // Username: --username=... or --username ... or -u ...
  const userMatch = trimmed.match(/(?:--username[=\s]+|-u\s+)(['"]?)([^\s'"]+)\1/i);
  if (userMatch) {
    result.username = userMatch[2].trim();
  }

  // Password: --password=... or --password ... or -p ...
  const passMatch = trimmed.match(/(?:--password[=\s]+|-p\s+)(['"]?)([^\s'"]+)\1/i);
  if (passMatch) {
    result.password = passMatch[2].trim();
  }

  // Namespace: --namespace=... or --namespace ... or -n ...
  const nsMatch = trimmed.match(/(?:--namespace[=\s]+|-n\s+)(['"]?)([^\s'"]+)\1/i);
  if (nsMatch) {
    result.namespace = nsMatch[2].trim();
  }

  // Insecure skip TLS verify: --insecure-skip-tls-verify(=true)? or -k
  if (/--insecure-skip-tls-verify(=true)?\b|-k\b/i.test(trimmed)) {
    result.insecureSkipTlsVerify = true;
  } else if (/--insecure-skip-tls-verify=false\b/i.test(trimmed)) {
    result.insecureSkipTlsVerify = false;
  }

  // Certificate authority: --certificate-authority=...
  const caMatch = trimmed.match(/(?:--certificate-authority[=\s]+)(['"]?)([^\s'"]+)\1/i);
  if (caMatch) {
    result.certificateAuthority = caMatch[2].trim();
  }

  return result;
}
