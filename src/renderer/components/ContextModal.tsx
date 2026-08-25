import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Search,
  Layers,
  FolderGit2,
  CheckCircle2,
  Server,
  User,
  ArrowRight,
  Globe,
  Trash2,
  Flame,
  ShieldAlert,
  Sparkles,
  AlertTriangle,
  CheckSquare,
  Square,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { KubeContext, ProjectInfo } from '../../types/k8s.js';
import { FuzzyMatcher } from '../../utils/fuzzy.js';

interface ContextModalProps {
  mode: 'context' | 'project';
  contexts: KubeContext[];
  projects: ProjectInfo[];
  currentContext: string | null;
  currentProject: string;
  onSelectContext: (name: string) => void;
  onSelectProject: (name: string) => void;
  onRefreshContexts?: () => void;
  onClose: () => void;
}

export const ContextModal: React.FC<ContextModalProps> = ({
  mode,
  contexts,
  projects,
  currentContext,
  currentProject,
  onSelectContext,
  onSelectProject,
  onRefreshContexts,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'switch' | 'clean'>('switch');
  const [query, setQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedToDelete, setSelectedToDelete] = useState<string[]>([]);
  const [pruneDangling, setPruneDangling] = useState<boolean>(true);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const items = useMemo(() => {
    if (mode === 'context') {
      if (!query.trim()) return contexts;
      const matcher = new FuzzyMatcher(contexts, ['name', 'cluster', 'user']);
      return matcher.search(query);
    } else {
      if (!query.trim()) return projects;
      const matcher = new FuzzyMatcher(projects, ['name', 'displayName']);
      return matcher.search(query);
    }
  }, [mode, contexts, projects, query]);

  // Reset selected index when query or filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  const selectItem = (item: any) => {
    if (!item) return;
    if (viewMode === 'clean' && mode === 'context') {
      // Toggle selection for deletion if not current context
      if (item.name !== currentContext) {
        toggleSelectContext(item.name);
      }
      return;
    }
    if (mode === 'context') onSelectContext(item.name);
    else onSelectProject(item.name);
  };

  const toggleSelectContext = (name: string) => {
    if (name === currentContext) return;
    setSelectedToDelete((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const handleSelectAllInactive = () => {
    const inactiveNames = contexts.filter((c) => c.name !== currentContext).map((c) => c.name);
    if (selectedToDelete.length === inactiveNames.length) {
      setSelectedToDelete([]);
    } else {
      setSelectedToDelete(inactiveNames);
    }
  };

  // Keep Active Context Only (Prunes all other stale contexts & unused clusters/users)
  const handleKeepActiveOnly = async () => {
    if (!currentContext) {
      setStatusMessage({ text: 'No active context is currently set to retain.', type: 'error' });
      return;
    }

    const inactiveCount = contexts.length - 1;
    if (inactiveCount <= 0) {
      setStatusMessage({ text: 'Only the active context exists. No stale contexts to clean.', type: 'info' });
      return;
    }

    const confirmMsg = `⚠️ Clean Kubeconfig Contexts:\n\nThis will permanently delete ${inactiveCount} inactive context(s) and prune orphaned clusters & user credentials.\n\nOnly active context '${currentContext}' will be preserved.\n\nAn automatic backup will be created in ~/.kube/config.bak-*\n\nProceed with cleanup?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsCleaning(true);
      setStatusMessage({ text: 'Cleaning stale contexts and pruning orphaned clusters...', type: 'info' });

      const res = await (window as any).electronAPI.cleanContexts({
        keepActiveOnly: true,
        pruneDangling,
      });

      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setSelectedToDelete([]);
        if (onRefreshContexts) onRefreshContexts();
      } else {
        setStatusMessage({ text: res.message || 'Context cleanup failed.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error executing cleanup.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  // Delete Selected Contexts
  const handleDeleteSelected = async () => {
    if (selectedToDelete.length === 0) return;

    const confirmMsg = `⚠️ Delete ${selectedToDelete.length} selected context(s) from kubeconfig?\n\nContexts:\n• ${selectedToDelete.join('\n• ')}\n\nProceed with deletion?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsCleaning(true);
      setStatusMessage({ text: `Deleting ${selectedToDelete.length} context(s)...`, type: 'info' });

      const res = await (window as any).electronAPI.cleanContexts({
        contextNamesToDelete: selectedToDelete,
        pruneDangling,
      });

      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setSelectedToDelete([]);
        if (onRefreshContexts) onRefreshContexts();
      } else {
        setStatusMessage({ text: res.message || 'Context deletion failed.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error executing deletion.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  // Delete Single Context
  const handleDeleteSingle = async (e: React.MouseEvent, contextName: string) => {
    e.stopPropagation();
    if (contextName === currentContext) return;

    const confirmMsg = `Delete context '${contextName}' from kubeconfig?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsCleaning(true);
      const res = await (window as any).electronAPI.deleteContext(contextName, pruneDangling);
      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setSelectedToDelete((prev) => prev.filter((n) => n !== contextName));
        if (onRefreshContexts) onRefreshContexts();
      } else {
        setStatusMessage({ text: res.message || 'Failed to delete context.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error deleting context.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectItem(items[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const title =
    mode === 'context'
      ? viewMode === 'clean'
        ? 'Clean & Prune Kubernetes Contexts'
        : 'Switch Kubernetes / OpenShift Context'
      : 'Switch Project / Namespace';
  const Icon = mode === 'context' ? (viewMode === 'clean' ? Flame : Layers) : FolderGit2;

  const inactiveCount = contexts.filter((c) => c.name !== currentContext).length;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-color, #334155)',
          color: 'var(--text-main, #f8fafc)',
        }}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                viewMode === 'clean'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
              }`}
            >
              <Icon size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{title}</span>
                {mode === 'context' && viewMode === 'clean' && (
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-mono">
                    Cleanup Mode
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {mode === 'context'
                  ? `Total Contexts: ${contexts.length} • Active: ${currentContext || 'None'}`
                  : `Available Projects: ${projects.length}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Switch / Clean mode for Contexts */}
            {mode === 'context' && (
              <div className="flex items-center rounded-lg bg-slate-900 border border-slate-700 p-0.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setViewMode('switch')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'switch'
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers size={12} />
                  <span>Switch</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('clean')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'clean'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Trash2 size={12} />
                  <span>Clean ({inactiveCount})</span>
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close window (Esc)"
              aria-label="Close window"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Alert Message */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b shrink-0 ${
              statusMessage.type === 'error'
                ? 'bg-rose-950/80 text-rose-200 border-rose-800'
                : statusMessage.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-200 border-emerald-800'
                : 'bg-blue-950/80 text-blue-200 border-blue-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'error' ? (
                <AlertTriangle size={14} />
              ) : statusMessage.type === 'success' ? (
                <CheckCircle2 size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ×
            </button>
          </div>
        )}

        {/* Clean Contexts Action Toolbar (Shown in 'clean' mode) */}
        {mode === 'context' && viewMode === 'clean' && (
          <div
            className="p-3 border-b space-y-2 shrink-0"
            style={{
              backgroundColor: 'rgba(244, 63, 94, 0.05)',
              borderColor: 'var(--border-color, #334155)',
            }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              {/* Option 1: Keep Active Context Only */}
              <button
                type="button"
                onClick={handleKeepActiveOnly}
                disabled={isCleaning || inactiveCount === 0}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer ${
                  inactiveCount > 0
                    ? 'bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
                title="Deletes all stale inactive contexts and keeps only current active context"
              >
                <Flame size={14} className="text-yellow-300" />
                <span>Keep Active Context Only ({inactiveCount} stale to remove)</span>
              </button>

              {/* Option 2: Delete Selected Button */}
              {selectedToDelete.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isCleaning}
                  className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete Selected ({selectedToDelete.length})</span>
                </button>
              )}
            </div>

            {/* Options Bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAllInactive}
                  className="hover:text-cyan-300 text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  {selectedToDelete.length === inactiveCount && inactiveCount > 0 ? (
                    <CheckSquare size={13} className="text-cyan-400" />
                  ) : (
                    <Square size={13} />
                  )}
                  <span>
                    {selectedToDelete.length === inactiveCount && inactiveCount > 0
                      ? 'Deselect All'
                      : 'Select All Inactive'}
                  </span>
                </button>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={pruneDangling}
                    onChange={(e) => setPruneDangling(e.target.checked)}
                    className="rounded border-slate-700 text-rose-500 focus:ring-0"
                  />
                  <span>Prune Orphaned Clusters & Users</span>
                </label>
              </div>

              <span className="text-[10px] text-slate-500">
                Safe: Auto-backup created in ~/.kube/config.bak-*
              </span>
            </div>
          </div>
        )}

        {/* Autocomplete Search Input with Keyboard Navigation */}
        <div
          className="p-3 border-b shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
          }}
        >
          <div className="relative">
            <Search size={16} className="absolute inset-y-0 left-3 my-auto text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                viewMode === 'clean'
                  ? 'Filter contexts to clean...'
                  : `Search and filter ${mode}s... (use ↑ / ↓ arrows and ↵ Enter)`
              }
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-xs placeholder-slate-500 shadow-inner focus:outline-none font-mono"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
                color: 'var(--text-main, #f8fafc)',
              }}
            />
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-auto p-3 space-y-1.5 divide-y divide-slate-800/40 font-sans">
          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No matching {mode}s found.</div>
          ) : (
            items.map((item: any, idx: number) => {
              const isCurrent =
                mode === 'context'
                  ? item.name === currentContext
                  : item.name === currentProject ||
                    (item.name === 'all-projects' && (!currentProject || currentProject === 'all-projects'));
              const isAllProjects = mode === 'project' && item.name === 'all-projects';
              const isHighlighted = idx === selectedIndex && viewMode === 'switch';
              const isChecked = selectedToDelete.includes(item.name);

              return (
                <div
                  key={item.name}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-all cursor-pointer group ${
                    viewMode === 'clean' && isChecked
                      ? 'bg-rose-950/40 border border-rose-500/60 shadow-sm'
                      : isHighlighted
                      ? 'bg-cyan-950/70 border-2 border-cyan-400 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400'
                      : isCurrent
                      ? 'bg-cyan-950/40 border border-cyan-500/50 shadow-sm'
                      : isAllProjects
                      ? 'bg-purple-950/20 hover:bg-purple-950/40 border border-purple-900/40'
                      : 'hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox in clean mode */}
                    {mode === 'context' && viewMode === 'clean' && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectContext(item.name);
                        }}
                        className="p-1 cursor-pointer"
                      >
                        {isCurrent ? (
                          <div title="Current active context is protected">
                            <Shield size={16} className="text-amber-400" />
                          </div>
                        ) : isChecked ? (
                          <CheckSquare size={16} className="text-rose-400" />
                        ) : (
                          <Square size={16} className="text-slate-500 hover:text-slate-300" />
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {isAllProjects && <Globe size={15} className="text-purple-400 shrink-0" />}
                        <span
                          className={`font-mono text-sm font-semibold transition-colors ${
                            isCurrent
                              ? 'text-cyan-300 font-bold'
                              : isHighlighted
                              ? 'text-cyan-300 font-bold'
                              : isAllProjects
                              ? 'text-purple-300 group-hover:text-purple-200'
                              : 'text-white group-hover:text-cyan-300'
                          }`}
                        >
                          {item.displayName || item.name}
                        </span>
                        {isAllProjects && (
                          <span className="px-2 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-mono">
                            Cluster-Wide
                          </span>
                        )}
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold flex items-center gap-1 font-mono">
                            <CheckCircle2 size={10} /> Active (Keep)
                          </span>
                        )}
                      </div>

                      {mode === 'context' ? (
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                          {item.cluster && (
                            <span className="flex items-center gap-1">
                              <Server size={11} className="text-slate-500" />
                              <span className="truncate max-w-[220px]">{item.cluster}</span>
                            </span>
                          )}
                          {item.user && (
                            <span className="flex items-center gap-1">
                              <User size={11} className="text-slate-500" />
                              <span className="truncate max-w-[160px]">{item.user}</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 font-mono">
                          {isAllProjects ? (
                            <span className="text-purple-400">View all resources across all namespaces</span>
                          ) : (
                            <>
                              Status: <span className="text-emerald-400">{item.status || 'Active'}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side actions */}
                  <div className="flex items-center gap-2">
                    {mode === 'context' && viewMode === 'clean' ? (
                      !isCurrent && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSingle(e, item.name)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title={`Delete context '${item.name}'`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )
                    ) : (
                      <>
                        {isHighlighted && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950 text-[10px] font-bold font-mono">
                            ↵ Enter
                          </span>
                        )}
                        <div
                          className={`transition-colors ${
                            isHighlighted ? 'text-cyan-300' : 'text-slate-500 group-hover:text-cyan-400'
                          }`}
                        >
                          <ArrowRight size={16} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono shrink-0">
          <div className="flex items-center gap-2">
            <span>
              Use <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">↑</kbd>{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">↓</kbd> to
              navigate
            </span>
            <span>•</span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">↵ Enter</kbd>{' '}
              to select
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
