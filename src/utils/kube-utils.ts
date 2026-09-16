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
