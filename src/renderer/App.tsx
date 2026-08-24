import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TopNav } from './components/TopNav.js';
import { Sidebar } from './components/Sidebar.js';
import { SearchBar } from './components/SearchBar.js';
import { ResourceTable } from './components/ResourceTable.js';
import { LogViewer } from './components/LogViewer.js';
import { YamlModal } from './components/YamlModal.js';
import { EditYamlModal } from './components/EditYamlModal.js';
import { ImageStreamModal } from './components/ImageStreamModal.js';
import { HelmModal } from './components/HelmModal.js';
import { ActionDialog } from './components/ActionDialog.js';
import { WorkloadDetailsModal } from './components/WorkloadDetailsModal.js';
import { TopologyView } from './components/TopologyView.js';
import { ContextModal } from './components/ContextModal.js';
import { SecretEditorModal } from './components/SecretEditorModal.js';
import { ResizePvcModal } from './components/ResizePvcModal.js';
import { CrdInstancesModal } from './components/CrdInstancesModal.js';
import { PodTerminalModal } from './components/PodTerminalModal.js';
import { ClusterOperatorEventsModal } from './components/ClusterOperatorEventsModal.js';
import { ResourceKind, ResourceItem, KubeContext, ProjectInfo, ImageStreamResource } from '../types/k8s.js';
import { FuzzyMatcher } from '../utils/fuzzy.js';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

type ModalMode =
  | 'none'
  | 'context'
  | 'project'
  | 'workload-details'
  | 'logs'
  | 'terminal'
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
  | 'helm'
  | 'help';

interface ModalStackEntry {
  mode: ModalMode;
  item: ResourceItem | null;
}

export const App: React.FC = () => {
  // Context & Project State
  const [contexts, setContexts] = useState<KubeContext[]>([]);
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
  const [loading, setLoading] = useState<boolean>(true);
  const [statusNotification, setStatusNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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

  // Load Kubeconfig contexts and active project
  const loadKubeInfo = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      if (!api) return;

      const res = await api.getContexts();
      const ctxList = res?.contexts || [];
      const currCtx = res?.currentContext || null;
      setContexts(ctxList);
      setCurrentContext(currCtx);

      const info = await api.getClusterInfo();
      setClusterInfo(info);

      const projList = await api.getProjects();
      setProjects(projList || []);
    } catch (e) {
      console.error('Error in loadKubeInfo:', e);
    }
  }, []);

  // Fetch resources for active kind and project
  const fetchResources = useCallback(
    async (isBackground = false) => {
      if (currentKind === 'topology') return;
      const api = (window as any).electronAPI;
      if (!api) return;

      if (!isBackground) setLoading(true);
      try {
        const res = await api.getResources(currentKind, currentProject);
        if (res && res.items) {
          setResources(res.items);
          setCounts((prev) => ({ ...prev, [currentKind]: res.items.length }));
          setFetchError(res.error || null);
          setIsUnauthorized(!!res.isUnauthorized);
        } else if (Array.isArray(res)) {
          setResources(res);
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
    if (currentKind !== 'topology') {
      fetchResources(false);
    }
  }, [fetchResources, currentKind]);

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

    // Filter by search query
    if (query.trim()) {
      const matcher = new FuzzyMatcher(items, ['name', 'status', 'namespace', 'ip', 'node', 'age', 'extra.message', 'extra.reason', 'extra.volume', 'extra.capacity', 'extra.group']);
      items = matcher.search(query);
    }

    return items;
  }, [resources, statusFilter, query, currentKind]);

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

  // Handle Switch Context
  const handleSwitchContext = async (contextName: string) => {
    closeModal();
    const api = (window as any).electronAPI;
    const ok = await api.switchContext(contextName);
    if (ok) {
      showToast(`Switched context to ${contextName}`);
      setCurrentContext(contextName);
      loadKubeInfo();
      fetchResources(false);
    } else {
      showToast(`Failed to switch context to ${contextName}`, 'error');
    }
  };

  // Handle Switch Project
  const handleSwitchProject = async (projectName: string) => {
    closeModal();
    const api = (window as any).electronAPI;
    const ok = await api.switchProject(projectName);
    if (ok) {
      setCurrentProject(projectName);
      showToast(projectName === 'all-projects' ? 'Switched to All Projects' : `Switched to project ${projectName}`);
      fetchResources(false);
    } else {
      showToast(`Failed to switch project to ${projectName}`, 'error');
    }
  };

  // Action Dispatcher with Modal Stack preservation
  const handleAction = (actionType: string, targetItem?: ResourceItem) => {
    const item = targetItem || selectedItem;
    if (!item && actionType !== 'help') return;

    switch (actionType) {
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
      else if (e.key === '?') openModal('help');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalMode, loadKubeInfo]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Bar with traffic lights & cluster context */}
      <TopNav
        currentContext={currentContext}
        currentProject={currentProject}
        clusterServer={clusterInfo?.server || ''}
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
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0b0f19]">
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
              onSelectWorkload={(item) => openModal('workload-details', item)}
              onOpenWorkloadLogs={(item) => openModal('logs', item)}
              onOpenWorkloadYaml={(item) => openModal('edit-yaml', item)}
              onOpenWorkloadScale={(item) => openModal('scale', item)}
              onOpenPvcResize={(item) => openModal('resize-pvc', item)}
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
                availableStatuses={availableStatuses}
                currentKind={currentKind}
                selectedItem={selectedItem}
                onAction={handleAction}
                onClearCompletedFailed={handleClearCompletedFailedPods}
                clearablePodsCount={clearablePodsCount}
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
              />
            </>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MODAL WINDOWS WITH FULL STACK BACK-NAVIGATION                             */}
      {/* ========================================================================= */}

      {/* Context Switcher Modal */}
      {modalMode === 'context' && (
        <ContextModal
          mode="context"
          contexts={contexts}
          projects={projects}
          currentContext={currentContext}
          currentProject={currentProject}
          onSelectContext={handleSwitchContext}
          onSelectProject={() => {}}
          onClose={closeModal}
        />
      )}

      {/* Project Switcher Modal */}
      {modalMode === 'project' && (
        <ContextModal
          mode="project"
          contexts={contexts}
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
            fetchResources(false);
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
            fetchResources(false);
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
            fetchResources(false);
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
          onRefresh={() => fetchResources(false)}
        />
      )}

      {/* Helm Release Manager Modal (Values Edit & Upgrade) */}
      {modalMode === 'helm' && selectedItem && (
        <HelmModal
          release={selectedItem}
          namespace={selectedItem.namespace || currentProject}
          onClose={closeModal}
          onRefresh={() => fetchResources(false)}
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
            fetchResources(false);
          }}
          onError={(msg) => {
            closeModal();
            showToast(msg, 'error');
          }}
        />
      )}
    </div>
  );
};
