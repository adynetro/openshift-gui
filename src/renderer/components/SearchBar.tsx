import React from 'react';
import {
  Search,
  X,
  Zap,
  Terminal,
  Sparkles,
  RefreshCw,
  FileText,
  Code2,
  Trash2,
  Filter,
  Eraser,
  Anchor,
  Workflow,
  SquareTerminal,
  ScrollText,
  Bug,
  Flame,
  Tag,
} from 'lucide-react';
import { ResourceKind, ResourceItem } from '../../types/k8s.js';

interface SearchBarProps {
  query: string;
  onChangeQuery: (val: string) => void;
  statusFilter: string;
  onChangeStatusFilter: (status: string) => void;
  tagCountFilter?: string;
  onChangeTagCountFilter?: (filter: string) => void;
  availableStatuses: string[];
  currentKind: ResourceKind;
  currentProject?: string;
  selectedItem: ResourceItem | null;
  onAction: (actionType: string) => void;
  onClearCompletedFailed?: () => void;
  clearablePodsCount?: number;
  selectedPodCount?: number;
  onDeleteSelectedPods?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onChangeQuery,
  statusFilter,
  onChangeStatusFilter,
  tagCountFilter = 'ALL',
  onChangeTagCountFilter,
  availableStatuses,
  currentKind,
  currentProject,
  selectedItem,
  onAction,
  onClearCompletedFailed,
  clearablePodsCount = 0,
  selectedPodCount = 0,
  onDeleteSelectedPods,
}) => {
  const isAllProjects = !currentProject || currentProject === 'all-projects' || currentProject === '__all__';

  // Contextual action pills based on current resource tab
  const getActionPills = () => {
    // Workloads have all actions in their dedicated popup modal on name click
    if (
      currentKind === 'events' ||
      currentKind === 'deployments' ||
      currentKind === 'deploymentconfigs' ||
      currentKind === 'statefulsets' ||
      currentKind === 'daemonsets'
    ) {
      return [];
    }
    const pills: { id: string; label: string; tooltip: string; icon: any; color: string; disabled?: boolean }[] = [];

    // Pod Actions in Top Toolbar when selected
    if (currentKind === 'pods') {
      pills.push({
        id: 'terminal',
        label: 'Terminal',
        tooltip: 'Open Interactive Pod Shell Terminal',
        icon: SquareTerminal,
        color: 'hover:border-cyan-500 hover:text-cyan-300 hover:bg-cyan-950/40 text-cyan-400 border-cyan-900/50 bg-cyan-950/20',
        disabled: !selectedItem,
      });
      pills.push({
        id: 'logs',
        label: 'Logs',
        tooltip: 'Stream Live Pod Logs',
        icon: ScrollText,
        color: 'hover:border-emerald-500 hover:text-emerald-300 hover:bg-emerald-950/40 text-emerald-400 border-emerald-900/50 bg-emerald-950/20',
        disabled: !selectedItem,
      });
      pills.push({
        id: 'debug-pod',
        label: 'Debug Pod',
        tooltip: 'Debug Pod (Failure Diagnostics & oc debug container replica)',
        icon: Bug,
        color: 'hover:border-purple-500 hover:text-purple-300 hover:bg-purple-950/40 text-purple-400 border-purple-900/50 bg-purple-950/20',
        disabled: !selectedItem,
      });
    }

    if (currentKind === 'networkpolicies') {
      pills.push({
        id: 'netpol-designer',
        label: selectedItem ? 'Visual Designer' : '+ Create NetPol',
        tooltip: 'Open Interactive Visual NetworkPolicy Designer & Editor',
        icon: Workflow,
        color: 'hover:border-cyan-500 hover:text-cyan-300 hover:bg-cyan-950/40 text-cyan-400 border-cyan-900/50 bg-cyan-950/20',
        disabled: false,
      });
    }

    if (currentKind === 'imagestreams') {
      pills.push({
        id: 'clean-is',
        label: 'Tag Manager & Clean',
        tooltip: 'Open ImageStream Tag Manager & SemVer/Generation Cleanup Planner',
        icon: Sparkles,
        color: 'hover:border-purple-500 hover:text-purple-300 hover:bg-purple-950/40 text-purple-400 border-purple-900/50 bg-purple-950/20',
        disabled: !selectedItem,
      });
      pills.push({
        id: 'prune-image-blobs',
        label: 'Prune Registry Blobs',
        tooltip: 'Open OpenShift Image & Blob Pruner (oc adm prune images)',
        icon: Flame,
        color: 'hover:border-rose-500 hover:text-rose-300 hover:bg-rose-950/40 text-rose-400 border-rose-900/50 bg-rose-950/20',
        disabled: false,
      });
    }

    if (currentKind === 'helm') {
      pills.push({
        id: 'helm-manage',
        label: 'Values',
        tooltip: 'Edit Values & Upgrade Release',
        icon: Anchor,
        color: 'hover:border-blue-500 hover:text-blue-300 hover:bg-blue-950/40 text-blue-400 border-blue-900/50 bg-blue-950/20',
        disabled: !selectedItem,
      });
      pills.push({
        id: 'helm-history',
        label: 'History',
        tooltip: 'View History & Rollback',
        icon: RefreshCw,
        color: 'hover:border-cyan-500 hover:text-cyan-300 hover:bg-cyan-950/40 text-cyan-400 border-cyan-900/50 bg-cyan-950/20',
        disabled: !selectedItem,
      });
    }

    if (currentKind !== 'helm') {
      pills.push({
        id: 'describe',
        label: 'Describe',
        tooltip: 'Describe Resource Details',
        icon: FileText,
        color: 'hover:border-slate-500 hover:text-slate-200 hover:bg-slate-800 text-slate-300 border-slate-700 bg-slate-800/40',
        disabled: !selectedItem,
      });

      pills.push({
        id: 'yaml',
        label: 'YAML',
        tooltip: 'View & Edit YAML Definition',
        icon: Code2,
        color: 'hover:border-emerald-500 hover:text-emerald-300 hover:bg-slate-800 text-slate-300 border-slate-700 bg-slate-800/40',
        disabled: !selectedItem,
      });
    }

    pills.push({
      id: 'delete',
      label: 'Delete',
      tooltip: 'Delete Selected Resource',
      icon: Trash2,
      color: 'hover:border-red-500 hover:text-red-300 hover:bg-red-950/40 text-red-400 border-red-900/50 bg-red-950/20',
      disabled: !selectedItem,
    });

    return pills;
  };

  const actionPills = getActionPills();

  return (
    <div
      className="p-3 border-b space-y-2.5 transition-colors duration-150"
      style={{
        backgroundColor: 'var(--bg-header, #0f172a)',
        borderColor: 'var(--border-color, #1e293b)',
        color: 'var(--text-main, #f8fafc)',
      }}
    >
      {/* Search Input Box + Status Filter + Clear Completed Pods */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none opacity-50">
            <Search size={15} />
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder={`Filter ${currentKind === 'events' ? 'events by message, reason, object' : currentKind} by name, IP, node, labels (press '/' to focus)...`}
            className="w-full pl-9 pr-8 py-1.5 border rounded-lg text-xs placeholder-slate-500 shadow-inner transition-colors font-mono"
            style={{
              backgroundColor: 'var(--bg-input, #0f172a)',
              borderColor: 'var(--border-subtle, #334155)',
              color: 'var(--text-main, #f8fafc)',
            }}
          />

          {query && (
            <button
              onClick={() => onChangeQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Filter Dropdown */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs"
          style={{
            backgroundColor: 'var(--bg-input, #0f172a)',
            borderColor: 'var(--border-subtle, #334155)',
          }}
        >
          <Filter size={13} className="opacity-50" />
          <span className="text-[11px] font-semibold opacity-70">{currentKind === 'events' ? 'Event Type:' : 'Status:'}</span>
          <select
            value={statusFilter}
            onChange={(e) => onChangeStatusFilter(e.target.value)}
            className="bg-transparent text-xs font-mono outline-none cursor-pointer"
            style={{ color: 'var(--text-main, #f8fafc)' }}
          >
            <option value="ALL" className="bg-slate-900 text-slate-200">
              {currentKind === 'events' ? 'All Events' : 'All Statuses'}
            </option>
            {currentKind === 'events' && (
              <>
                <option value="Warning" className="bg-slate-900 text-rose-300">
                  ⚠️ Warnings Only
                </option>
                <option value="Normal" className="bg-slate-900 text-emerald-300">
                  ✓ Normal Only
                </option>
              </>
            )}
            {currentKind !== 'events' && availableStatuses.map((st) => (
              <option key={st} value={st} className="bg-slate-900 text-slate-200">
                {st}
              </option>
            ))}
          </select>
          {statusFilter !== 'ALL' && (
            <button
              onClick={() => onChangeStatusFilter('ALL')}
              className="text-slate-400 hover:text-white"
              title="Reset status filter"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Tag Count Filter (on ImageStreams tab) */}
        {currentKind === 'imagestreams' && onChangeTagCountFilter && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs"
            style={{
              backgroundColor: 'var(--bg-input, #0f172a)',
              borderColor: 'var(--border-subtle, #334155)',
            }}
          >
            <Tag size={13} className="text-purple-400" />
            <span className="text-[11px] font-semibold opacity-70">Tag Count:</span>
            <select
              value={tagCountFilter}
              onChange={(e) => onChangeTagCountFilter(e.target.value)}
              className="bg-transparent text-xs font-mono outline-none cursor-pointer"
              style={{ color: 'var(--text-main, #f8fafc)' }}
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">All Tag Counts</option>
              <option value="gte1" className="bg-slate-900 text-emerald-300">≥ 1 Tag (Active)</option>
              <option value="gte5" className="bg-slate-900 text-cyan-300">≥ 5 Tags</option>
              <option value="gte10" className="bg-slate-900 text-purple-300">≥ 10 Tags (Heavy)</option>
              <option value="gte20" className="bg-slate-900 text-amber-300">≥ 20 Tags (Bloated)</option>
              <option value="gte50" className="bg-slate-900 text-rose-300">≥ 50 Tags (Critical)</option>
              <option value="empty" className="bg-slate-900 text-slate-400">0 Tags (Empty)</option>
            </select>
            {tagCountFilter !== 'ALL' && (
              <button
                onClick={() => onChangeTagCountFilter('ALL')}
                className="text-slate-400 hover:text-white"
                title="Reset tag count filter"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Quick Prune Registry Blobs Button (on ImageStreams tab) */}
        {currentKind === 'imagestreams' && (
          <button
            onClick={() => onAction('prune-image-blobs')}
            className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-xs font-bold flex items-center gap-1.5 transition-all shadow shadow-rose-950"
            title="Open OpenShift Registry Image and Blob Pruner (oc adm prune images)"
          >
            <Flame size={13} className="text-rose-400" />
            <span>Prune Registry Blobs</span>
          </button>
        )}

        {/* Clear Completed & Failed Pods Button (on Pods tab) */}
        {currentKind === 'pods' && onClearCompletedFailed && (
          <button
            onClick={onClearCompletedFailed}
            className="px-3 py-1.5 rounded-lg bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/80 text-xs font-bold flex items-center gap-1.5 transition-all shadow shadow-amber-950"
            title={isAllProjects ? "Clean all completed, error, and failed pods across all projects" : "Clean all completed, error, and failed pods in this project"}
          >
            <Eraser size={13} />
            <span>Clear Completed & Failed {clearablePodsCount > 0 ? `(${clearablePodsCount})` : ''}</span>
          </button>
        )}

        {/* Batch Delete Selected Pods Button (visible when pods are checked in a specific project) */}
        {currentKind === 'pods' && !isAllProjects && selectedPodCount > 0 && onDeleteSelectedPods && (
          <button
            onClick={onDeleteSelectedPods}
            className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-500/60 text-xs font-bold flex items-center gap-1.5 transition-all shadow shadow-rose-950 animate-in fade-in duration-200"
            title={`Delete ${selectedPodCount} selected pod(s)`}
          >
            <Trash2 size={13} />
            <span>Delete Selected ({selectedPodCount})</span>
          </button>
        )}

        {/* Selected resource indicator */}
        {selectedItem ? (
          <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="truncate max-w-[180px]">{selectedItem.name}</span>
          </div>
        ) : (
          <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/40 border border-slate-800 text-[11px] font-mono text-slate-500">
            Click a row to select
          </div>
        )}
      </div>

      {/* Clean Compact Action Buttons */}
      {actionPills.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
            <Zap size={11} className="text-amber-400" /> Actions:
          </span>

          {actionPills.map((pill) => {
            const Icon = pill.icon;
            return (
              <button
                key={pill.id}
                onClick={() => onAction(pill.id)}
                disabled={pill.disabled}
                title={pill.tooltip}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${pill.color}`}
              >
                <Icon size={13} />
                <span>{pill.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
