import React, { useState, useMemo } from 'react';
import { X, Search, Layers, FolderGit2, CheckCircle2, Server, User, ArrowRight, Globe } from 'lucide-react';
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
  onClose,
}) => {
  const [query, setQuery] = useState<string>('');

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

  const title = mode === 'context' ? 'Switch Kubernetes / OpenShift Context' : 'Switch Project / Namespace';
  const Icon = mode === 'context' ? Layers : FolderGit2;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#0f172a] border border-cyan-500/40 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Icon size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{title}</h2>
              <p className="text-xs text-slate-400">
                {mode === 'context' ? `Available Contexts: ${contexts.length}` : `Available Projects: ${projects.length}`}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {/* Autocomplete Search Input */}
        <div className="p-4 bg-slate-900/40 border-b border-slate-800">
          <div className="relative">
            <Search size={16} className="absolute inset-y-0 left-3 my-auto text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search and filter ${mode}s...`}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg text-sm text-slate-100 placeholder-slate-500 shadow-inner"
            />
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-auto p-3 space-y-1 divide-y divide-slate-800/40">
          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No matching {mode}s found.</div>
          ) : (
            items.map((item: any) => {
              const isCurrent = mode === 'context' ? item.name === currentContext : (item.name === currentProject || (item.name === 'all-projects' && (!currentProject || currentProject === 'all-projects')));
              const isAllProjects = mode === 'project' && item.name === 'all-projects';

              return (
                <div
                  key={item.name}
                  onClick={() => {
                    if (mode === 'context') onSelectContext(item.name);
                    else onSelectProject(item.name);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-all cursor-pointer group ${
                    isCurrent
                      ? 'bg-cyan-950/40 border border-cyan-500/50 shadow-sm'
                      : isAllProjects
                      ? 'bg-purple-950/20 hover:bg-purple-950/40 border border-purple-900/40'
                      : 'hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {isAllProjects && <Globe size={15} className="text-purple-400 shrink-0" />}
                      <span className={`font-mono text-sm font-semibold transition-colors ${isAllProjects ? 'text-purple-300 group-hover:text-purple-200' : 'text-white group-hover:text-cyan-300'}`}>
                        {item.displayName || item.name}
                      </span>
                      {isAllProjects && (
                        <span className="px-2 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-mono">
                          Cluster-Wide
                        </span>
                      )}
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      )}
                    </div>

                    {mode === 'context' ? (
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                        {item.cluster && (
                          <span className="flex items-center gap-1">
                            <Server size={11} className="text-slate-500" />
                            <span className="truncate max-w-[200px]">{item.cluster}</span>
                          </span>
                        )}
                        {item.user && (
                          <span className="flex items-center gap-1">
                            <User size={11} className="text-slate-500" />
                            <span className="truncate max-w-[150px]">{item.user}</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 font-mono">
                        {isAllProjects ? (
                          <span className="text-purple-400">View all resources across all namespaces</span>
                        ) : (
                          <>Status: <span className="text-emerald-400">{item.status || 'Active'}</span></>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center text-slate-500 group-hover:text-cyan-400 transition-colors">
                    <ArrowRight size={16} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
