import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TopNav } from './components/TopNav.js';
import { Sidebar } from './components/Sidebar.js';
import { SearchBar } from './components/SearchBar.js';
import { ResourceTable } from './components/ResourceTable.js';
import { ContextModal } from './components/ContextModal.js';
import { LogViewer } from './components/LogViewer.js';
import { YamlModal } from './components/YamlModal.js';
import { ImageStreamModal } from './components/ImageStreamModal.js';
import { HelmModal } from './components/HelmModal.js';
import { ActionDialog } from './components/ActionDialog.js';
import { ResourceKind, ResourceItem, KubeContext, ProjectInfo, ImageStreamResource } from '../types/k8s.js';
import { FuzzyMatcher } from '../utils/fuzzy.js';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export const App: React.FC = () => {
  // Context & Project State
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [currentContext, setCurrentContext] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [currentProject, setCurrentProject] = useState<string>('default');
  const [clusterInfo, setClusterInfo] = useState<any>(null);
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Resource State
  const [currentKind, setCurrentKind] = useState<ResourceKind>('pods');
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [counts, setCounts] = useState<Partial<Record<ResourceKind, number>>>({});
  const [selectedItem, setSelectedItem] = useState<ResourceItem | null>(null);
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [statusNotification, setStatusNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modal State
  const [modalMode, setModalMode] = useState<
    'none' | 'context' | 'project' | 'logs' | 'yaml' | 'describe' | 'scale' | 'restart' | 'delete' | 'clean-is' | 'helm' | 'help'
  >('none');

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

      const ns = await api.getCurrentNamespace();
      setCurrentProject(ns || 'default');

      const info = await api.getClusterInfo();
      setClusterInfo(info);

      const projList = await api.getProjects();
      setProjects(projList || []);
    } catch (e) {
      console.error('Error loading kube info:', e);
    }
  }, []);

  // Fetch resources for active kind and project
  const fetchResources = useCallback(
    async (isBackground = false) => {
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
    fetchResources(false);
  }, [fetchResources]);

  // Auto-polling interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchResources(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchResources]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return resources;
    const matcher = new FuzzyMatcher(resources, ['name', 'status', 'namespace', 'age']);
    return matcher.search(query);
  }, [resources, query]);

  // Handle Switch Context
  const handleSwitchContext = async (contextName: string) => {
    setModalMode('none');
    const api = (window as any).electronAPI;
    const ok = await api.switchContext(contextName);
    if (ok) {
      showToast(`Switched context to ${contextName}`);
      await loadKubeInfo();
      fetchResources(false);
    } else {
      showToast(`Failed to switch context`, 'error');
    }
  };

  // Handle Switch Project
  const handleSwitchProject = async (projectName: string) => {
    setModalMode('none');
    const api = (window as any).electronAPI;
    const ok = await api.switchProject(projectName);
    if (ok) {
      showToast(`Switched project to ${projectName}`);
      setCurrentProject(projectName);
      fetchResources(false);
    } else {
      showToast(`Failed to switch project`, 'error');
    }
  };

  // Action Dispatcher
  const handleAction = (actionType: string, targetItem?: ResourceItem) => {
    const item = targetItem || selectedItem;
    if (!item && actionType !== 'help') return;

    if (item) setSelectedItem(item);

    switch (actionType) {
      case 'logs':
        setModalMode('logs');
        break;
      case 'scale':
        setModalMode('scale');
        break;
      case 'restart':
        setModalMode('restart');
        break;
      case 'clean-is':
        setModalMode('clean-is');
        break;
      case 'helm-values':
      case 'yaml':
        setModalMode('yaml');
        break;
      case 'describe':
        setModalMode('describe');
        break;
      case 'helm-manage':
      case 'helm-history':
        setModalMode('helm');
        break;
      case 'delete':
        setModalMode('delete');
        break;
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalMode !== 'none' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') setModalMode('none');
        return;
      }

      if (e.key === 'c') {
        e.preventDefault();
        loadKubeInfo();
        setModalMode('context');
      } else if (e.key === 'p') {
        e.preventDefault();
        loadKubeInfo();
        setModalMode('project');
      } else if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      } else if (e.key === '1') setCurrentKind('pods');
      else if (e.key === '2') setCurrentKind('deployments');
      else if (e.key === '3') setCurrentKind('statefulsets');
      else if (e.key === '4') setCurrentKind('routes');
      else if (e.key === '5') setCurrentKind('services');
      else if (e.key === '6') setCurrentKind('imagestreams');
      else if (e.key === '7') setCurrentKind('helm');
      else if (e.key === '8') setCurrentKind('configmaps');
      else if (e.key === '9') setCurrentKind('secrets');
      else if (e.key === '0') setCurrentKind('nodes');
      else if (e.key === '?' || e.key === 'h') setModalMode('help');
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
        loading={loading}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((prev) => !prev)}
        onRefresh={() => fetchResources(false)}
        onOpenContextModal={() => {
          loadKubeInfo();
          setModalMode('context');
        }}
        onOpenProjectModal={() => {
          loadKubeInfo();
          setModalMode('project');
        }}
      />

      {/* Main Layout (Sidebar + Content) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          currentKind={currentKind}
          onSelectKind={(kind) => setCurrentKind(kind)}
          counts={counts}
          onOpenHelp={() => setModalMode('help')}
        />

        {/* Center Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0b0f19]">
          {/* Toast Notification Banner */}
          {statusNotification && (
            <div
              className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b ${
                statusNotification.type === 'error'
                  ? 'bg-rose-950/90 text-rose-200 border-rose-800'
                  : 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusNotification.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                <span>{statusNotification.text}</span>
              </div>
            </div>
          )}

          {/* Autocomplete Search & Action Bar */}
          <SearchBar
            query={query}
            onChangeQuery={setQuery}
            currentKind={currentKind}
            selectedItem={selectedItem}
            onAction={handleAction}
          />

          {/* Resource Table */}
          <ResourceTable
            kind={currentKind}
            items={filteredItems}
            selectedItem={selectedItem}
            onSelectItem={(item) => setSelectedItem(item)}
            loading={loading}
            error={fetchError}
            isUnauthorized={isUnauthorized}
            onRowAction={(action, item) => handleAction(action, item)}
            onOpenContextModal={() => {
              loadKubeInfo();
              setModalMode('context');
            }}
            onRetry={() => fetchResources(false)}
          />
        </main>
      </div>

      {/* Modals & Dialog Windows */}

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
          onClose={() => setModalMode('none')}
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
          onClose={() => setModalMode('none')}
        />
      )}

      {/* Live Log Streamer Modal */}
      {modalMode === 'logs' && selectedItem && (
        <LogViewer
          item={selectedItem}
          namespace={currentProject}
          onClose={() => setModalMode('none')}
        />
      )}

      {/* YAML / Describe Modal */}
      {(modalMode === 'yaml' || modalMode === 'describe') && selectedItem && (
        <YamlModal
          mode={modalMode}
          item={selectedItem}
          namespace={currentProject}
          onClose={() => setModalMode('none')}
        />
      )}

      {/* ImageStream SemVer Tag Manager & Cleanup Wizard Modal */}
      {modalMode === 'clean-is' && selectedItem && (
        <ImageStreamModal
          imageStream={selectedItem as ImageStreamResource}
          namespace={currentProject}
          onClose={() => setModalMode('none')}
          onRefresh={() => fetchResources(false)}
        />
      )}

      {/* Helm Release Manager Modal */}
      {modalMode === 'helm' && selectedItem && (
        <HelmModal
          release={selectedItem}
          namespace={currentProject}
          onClose={() => setModalMode('none')}
          onRefresh={() => fetchResources(false)}
        />
      )}

      {/* Workload Action Dialogs (Scale, Restart, Delete) */}
      {(modalMode === 'scale' || modalMode === 'restart' || modalMode === 'delete') && selectedItem && (
        <ActionDialog
          mode={modalMode}
          item={selectedItem}
          namespace={currentProject}
          onClose={() => setModalMode('none')}
          onSuccess={(msg) => {
            setModalMode('none');
            showToast(msg, 'success');
            fetchResources(false);
          }}
          onError={(msg) => {
            setModalMode('none');
            showToast(msg, 'error');
          }}
        />
      )}
    </div>
  );
};
