import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { TopNav } from './components/TopNav.js';
import { Sidebar } from './components/Sidebar.js';
import { SearchBar } from './components/SearchBar.js';
import { ResourceTable } from './components/ResourceTable.js';
import { TopologyView } from './components/TopologyView.js';
// Lazy-loaded modal components to split heavy dependencies (CodeMirror, Xterm, Wizard, Netpol Designer)
const LogViewer = lazy(() => import('./components/LogViewer.js').then((m) => ({ default: m.LogViewer })));
const YamlModal = lazy(() => import('./components/YamlModal.js').then((m) => ({ default: m.YamlModal })));
const EditYamlModal = lazy(() => import('./components/EditYamlModal.js').then((m) => ({ default: m.EditYamlModal })));
const ImageStreamModal = lazy(() => import('./components/ImageStreamModal.js').then((m) => ({ default: m.ImageStreamModal })));
const HelmModal = lazy(() => import('./components/HelmModal.js').then((m) => ({ default: m.HelmModal })));
const ActionDialog = lazy(() => import('./components/ActionDialog.js').then((m) => ({ default: m.ActionDialog })));
const WorkloadDetailsModal = lazy(() => import('./components/WorkloadDetailsModal.js').then((m) => ({ default: m.WorkloadDetailsModal })));
const ContextModal = lazy(() => import('./components/ContextModal.js').then((m) => ({ default: m.ContextModal })));
const SecretEditorModal = lazy(() => import('./components/SecretEditorModal.js').then((m) => ({ default: m.SecretEditorModal })));
const NetworkPolicyDesignerModal = lazy(() => import('./components/NetworkPolicyDesignerModal.js').then((m) => ({ default: m.NetworkPolicyDesignerModal })));
const ResizePvcModal = lazy(() => import('./components/ResizePvcModal.js').then((m) => ({ default: m.ResizePvcModal })));
const CrdInstancesModal = lazy(() => import('./components/CrdInstancesModal.js').then((m) => ({ default: m.CrdInstancesModal })));
const PodTerminalModal = lazy(() => import('./components/PodTerminalModal.js').then((m) => ({ default: m.PodTerminalModal })));
const AddAppWizardModal = lazy(() => import('./components/AddAppWizardModal.js').then((m) => ({ default: m.AddAppWizardModal })));
const PodDebugModal = lazy(() => import('./components/PodDebugModal.js').then((m) => ({ default: m.PodDebugModal })));
const NodeDebugModal = lazy(() => import('./components/NodeDebugModal.js').then((m) => ({ default: m.NodeDebugModal })));
const ClusterOperatorEventsModal = lazy(() => import('./components/ClusterOperatorEventsModal.js').then((m) => ({ default: m.ClusterOperatorEventsModal })));
const HelpModal = lazy(() => import('./components/HelpModal.js').then((m) => ({ default: m.HelpModal })));
const BatchDeleteModal = lazy(() => import('./components/BatchDeleteModal.js').then((m) => ({ default: m.BatchDeleteModal })));
const ImageRegistryPrunerModal = lazy(() => import('./components/ImageRegistryPrunerModal.js').then((m) => ({ default: m.ImageRegistryPrunerModal })));
const PortForwardModal = lazy(() => import('./components/PortForwardModal.js').then((m) => ({ default: m.PortForwardModal })));

import { ResourceKind, ResourceItem, KubeContext, ServerInfo, ProjectInfo, ImageStreamResource } from '../types/k8s.js';
import { PreloaderAnimation, PreloadStep } from './components/PreloaderAnimation.js';
import { FuzzyMatcher } from '../utils/fuzzy.js';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

type ModalMode =
  | 'none'
  | 'context'
  | 'project'
  | 'add-app'
  | 'workload-details'
  | 'logs'
  | 'terminal'
  | 'port-forward'
  | 'debug-pod'
  | 'debug-node'
  | 'netpol-designer'
  | 'operator-events'
  | 'yaml'
  | 'edit-yaml'
  | 'edit-secret'
  | 'resize-pvc'
  | 'crd-instances'
  | 'describe'
  | 'scale'
  | 'restart'
  | 'delete'
  | 'clean-is'
  | 'prune-image-blobs'
  | 'helm'
  | 'help';

interface ModalStackEntry {
  mode: ModalMode;
  item: ResourceItem | null;
}

