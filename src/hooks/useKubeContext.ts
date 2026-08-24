import { useState, useEffect, useCallback } from 'react';
import { KubeConfigService } from '../services/kubeconfig.js';
import { KubeContext, ProjectInfo, ClusterInfo } from '../types/k8s.js';

export function useKubeContext() {
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [currentContext, setCurrentContext] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [currentProject, setCurrentProject] = useState<string>('default');
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { contexts: ctxList, currentContext: currCtx } = await KubeConfigService.getContexts();
      setContexts(ctxList);
      setCurrentContext(currCtx);

      const currNs = await KubeConfigService.getCurrentNamespace();
      setCurrentProject(currNs);

      const info = await KubeConfigService.getClusterInfo();
      setClusterInfo(info);

      const projList = await KubeConfigService.getProjects();
      setProjects(projList);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load kubeconfig');
    } finally {
      setLoading(false);
    }
  }, []);

  const switchContext = useCallback(async (contextName: string) => {
    setLoading(true);
    const success = await KubeConfigService.switchContext(contextName);
    if (success) {
      await refresh();
    }
    return success;
  }, [refresh]);

  const switchProject = useCallback(async (projectName: string) => {
    setLoading(true);
    const success = await KubeConfigService.switchProject(projectName);
    if (success) {
      setCurrentProject(projectName);
      await refresh();
    }
    return success;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    contexts,
    currentContext,
    projects,
    currentProject,
    clusterInfo,
    loading,
    error,
    refresh,
    switchContext,
    switchProject,
  };
}
