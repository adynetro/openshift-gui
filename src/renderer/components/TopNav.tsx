import React from 'react';
import { Layers, FolderGit2, RefreshCw, Server, User, FlaskConical, AlertTriangle } from 'lucide-react';

interface TopNavProps {
  currentContext: string | null;
  currentProject: string;
  clusterServer: string;
  clusterUser: string;
  isConnected: boolean;
  isUnauthorized?: boolean;
  loading: boolean;
  autoRefresh: boolean;
  demoMode: boolean;
  onToggleDemoMode: () => void;
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
  demoMode,
  onToggleDemoMode,
  onToggleAutoRefresh,
  onRefresh,
  onOpenContextModal,
  onOpenProjectModal,
}) => {
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
            <p className="text-[10px] text-slate-400 font-mono">Desktop Manager</p>
          </div>
        </div>

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-slate-800" />

        {/* Context Selector Button */}
        <button
          onClick={onOpenContextModal}
          className="no-drag flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-cyan-500/50 transition-all text-left group"
          title="Click to switch Kubernetes / OpenShift Context"
        >
          <div className="w-5 h-5 rounded bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:text-cyan-300">
            <Layers size={13} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1">
              Context <span className="bg-slate-900 px-1 py-0.2 rounded text-[9px] text-slate-400">c</span>
            </div>
            <div className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">
              {currentContext || 'Select Context...'}
            </div>
          </div>
        </button>

        {/* Project Selector Button */}
        <button
          onClick={onOpenProjectModal}
          className="no-drag flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-emerald-500/50 transition-all text-left group"
          title="Click to switch OpenShift Project / Namespace"
        >
          <div className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:text-emerald-300">
            <FolderGit2 size={13} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1">
              Project <span className="bg-slate-900 px-1 py-0.2 rounded text-[9px] text-slate-400">p</span>
            </div>
            <div className="text-xs font-semibold text-slate-200 truncate max-w-[160px]">
              {currentProject || 'default'}
            </div>
          </div>
        </button>
      </div>

      {/* Right: Cluster Status, Demo Mode, Refresh & Controls */}
      <div className="no-drag flex items-center space-x-3">
        {/* User & Server metadata */}
        <div className="hidden xl:flex flex-col items-end text-right">
          <div className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
            <User size={11} className="text-slate-400" />
            <span className="truncate max-w-[150px]">{clusterUser || 'Logged In'}</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
            <Server size={10} className="text-slate-500" />
            <span className="truncate max-w-[180px]">{clusterServer || 'Cluster API'}</span>
          </div>
        </div>

        {/* Demo Mode Toggle Button */}
        <button
          onClick={onToggleDemoMode}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
            demoMode
              ? 'bg-purple-950/80 border-purple-500 text-purple-200 shadow-md shadow-purple-950'
              : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-purple-300 hover:border-purple-500/50'
          }`}
          title="Toggle Demo Mock Data (Test all UI features without active cluster login)"
        >
          <FlaskConical size={13} className={demoMode ? 'text-purple-400 animate-bounce' : 'text-slate-400'} />
          <span>Demo Data {demoMode ? 'ON' : 'OFF'}</span>
        </button>

        {/* Live Status Pill */}
        <div className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
          {demoMode ? (
            <div className="flex items-center gap-1.5 text-purple-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>Demo Mode</span>
            </div>
          ) : isUnauthorized ? (
            <div className="flex items-center gap-1.5 text-amber-400 font-medium">
              <AlertTriangle size={12} className="text-amber-400" />
              <span>Unauthorized (Expired)</span>
            </div>
          ) : isConnected ? (
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
              <span>Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-rose-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Offline</span>
            </div>
          )}
        </div>

        {/* Auto Refresh Toggle */}
        <button
          onClick={onToggleAutoRefresh}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
            autoRefresh
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle automatic resource polling (every 4s)"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          Auto-Poll
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 disabled:opacity-50 transition-all flex items-center justify-center shadow"
          title="Refresh Resources now"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin text-cyan-400' : ''} />
        </button>
      </div>
    </header>
  );
};
