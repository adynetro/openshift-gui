import React from 'react';
import { Search, X, Zap, Terminal, Sparkles, RefreshCw, SlidersHorizontal, FileText, Code2, Trash2 } from 'lucide-react';
import { ResourceKind, ResourceItem } from '../../types/k8s.js';

interface SearchBarProps {
  query: string;
  onChangeQuery: (val: string) => void;
  currentKind: ResourceKind;
  selectedItem: ResourceItem | null;
  onAction: (actionType: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onChangeQuery,
  currentKind,
  selectedItem,
  onAction,
}) => {
  // Contextual action pills based on current resource tab
  const getActionPills = () => {
    const pills: { id: string; label: string; icon: any; color: string; disabled?: boolean }[] = [];

    if (currentKind === 'pods' || currentKind === 'deployments') {
      pills.push({
        id: 'logs',
        label: 'Live Logs',
        icon: Terminal,
        color: 'hover:border-emerald-500 hover:text-emerald-300 hover:bg-emerald-950/40 text-emerald-400 border-emerald-900/50 bg-emerald-950/20',
        disabled: !selectedItem,
      });
    }

    if (currentKind === 'deployments' || currentKind === 'statefulsets') {
      pills.push({
        id: 'scale',
        label: 'Scale Replicas',
        icon: SlidersHorizontal,
        color: 'hover:border-cyan-500 hover:text-cyan-300 hover:bg-cyan-950/40 text-cyan-400 border-cyan-900/50 bg-cyan-950/20',
        disabled: !selectedItem,
      });
      pills.push({
        id: 'restart',
        label: 'Rollout Restart',
        icon: RefreshCw,
        color: 'hover:border-amber-500 hover:text-amber-300 hover:bg-amber-950/40 text-amber-400 border-amber-900/50 bg-amber-950/20',
        disabled: !selectedItem,
      });
    }

    if (currentKind === 'imagestreams') {
      pills.push({
        id: 'clean-is',
        label: 'SemVer Tag Cleanup Wizard',
        icon: Sparkles,
        color: 'hover:border-purple-500 hover:text-purple-300 hover:bg-purple-950/40 text-purple-400 border-purple-900/50 bg-purple-950/20',
        disabled: !selectedItem,
      });
    }

    if (currentKind === 'helm') {
      pills.push({
        id: 'helm-values',
        label: 'Helm Values',
        icon: FileText,
        color: 'hover:border-blue-500 hover:text-blue-300 hover:bg-blue-950/40 text-blue-400 border-blue-900/50 bg-blue-950/20',
        disabled: !selectedItem,
      });
      pills.push({
        id: 'helm-history',
        label: 'History & Rollback',
        icon: RefreshCw,
        color: 'hover:border-cyan-500 hover:text-cyan-300 hover:bg-cyan-950/40 text-cyan-400 border-cyan-900/50 bg-cyan-950/20',
        disabled: !selectedItem,
      });
    }

    pills.push({
      id: 'describe',
      label: 'Describe Details',
      icon: FileText,
      color: 'hover:border-slate-500 hover:text-slate-200 hover:bg-slate-800 text-slate-300 border-slate-700 bg-slate-800/40',
      disabled: !selectedItem,
    });

    pills.push({
      id: 'yaml',
      label: 'YAML',
      icon: Code2,
      color: 'hover:border-slate-500 hover:text-slate-200 hover:bg-slate-800 text-slate-300 border-slate-700 bg-slate-800/40',
      disabled: !selectedItem,
    });

    pills.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      color: 'hover:border-red-500 hover:text-red-300 hover:bg-red-950/40 text-red-400 border-red-900/50 bg-red-950/20',
      disabled: !selectedItem,
    });

    return pills;
  };

  const actionPills = getActionPills();

  return (
    <div className="p-4 bg-[#0f172a]/60 border-b border-slate-800 space-y-2.5">
      {/* Search Input Box */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder={`Filter ${currentKind} by name, status, IP, or labels (press '/' to focus)...`}
            className="w-full pl-10 pr-10 py-2 bg-slate-900/90 border border-slate-700/80 focus:border-red-500/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 shadow-inner transition-colors"
          />

          {query && (
            <button
              onClick={() => onChangeQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Selected resource indicator */}
        {selectedItem ? (
          <div className="px-3 py-2 rounded-lg bg-slate-900 border border-cyan-500/30 text-xs font-mono text-cyan-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="truncate max-w-[200px]">Selected: {selectedItem.name}</span>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-xs font-mono text-slate-400">
            Click a row to select
          </div>
        )}
      </div>

      {/* Autocomplete Action Buttons / Suggestion Pills */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
          <Zap size={12} className="text-amber-400" /> Actions:
        </span>

        {actionPills.map((pill) => {
          const Icon = pill.icon;
          return (
            <button
              key={pill.id}
              onClick={() => onAction(pill.id)}
              disabled={pill.disabled}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${pill.color}`}
            >
              <Icon size={13} />
              <span>{pill.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