export const App: React.FC = () => {
  // Context, Server & Project State
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [currentContext, setCurrentContext] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [currentProject, setCurrentProject] = useState<string>('all-projects');
  const [clusterInfo, setClusterInfo] = useState<any>(null);
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Resource State - Topology is first tab by default
  const [currentKind, setCurrentKind] = useState<ResourceKind>('topology');
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [counts, setCounts] = useState<Partial<Record<ResourceKind, number>>>({});
  const [selectedItem, setSelectedItem] = useState<ResourceItem | null>(null);
  const [query, setQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [tagCountFilter, setTagCountFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusNotification, setStatusNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [selectedPodIds, setSelectedPodIds] = useState<Set<string>>(new Set());
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState<boolean>(false);
  const [topologyPreloadData, setTopologyPreloadData] = useState<any>(null);
  const resourceCacheRef = useRef<Map<string, ResourceItem[]>>(new Map());
  const getClientCacheKey = (ns: string, kind: string) => `${ns || 'default'}::${kind}`;

  // High-Tech Preloader Animation State for smooth context & project switches
  const [preloaderState, setPreloaderState] = useState<{
    isActive: boolean;
    mode: 'context' | 'project' | 'initial';
    title: string;
    subtitle?: string;
    target: string;
    subTarget?: string;
    progress: number;
    currentStage: string;
    steps: PreloadStep[];
  }>({
    isActive: false,
    mode: 'context',
    title: '',
    target: '',
    progress: 0,
    currentStage: '',
    steps: [],
  });

  // Modal Navigation Stack for deep child modal back navigation
  const [modalMode, setModalMode] = useState<ModalMode>('none');
  const [modalStack, setModalStack] = useState<ModalStackEntry[]>([]);

  const openModal = (mode: ModalMode, item?: ResourceItem | null) => {
    const nextItem = item !== undefined ? item : selectedItem;
    if (modalMode !== 'none') {
      setModalStack((prev) => [...prev, { mode: modalMode, item: selectedItem }]);
    }
    if (nextItem !== undefined) setSelectedItem(nextItem);
    setModalMode(mode);
  };

  const closeModal = () => {
    if (modalStack.length > 0) {
      const parent = modalStack[modalStack.length - 1];
      setModalStack((prev) => prev.slice(0, -1));
      setModalMode(parent.mode);
      setSelectedItem(parent.item);
    } else {
      setModalMode('none');
    }
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusNotification({ text, type });
    setTimeout(() => {
      setStatusNotification((curr) => (curr?.text === text ? null : curr));
    }, 4000);
  };

  // Load Kubeconfig contexts, servers, and active project
  const loadKubeInfo = useCallback(async (preferredProject?: string) => {
    try {
      const api = (window as any).electronAPI;
      if (!api) return;

      const res = await api.getContexts();
      const ctxList = res?.contexts || [];
      const currCtx = res?.currentContext || null;
      const srvList = res?.servers || [];
      setContexts(ctxList);
      setServers(srvList);
      setCurrentContext(currCtx);

      const info = await api.getClusterInfo();
      setClusterInfo(info);

      const projList = await api.getProjects();
      setProjects(projList || []);

      const targetNs = preferredProject !== undefined ? preferredProject : (info?.namespace || (await api.getCurrentNamespace()) || 'all-projects');
      if (targetNs) {
        setCurrentProject(targetNs);
        // Preload all resources in background into client cache
        api.preloadAllResources(targetNs, currentKind).then((preloadRes: any) => {
          if (preloadRes) {
            if (preloadRes.counts) setCounts((prev) => ({ ...prev, ...preloadRes.counts }));
            if (preloadRes.itemsByKind) {
              Object.entries(preloadRes.itemsByKind).forEach(([k, items]) => {
                resourceCacheRef.current.set(getClientCacheKey(targetNs, k), items as ResourceItem[]);
              });
              const active = preloadRes.itemsByKind[currentKind];
              if (Array.isArray(active) && active.length > 0) {
                setResources(active);
              }
            }
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Error in loadKubeInfo:', e);
    }
  }, [currentKind]);

  // Fetch resources for active kind and project with instant cache lookup
  const fetchResources = useCallback(
    async (isBackground = false, force = false) => {
      if (currentKind === 'topology') return;
      const api = (window as any).electronAPI;
      if (!api) return;

      const cacheKey = getClientCacheKey(currentProject, currentKind);
      const cached = resourceCacheRef.current.get(cacheKey);

      // Instant 0ms render from memory cache if available
      if (cached && !isBackground && !force) {
        setResources(cached);
        setLoading(false);
        // Silent background revalidation
        api.getResources(currentKind, currentProject).then((res: any) => {
          if (res && res.items) {
            setResources(res.items);
            resourceCacheRef.current.set(cacheKey, res.items);
            setCounts((prev) => ({ ...prev, [currentKind]: res.items.length }));
            setFetchError(res.error || null);
            setIsUnauthorized(!!res.isUnauthorized);
          }
        }).catch(() => {});
        return;
      }

      if (!isBackground && !cached) setLoading(true);
      try {
        const res = await api.getResources(currentKind, currentProject);
        if (res && res.items) {
          setResources(res.items);
          resourceCacheRef.current.set(cacheKey, res.items);
          setCounts((prev) => ({ ...prev, [currentKind]: res.items.length }));
          setFetchError(res.error || null);
          setIsUnauthorized(!!res.isUnauthorized);
        } else if (Array.isArray(res)) {
          setResources(res);
          resourceCacheRef.current.set(cacheKey, res);
          setCounts((prev) => ({ ...prev, [currentKind]: res.length }));
          setFetchError(null);
          setIsUnauthorized(false);
        }
      } catch (err: any) {
        setFetchError(err.message || 'Failed to fetch resources');
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [currentKind, currentProject]
  );

  // Initial load
  useEffect(() => {
    loadKubeInfo();
  }, [loadKubeInfo]);

  // Fetch when kind or project changes
  useEffect(() => {
    setSelectedItem(null);
    setStatusFilter('ALL');
    setSelectedPodIds(new Set());
    if (currentKind !== 'topology' && !preloaderState.isActive) {
      fetchResources(false);
    }
  }, [fetchResources, currentKind, preloaderState.isActive]);

  // Auto-polling interval
  useEffect(() => {
    if (currentKind === 'topology') return;
    const interval = setInterval(() => {
      fetchResources(true);
    }, currentKind === 'events' ? 2500 : 3500);
    return () => clearInterval(interval);
  }, [currentKind, fetchResources]);

  // Available statuses in current resource list
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of resources) {
      if (r.status) set.add(r.status);
    }
    return Array.from(set).sort();
  }, [resources]);

  // Clearable pods count (Completed, Failed, Error, CrashLoopBackOff)
  const clearablePodsCount = useMemo(() => {
    if (currentKind !== 'pods') return 0;
    return resources.filter((p) => {
      const st = (p.status || '').toLowerCase();
      return st.includes('completed') || st.includes('failed') || st.includes('error') || st.includes('crashloop') || st.includes('evicted');
    }).length;
  }, [currentKind, resources]);

  // Filter items by status and search query
  const filteredItems = useMemo(() => {
    let items = resources;

    // Filter by status if selected
    if (statusFilter !== 'ALL') {
      if (currentKind === 'events') {
        items = items.filter((item) => item.extra?.eventType === statusFilter);
      } else {
        items = items.filter((item) => item.status === statusFilter);
      }
    }

    // Filter by tag count for ImageStreams
    if (currentKind === 'imagestreams' && tagCountFilter !== 'ALL') {
      items = items.filter((item) => {
        const count = (item as ImageStreamResource).tags?.length ?? item.extra?.tagCount ?? (item as any).tagCount ?? 0;
        if (tagCountFilter === 'gte1') return count >= 1;
        if (tagCountFilter === 'gte5') return count >= 5;
        if (tagCountFilter === 'gte10') return count >= 10;
        if (tagCountFilter === 'gte20') return count >= 20;
        if (tagCountFilter === 'gte50') return count >= 50;
        if (tagCountFilter === 'empty') return count === 0;
        return true;
      });
    }

    // Filter by search query
    if (query.trim()) {
      const matcher = new FuzzyMatcher(items, ['name', 'status', 'namespace', 'ip', 'node', 'age', 'extra.message', 'extra.reason', 'extra.volume', 'extra.capacity', 'extra.group']);
      items = matcher.search(query);
    }

    return items;
  }, [resources, statusFilter, tagCountFilter, query, currentKind]);

  // Handle Clear Completed & Failed Pods
  const handleClearCompletedFailedPods = async () => {
    if (clearablePodsCount === 0) {
      alert('No completed, error, or failed pods found in this project.');
      return;
    }

    const targetScope = currentProject === 'all-projects' ? 'all projects' : `project '${currentProject}'`;
    if (!window.confirm(`Are you sure you want to permanently delete all ${clearablePodsCount} completed and failed pods across ${targetScope}?`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await (window as any).electronAPI.prunePods(currentProject);
      if (res.success) {
        showToast(res.message, 'success');
        fetchResources(false);
      } else {
        showToast(res.message, 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to prune pods', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle Batch Delete Selected Pods
  const handleDeleteSelectedPods = () => {
    if (selectedPodIds.size === 0) return;

    if (!currentProject || currentProject === 'all-projects' || currentProject === '__all__') {
      showToast('Batch pod deletion is only available within a specific project. Please select a project first.', 'error');
      return;
    }

    setBatchDeleteModalOpen(true);
  };

  // Handle Switch Context & Server with automatic data preloading & live loading animation
  const handleSwitchContext = async (contextName: string) => {
    closeModal();
    const api = (window as any).electronAPI;
    if (!api) return;

    const initialSteps: PreloadStep[] = [
      { id: 'auth', label: 'Cluster API Handshake', status: 'in-progress' },
      { id: 'projects', label: 'Projects & Namespaces', status: 'pending' },
      { id: 'workloads', label: 'Workload Manifests', status: 'pending' },
      { id: 'networking', label: 'Networking & Storage', status: 'pending' },
      { id: 'active', label: 'Receiving Target Objects', status: 'pending' },
    ];

    setPreloaderState({
      isActive: true,
      mode: 'context',
      title: 'Switching Server Context',
      subtitle: 'Connecting to cluster and preloading manifests...',
      target: contextName,
      subTarget: '',
      progress: 15,
      currentStage: 'Connecting to cluster API server...',
      steps: initialSteps,
    });
    setLoading(true);

    try {
      // 1. Switch context in kubeconfig / cluster client
      const ok = await api.switchContext(contextName);
      if (!ok) {
        throw new Error(`Failed to switch context to ${contextName}`);
      }

      setCurrentContext(contextName);
      setContexts((prev) => prev.map((c) => ({ ...c, isCurrent: c.name === contextName })));
      setServers((prev) => prev.map((s) => ({ ...s, isCurrent: s.contexts.some((c) => c.name === contextName) })));

      setPreloaderState((prev) => ({
        ...prev,
        progress: 35,
        currentStage: 'Discovering cluster projects & metadata...',
        steps: prev.steps.map((s) =>
          s.id === 'auth' ? { ...s, status: 'completed' } : s.id === 'projects' ? { ...s, status: 'in-progress' } : s
        ),
      }));

      // 2. Fetch cluster info and projects for the new server
      const [info, projList] = await Promise.all([
        api.getClusterInfo(),
        api.getProjects(),
      ]);

      setClusterInfo(info);
      setProjects(projList || []);

      const newNs = info?.namespace || (await api.getCurrentNamespace()) || 'all-projects';
      setCurrentProject(newNs);
      setSelectedItem(null);
      setSelectedPodIds(new Set());
      setQuery('');

      setPreloaderState((prev) => ({
        ...prev,
        target: info?.server || contextName,
        subTarget: newNs === 'all-projects' ? 'All Projects (Cluster-Wide)' : newNs,
        progress: 60,
        currentStage: `Preloading objects and manifest counts for ${newNs}...`,
        steps: prev.steps.map((s) =>
          s.id === 'projects' ? { ...s, status: 'completed' } : s.id === 'workloads' || s.id === 'networking' ? { ...s, status: 'in-progress' } : s
        ),
      }));

      // 3. Preload active view resources + counts across all kinds in a single accelerated call
      const preloadRes = await api.preloadAllResources(newNs, currentKind).catch(() => ({ counts: {}, itemsByKind: {}, activeResources: { items: [] } }));

      if (preloadRes.counts) {
        setCounts(preloadRes.counts);
      }

      if (preloadRes.itemsByKind) {
        Object.entries(preloadRes.itemsByKind).forEach(([k, items]) => {
          resourceCacheRef.current.set(getClientCacheKey(newNs, k), items as ResourceItem[]);
        });
      }

      if (currentKind === 'topology') {
        if (preloadRes.topologyData) {
          setTopologyPreloadData(preloadRes.topologyData);
        }
      } else {
        const activeItems = preloadRes.activeResources?.items || (preloadRes.itemsByKind && preloadRes.itemsByKind[currentKind]) || [];
        setResources(activeItems);
        setFetchError(preloadRes.activeResources?.error || null);
        setIsUnauthorized(!!preloadRes.activeResources?.isUnauthorized);
      }

      // 4. Mark all steps completed & 100%
      setPreloaderState((prev) => ({
        ...prev,
        progress: 100,
        currentStage: 'All objects received successfully!',
        steps: prev.steps.map((s) => ({ ...s, status: 'completed' })),
      }));

      showToast(`Switched server to ${info?.server || contextName}`);

      // Smooth completion transition
      setTimeout(() => {
        setPreloaderState((prev) => ({ ...prev, isActive: false }));
        setLoading(false);
      }, 300);
    } catch (err: any) {
      setPreloaderState((prev) => ({
        ...prev,
        currentStage: err.message || 'Failed to switch context',
        steps: prev.steps.map((s) => (s.status === 'in-progress' ? { ...s, status: 'error' } : s)),
      }));
      showToast(err.message || `Failed to switch context to ${contextName}`, 'error');
      setTimeout(() => {
        setPreloaderState((prev) => ({ ...prev, isActive: false }));
        setLoading(false);
      }, 1000);
    }
  };

  // Handle Switch Project with automatic data preloading & live loading animation
  const handleSwitchProject = async (projectName: string) => {
    closeModal();
    const api = (window as any).electronAPI;
    if (!api) return;

    const isAll = projectName === 'all-projects' || projectName === '__all__';
    const displayTarget = isAll ? 'All Projects (Cluster-Wide)' : projectName;

    const initialSteps: PreloadStep[] = [
      { id: 'namespace', label: 'Namespace Context Switch', status: 'in-progress' },
      { id: 'workloads', label: 'Workloads & Pods', status: 'pending' },
      { id: 'networking', label: 'Routes & Services', status: 'pending' },
      { id: 'config', label: 'Config & Storage Manifests', status: 'pending' },
      { id: 'active', label: 'Syncing Active View', status: 'pending' },
    ];

    setPreloaderState({
      isActive: true,
      mode: 'project',
      title: 'Switching OpenShift Project',
      subtitle: 'Switching namespace and preloading objects...',
      target: displayTarget,
      subTarget: clusterInfo?.server || currentContext || '',
      progress: 20,
      currentStage: `Switching namespace context to ${projectName}...`,
      steps: initialSteps,
    });
    setLoading(true);

    try {
      const ok = await api.switchProject(projectName);
      if (!ok) {
        throw new Error(`Failed to switch project to ${projectName}`);
      }

      setCurrentProject(projectName);
      setProjects((prev) => prev.map((p) => ({ ...p, isCurrent: p.name === projectName })));
      setSelectedItem(null);
      setSelectedPodIds(new Set());
      setQuery('');

      setPreloaderState((prev) => ({
        ...prev,
        progress: 55,
        currentStage: `Preloading cluster objects for ${displayTarget}...`,
        steps: prev.steps.map((s) =>
          s.id === 'namespace' ? { ...s, status: 'completed' } : s.id === 'workloads' || s.id === 'networking' ? { ...s, status: 'in-progress' } : s
        ),
      }));

      // Preload active view resources + counts across all kinds in a single accelerated call
      const preloadRes = await api.preloadAllResources(projectName, currentKind).catch(() => ({ counts: {}, itemsByKind: {}, activeResources: { items: [] } }));

      if (preloadRes.counts) {
        setCounts(preloadRes.counts);
      }

      if (preloadRes.itemsByKind) {
        Object.entries(preloadRes.itemsByKind).forEach(([k, items]) => {
          resourceCacheRef.current.set(getClientCacheKey(projectName, k), items as ResourceItem[]);
        });
      }

      if (currentKind === 'topology') {
        if (preloadRes.topologyData) {
          setTopologyPreloadData(preloadRes.topologyData);
        }
      } else {
        const activeItems = preloadRes.activeResources?.items || (preloadRes.itemsByKind && preloadRes.itemsByKind[currentKind]) || [];
        setResources(activeItems);
        setFetchError(preloadRes.activeResources?.error || null);
        setIsUnauthorized(!!preloadRes.activeResources?.isUnauthorized);
      }

      setPreloaderState((prev) => ({
        ...prev,
        progress: 100,
        currentStage: 'All objects received successfully!',
        steps: prev.steps.map((s) => ({ ...s, status: 'completed' })),
      }));

      showToast(isAll ? 'Switched to All Projects' : `Switched to project ${projectName}`);

      setTimeout(() => {
        setPreloaderState((prev) => ({ ...prev, isActive: false }));
        setLoading(false);
      }, 300);
    } catch (err: any) {
      setPreloaderState((prev) => ({
        ...prev,
        currentStage: err.message || 'Failed to switch project',
        steps: prev.steps.map((s) => (s.status === 'in-progress' ? { ...s, status: 'error' } : s)),
      }));
      showToast(err.message || `Failed to switch project to ${projectName}`, 'error');
      setTimeout(() => {
        setPreloaderState((prev) => ({ ...prev, isActive: false }));
        setLoading(false);
      }, 1000);
    }
  };

  // Action Dispatcher with Modal Stack preservation
  const handleAction = (actionType: string, targetItem?: ResourceItem) => {
    const item = targetItem || selectedItem;
    if (
      !item &&
      actionType !== 'help' &&
      actionType !== 'netpol-designer' &&
      actionType !== 'add-app' &&
      actionType !== 'prune-image-blobs'
    )
      return;

    switch (actionType) {
      case 'add-app':
        openModal('add-app');
        break;
      case 'prune-image-blobs':
        openModal('prune-image-blobs');
        break;
      case 'workload-details':
        openModal('workload-details', item);
        break;
      case 'view-pods':
        if (item) {
          if (item.namespace && currentProject !== 'all-projects' && item.namespace !== currentProject) {
            setCurrentProject(item.namespace);
          }
          setCurrentKind('pods');
          setQuery(item.name);
          setSelectedItem(null);
          showToast(`Showing Pods for ${item.kind}/${item.name}`);
        }
        break;
      case 'edit-yaml':
        openModal('edit-yaml', item);
        break;
      case 'edit-secret':
        openModal('edit-secret', item);
        break;
      case 'resize-pvc':
        openModal('resize-pvc', item);
        break;
      case 'crd-instances':
        openModal('crd-instances', item);
        break;
      case 'logs':
        openModal('logs', item);
        break;
      case 'terminal':
        openModal('terminal', item);
        break;
      case 'port-forward':
        openModal('port-forward', item);
        break;
      case 'system-terminal':
        if (item) {
          (window as any).electronAPI.openDefaultTerminal(item.name, item.namespace || currentProject);
          showToast(`Opening ${item.name} console in System Terminal`);
        }
        break;
      case 'debug-pod':
        openModal('debug-pod', item);
        break;
      case 'debug-node':
        openModal('debug-node', item);
        break;
      case 'netpol-designer':
        openModal('netpol-designer', item);
        break;
      case 'operator-events':
        openModal('operator-events', item);
        break;
      case 'scale':
        openModal('scale', item);
        break;
      case 'restart':
        openModal('restart', item);
        break;
      case 'clean-is':
        openModal('clean-is', item);
        break;
      case 'helm-values':
      case 'yaml':
        openModal('yaml', item);
        break;
      case 'describe':
        openModal('describe', item);
        break;
      case 'helm-manage':
      case 'helm-history':
        openModal('helm', item);
        break;
      case 'delete':
        openModal('delete', item);
        break;
    }
  };

  const handleNavigate = (kind: ResourceKind, searchTarget?: string, targetNs?: string) => {
    if (targetNs && targetNs !== currentProject && currentProject !== 'all-projects') {
      const isCluster = kind === 'nodes' || kind === 'pv' || kind === 'crd' || kind === 'clusteroperators';
      if (!isCluster) {
        handleSwitchProject(targetNs);
      }
    }
    setCurrentKind(kind);
    if (searchTarget) {
      setQuery(searchTarget);
    }
    showToast(`Navigated to ${kind}${searchTarget ? `: ${searchTarget}` : ''}`);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalMode !== 'none' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') closeModal();
        return;
      }

      if (e.key === 'c') {
        e.preventDefault();
        loadKubeInfo();
        openModal('context');
      } else if (e.key === 'p') {
        e.preventDefault();
        loadKubeInfo();
        openModal('project');
      } else if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      } else if (e.key === '1') setCurrentKind('topology');
      else if (e.key === '2') setCurrentKind('pods');
      else if (e.key === '3') setCurrentKind('deployments');
      else if (e.key === '4') setCurrentKind('deploymentconfigs');
      else if (e.key === '5') setCurrentKind('statefulsets');
      else if (e.key === '6') setCurrentKind('daemonsets');
      else if (e.key === '7') setCurrentKind('routes');
      else if (e.key === 'g') setCurrentKind('ingresses');
      else if (e.key === '8') setCurrentKind('services');
      else if (e.key === 'w') setCurrentKind('networkpolicies');
      else if (e.key === '9') setCurrentKind('pvc');
      else if (e.key === '0') setCurrentKind('pv');
      else if (e.key === 'k') setCurrentKind('crd');
      else if (e.key === 'i') setCurrentKind('imagestreams');
      else if (e.key === 'h') setCurrentKind('helm');
      else if (e.key === 'c') setCurrentKind('configmaps');
      else if (e.key === 's') setCurrentKind('secrets');
      else if (e.key === 'n') setCurrentKind('nodes');
      else if (e.key === 'o') setCurrentKind('clusteroperators');
      else if (e.key === 'e') setCurrentKind('events');
      else if (e.key === 'a') openModal('add-app');
      else if (e.key === '?') openModal('help');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalMode, loadKubeInfo]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-main)] text-[var(--text-main)] overflow-hidden font-sans select-none transition-colors duration-150">
      {/* Top Bar with traffic lights & cluster context */}
      <TopNav
        currentContext={currentContext}
        currentProject={currentProject}
        clusterServer={clusterInfo?.server || ''}
        clusterName={clusterInfo?.clusterName}
        clusterUser={clusterInfo?.user || ''}
        isConnected={clusterInfo?.connected ?? true}
        isUnauthorized={isUnauthorized}
        onOpenContextModal={() => {
          loadKubeInfo();
          openModal('context');
        }}
        onOpenProjectModal={() => {
          loadKubeInfo();
          openModal('project');
        }}
        onOpenAddAppModal={() => {
          openModal('add-app');
        }}
      />

      {/* Main Layout (Sidebar + Content) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          currentKind={currentKind}
          onSelectKind={(kind) => setCurrentKind(kind)}
          counts={counts}
          onOpenHelp={() => openModal('help')}
        />

        {/* Center Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-main)] transition-colors duration-150 relative">
          {/* Preloader Animation Overlay during Context & Project switching */}
          <PreloaderAnimation {...preloaderState} />

          {/* Toast Notification Banner */}
          {statusNotification && (
            <div
              className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b ${
                statusNotification.type === 'error'
                  ? 'bg-[#f92672]/20 text-[#f92672] border-[#f92672]/40'
                  : 'bg-[#a6e22e]/20 text-[#a6e22e] border-[#a6e22e]/40'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusNotification.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                <span>{statusNotification.text}</span>
              </div>
            </div>
          )}

          {/* Render Topology View or Resource Table */}
          {currentKind === 'topology' ? (
            <TopologyView
              currentProject={currentProject}
              initialData={topologyPreloadData}
              onSelectWorkload={(item) => openModal('workload-details', item)}
              onOpenWorkloadLogs={(item) => openModal('logs', item)}
              onOpenWorkloadYaml={(item) => openModal('edit-yaml', item)}
              onOpenWorkloadScale={(item) => openModal('scale', item)}
              onOpenPvcResize={(item) => openModal('resize-pvc', item)}
              onOpenPodTerminal={(item) => openModal('terminal', item)}
              onOpenPodLogs={(item) => openModal('logs', item)}
              onOpenExternal={async (url) => {
                const api = (window as any).electronAPI;
                if (api && api.openExternal) await api.openExternal(url);
                else window.open(url, '_blank');
              }}
            />
          ) : (
            <>
              {/* Autocomplete Search & Action Bar with Status Filter & Clear Pods */}
              <SearchBar
                query={query}
                onChangeQuery={setQuery}
                statusFilter={statusFilter}
                onChangeStatusFilter={setStatusFilter}
                tagCountFilter={tagCountFilter}
                onChangeTagCountFilter={setTagCountFilter}
                availableStatuses={availableStatuses}
                currentKind={currentKind}
                currentProject={currentProject}
                selectedItem={selectedItem}
                onAction={handleAction}
                onClearCompletedFailed={handleClearCompletedFailedPods}
                clearablePodsCount={clearablePodsCount}
                selectedPodCount={selectedPodIds.size}
                onDeleteSelectedPods={handleDeleteSelectedPods}
              />

              {/* Resource Table */}
              <ResourceTable
                kind={currentKind}
                items={filteredItems}
                currentProject={currentProject}
                selectedItem={selectedItem}
                onSelectItem={(item) => setSelectedItem(item)}
                loading={loading}
                error={fetchError}
                isUnauthorized={isUnauthorized}
                onRowAction={(action, item) => handleAction(action, item)}
                onNavigate={handleNavigate}
                onOpenContextModal={() => {
                  loadKubeInfo();
                  openModal('context');
                }}
                onRetry={() => fetchResources(false)}
                selectedPodIds={selectedPodIds}
                onSelectedPodsChange={setSelectedPodIds}
              />
            </>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MODAL WINDOWS WITH FULL STACK BACK-NAVIGATION                             */}
      {/* ========================================================================= */}
      <Suspense fallback={null}>
        {/* Context Switcher Modal */}
        {modalMode === 'context' && (
          <ContextModal
            mode="context"
            contexts={contexts}
            servers={servers}
            projects={projects}
            currentContext={currentContext}
            currentProject={currentProject}
            onSelectContext={handleSwitchContext}
            onSelectProject={() => {}}
            onRefreshContexts={loadKubeInfo}
            onClose={closeModal}
          />
        )}

        {/* Project Switcher Modal */}
        {modalMode === 'project' && (
          <ContextModal
            mode="project"
            contexts={contexts}
            servers={servers}
            projects={projects}
            currentContext={currentContext}
            currentProject={currentProject}
            onSelectContext={() => {}}
            onSelectProject={handleSwitchProject}
            onClose={closeModal}
          />
        )}

        {/* Workload Hierarchy Details Modal (Replicasets / ReplicationControllers & Live Pods) */}
        {modalMode === 'workload-details' && selectedItem && (
          <WorkloadDetailsModal
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onAction={(act, target) => handleAction(act, target || selectedItem)}
            onOpenPodTerminal={(podName) => {
              openModal('terminal', {
                id: podName,
                name: podName,
                namespace: selectedItem.namespace || currentProject,
                kind: 'pods',
                status: 'Running',
                age: '',
              });
            }}
            onOpenPodLogs={(podName) => {
              openModal('logs', {
                id: podName,
                name: podName,
                namespace: selectedItem.namespace || currentProject,
                kind: 'pods',
                status: 'Running',
                age: '',
              });
            }}
            onOpenPodDescribe={(podName) => {
              openModal('describe', {
                id: podName,
                name: podName,
                namespace: selectedItem.namespace || currentProject,
                kind: 'pods',
                status: 'Running',
                age: '',
              });
            }}
            onOpenPodYaml={(podName) => {
              openModal('yaml', {
                id: podName,
                name: podName,
                namespace: selectedItem.namespace || currentProject,
                kind: 'pods',
                status: 'Running',
                age: '',
              });
            }}
            onOpenPodDebug={(podName) => {
              openModal('debug-pod', {
                id: podName,
                name: podName,
                namespace: selectedItem.namespace || currentProject,
                kind: 'pods',
                status: 'Running',
                age: '',
              });
            }}
          />
        )}

        {/* Pod Failure Diagnostics & oc debug Modal */}
        {modalMode === 'debug-pod' && selectedItem && (
          <PodDebugModal
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onOpenLogs={(podName) => {
              openModal('logs', {
                id: podName,
                name: podName,
                namespace: selectedItem.namespace || currentProject,
                kind: 'pods',
                status: 'Running',
                age: '',
              });
            }}
            onOpenYaml={(podName) => {
              openModal('yaml', {
                id: podName,
                name: podName,
                namespace: selectedItem.namespace || currentProject,
                kind: 'pods',
                status: 'Running',
                age: '',
              });
            }}
          />
        )}

        {/* Node Health Diagnostics & Host Debugger Modal */}
        {modalMode === 'debug-node' && selectedItem && (
          <NodeDebugModal
            item={selectedItem}
            onClose={closeModal}
            onOpenYaml={(nodeName) => {
              openModal('yaml', {
                id: nodeName,
                name: nodeName,
                namespace: '',
                kind: 'nodes',
                status: 'Ready',
                age: '',
              });
            }}
            onOpenDescribe={(nodeName) => {
              openModal('describe', {
                id: nodeName,
                name: nodeName,
                namespace: '',
                kind: 'nodes',
                status: 'Ready',
                age: '',
              });
            }}
          />
        )}

        {/* Interactive Pod Terminal Modal */}
        {modalMode === 'terminal' && selectedItem && (
          <PodTerminalModal
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
          />
        )}

        {/* Port Forwarding Modal for Services, Ingresses, Routes, Pods */}
        {modalMode === 'port-forward' && selectedItem && (
          <PortForwardModal
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onSuccess={(msg) => {
              showToast(msg, 'success');
            }}
          />
        )}

        {/* Live Log Streamer Modal */}
        {modalMode === 'logs' && selectedItem && (
          <LogViewer
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
          />
        )}

        {/* Read-Only YAML / Describe Modal with direct Edit Button */}
        {(modalMode === 'yaml' || modalMode === 'describe') && selectedItem && (
          <YamlModal
            mode={modalMode}
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onEdit={() => openModal('edit-yaml')}
          />
        )}

        {/* Interactive Edit YAML Modal */}
        {modalMode === 'edit-yaml' && selectedItem && (
          <EditYamlModal
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onSuccess={(msg) => {
              showToast(msg, 'success');
              fetchResources(false, true);
            }}
          />
        )}

        {/* Add Application Workload Wizard Modal (inspired by k8syaml) */}
        {modalMode === 'add-app' && (
          <AddAppWizardModal
            namespace={currentProject !== 'all-projects' && currentProject !== '__all__' ? currentProject : 'default'}
            onClose={closeModal}
            onSuccess={(msg) => {
              showToast(msg, 'success');
              fetchResources(false, true);
            }}
          />
        )}

        {/* Interactive NetworkPolicy Graphic Visual Designer Modal */}
        {modalMode === 'netpol-designer' && (
          <NetworkPolicyDesignerModal
            item={selectedItem}
            namespace={selectedItem?.namespace || currentProject || 'default'}
            onClose={closeModal}
            onSuccess={(msg) => {
              showToast(msg, 'success');
              fetchResources(false, true);
            }}
          />
        )}

        {/* GUI Secret Editor Modal (Decoded Plaintext Key-Values) */}
        {modalMode === 'edit-secret' && selectedItem && (
          <SecretEditorModal
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onSuccess={(msg) => {
              showToast(msg, 'success');
              fetchResources(false, true);
            }}
          />
        )}

        {/* PVC Storage Capacity Resize Modal */}
        {modalMode === 'resize-pvc' && selectedItem && (
          <ResizePvcModal
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onSuccess={(msg) => {
              showToast(msg, 'success');
              fetchResources(false, true);
            }}
          />
        )}

        {/* CRD Custom Resource Instances Explorer & Editor Modal */}
        {modalMode === 'crd-instances' && selectedItem && (
          <CrdInstancesModal
            crdItem={selectedItem}
            namespace={currentProject}
            onClose={closeModal}
            onEditInstance={(inst) => openModal('edit-yaml', inst)}
            onDescribeInstance={(inst) => openModal('describe', inst)}
            onDeleteInstance={(inst) => openModal('delete', inst)}
          />
        )}

        {/* Cluster Operator Live Events & Condition Transition Modal */}
        {modalMode === 'operator-events' && selectedItem && (
          <ClusterOperatorEventsModal
            operatorItem={selectedItem}
            onClose={closeModal}
          />
        )}

        {/* ImageStream SemVer Tag Manager & Cleanup Wizard Modal */}
        {modalMode === 'clean-is' && selectedItem && (
          <ImageStreamModal
            imageStream={selectedItem as ImageStreamResource}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onRefresh={() => fetchResources(false, true)}
          />
        )}

        {/* OpenShift Integrated Registry Image & Blob Pruner Modal */}
        {modalMode === 'prune-image-blobs' && (
          <ImageRegistryPrunerModal
            onClose={closeModal}
            onRefresh={() => fetchResources(false, true)}
          />
        )}

        {/* Helm Release Manager Modal (Values Edit & Upgrade) */}
        {modalMode === 'helm' && selectedItem && (
          <HelmModal
            release={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onRefresh={() => fetchResources(false, true)}
          />
        )}

        {/* Workload Action Dialogs (Scale, Restart, Delete) */}
        {(modalMode === 'scale' || modalMode === 'restart' || modalMode === 'delete') && selectedItem && (
          <ActionDialog
            mode={modalMode}
            item={selectedItem}
            namespace={selectedItem.namespace || currentProject}
            onClose={closeModal}
            onSuccess={(msg) => {
              closeModal();
              showToast(msg, 'success');
              fetchResources(false, true);
            }}
            onError={(msg) => {
              closeModal();
              showToast(msg, 'error');
            }}
          />
        )}

        {/* Keyboard Shortcuts & Help Modal */}
        {modalMode === 'help' && (
          <HelpModal onClose={closeModal} />
        )}

        {/* Themed Batch Delete Confirmation Modal */}
        {batchDeleteModalOpen && (
          <BatchDeleteModal
            items={resources.filter((r) => selectedPodIds.has(r.id))}
            namespace={currentProject}
            onClose={() => setBatchDeleteModalOpen(false)}
            onSuccess={(msg) => {
              setBatchDeleteModalOpen(false);
              showToast(msg, 'success');
              setSelectedPodIds(new Set());
              fetchResources(false, true);
            }}
            onError={(msg) => {
              setBatchDeleteModalOpen(false);
              showToast(msg, 'error');
            }}
          />
        )}
      </Suspense>
    </div>
  );
};
