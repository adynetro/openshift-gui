import React from 'react';
import { Layers, FolderGit2, RefreshCw, Server, User, AlertTriangle, Globe } from 'lucide-react';

interface TopNavProps {
  currentContext: string | null;
  currentProject: string;
  clusterServer: string;
  clusterUser: string;
  isConnected: boolean;
  isUnauthorized?: boolean;
  loading: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onRefresh: () => void;
  onOpenContextModal: () => void;
  onOpenProjectModal: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentContext,
  currentProject,
  clusterServer,
  clusterUser,
  isConnected,
  isUnauthorized,
  loading,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  onOpenContextModal,
  onOpenProjectModal,
}) => {
  const isAllProjects = !currentProject || currentProject === 'all-projects' || currentProject === '__all__';

  return (
    <header className="titlebar-drag-region h-16 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between px-4 select-none shrink-0">
      {/* Left: macOS traffic lights offset + OpenShift Logo */}
      <div className="flex items-center space-x-4 pl-18">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ee0000] to-[#b30000] flex items-center justify-center shadow-lg shadow-red-900/30">
            <span className="text-white font-black text-sm">oc</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
              OpenShift <span className="text-[#ee0000]">GUI</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">Cluster Manager</p>
          </div>
        </div>

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-slate-800" />

        {/* Context Selector Button */}
        <button
          onClick={onOpenContextModal}
          className="no-drag flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-cyan-500/50 transition-all text-left group"
          title="Click to switch Kubernetes / OpenShift Context (or press 'c')"
        >
          <div className="w-6 h-6 rounded bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:text-cyan-300">
            <Layers size={14} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1">
              Context <span className="bg-slate-900 px-1 py-0.2 rounded text-[9px] text-slate-400">c</span>
            </div>
            <div className="text-xs font-semibold text-slate-200 truncate max-w-[240px]">
              {currentContext || 'Select Context...'}
            </div>
          </div>
        </button>

        {/* Project Selector Button */}
        <button
          onClick={onOpenProjectModal}
          className={`no-drag flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all text-left group ${
            isAllProjects
              ? 'bg-purple-950/40 hover:bg-purple-900/50 border-purple-800/70 hover:border-purple-500/80 shadow-sm'
              : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/60 hover:border-emerald-500/50'
          }`}
          title="Click to switch OpenShift Project / Namespace (or press 'p')"
        >
          <div className={`w-6 h-6 rounded flex items-center justify-center ${
            isAllProjects ? 'bg-purple-500/20 text-purple-300' : 'bg-emerald-500/10 text-emerald-400 group-hover:text-emerald-300'
          }`}>
            {isAllProjects ? <Globe size={14} /> : <FolderGit2 size={14} />}
          </div>
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 ${
              isAllProjects ? 'text-purple-300' : 'text-emerald-400'
            }`}>
              Project <span className="bg-slate-900 px-1 py-0.2 rounded text-[9px] text-slate-400">p</span>
            </div>
            <div className="text-xs font-semibold text-slate-200 truncate max-w-[190px]">
              {isAllProjects ? 'All Projects (Cluster-Wide)' : currentProject}
            </div>
          </div>
        </button>
      </div>

      {/* Right: Cluster Status, Refresh & Controls */}
      <div className="no-drag flex items-center space-x-3">
        {/* User & Server metadata */}
        <div className="hidden lg:flex flex-col items-end text-right">
          <div className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
            <User size={11} className="text-slate-400" />
            <span className="truncate max-w-[180px] font-mono">{clusterUser || 'Logged In'}</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
            <Server size={10} className="text-slate-500" />
            <span className="truncate max-w-[180px]">{clusterServer || 'Cluster API'}</span>
          </div>
        </div>

        {/* Live Cluster Connection Status Badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700/80 text-xs">
          {isUnauthorized ? (
            <>
              <AlertTriangle size={12} className="text-amber-400" />
              <span className="text-amber-300 font-mono text-[11px]">Unauthorized</span>
            </>
          ) : (
            <>
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-400 pulse-dot shadow-sm shadow-emerald-400' : 'bg-rose-500'
                }`}
              />
              <span className="text-slate-300 font-mono text-[11px]">
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </>
          )}
        </div>

        {/* Live Auto-Sync Status Badge (Active by Default) */}
        <div
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/70 text-emerald-300 text-xs font-mono"
          title="Cluster state is automatically synced every 3.5 seconds"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot shadow-sm shadow-emerald-400" />
          <span>Auto-Sync Active</span>
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all disabled:opacity-50"
          title="Refresh resources immediately"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin text-cyan-400' : ''} />
        </button>
      </div>
    </header>
  );
};
