import React from 'react';
import {
  Server,
  FolderGit2,
  Globe,
  Layers,
  Box,
  Network,
  Database,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Activity,
  Cpu,
  ArrowRight,
} from 'lucide-react';

export interface PreloadStep {
  id: string;
  label: string;
  category?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
}

export interface PreloaderAnimationProps {
  isActive: boolean;
  mode: 'context' | 'project' | 'initial';
  title: string;
  subtitle?: string;
  target: string;
  subTarget?: string;
  progress: number; // 0 - 100
  currentStage?: string;
  steps?: PreloadStep[];
}

export const PreloaderAnimation: React.FC<PreloaderAnimationProps> = ({
  isActive,
  mode,
  title,
  subtitle,
  target,
  subTarget,
  progress,
  currentStage,
  steps = [],
}) => {
  if (!isActive) return null;

  const isContext = mode === 'context';
  const isAllProjects = target === 'all-projects' || target.toLowerCase().includes('all projects');
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md transition-all duration-300 select-none overflow-hidden"
      style={{
        backgroundColor: 'rgba(11, 15, 25, 0.85)',
      }}
    >
      {/* Background Ambient Radial Glow */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-600/10 via-red-600/10 to-purple-600/10 blur-3xl pointer-events-none animate-radar-pulse" />
      <div className="absolute w-[400px] h-[400px] rounded-full bg-cyan-500/5 blur-2xl pointer-events-none" />

      {/* Main Glassmorphic Card */}
      <div
        className="relative z-10 w-full max-w-xl mx-4 p-7 rounded-2xl border shadow-2xl transition-all duration-300 flex flex-col items-center text-center space-y-6 animate-float-slow"
        style={{
          backgroundColor: 'var(--bg-sidebar, #0f172a)',
          borderColor: 'var(--border-color, #1e293b)',
          color: 'var(--text-main, #f8fafc)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px 2px rgba(6, 182, 212, 0.15)',
        }}
      >
        {/* ========================================================================= */}
        {/* TOP RADAR / ORBITAL GRAPHIC ANIMATION                                     */}
        {/* ========================================================================= */}
        <div className="relative w-24 h-24 flex items-center justify-center my-1">
          {/* Outer Pulsing Wave Ring */}
          <div className="absolute inset-0 rounded-full border border-cyan-500/30 animate-radar-pulse" />

          {/* Outer Counter-Rotating Segmented Ring */}
          <div className="absolute -inset-2 rounded-full border-2 border-dashed border-cyan-500/40 animate-spin-reverse" />

          {/* Middle Rotating Gradient Ring */}
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-red-500 border-r-cyan-400 border-b-purple-500 animate-spin" />

          {/* Center Glowing Hub */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border border-slate-700/80 flex items-center justify-center shadow-xl shadow-cyan-950/50 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 via-transparent to-red-500/20 opacity-80" />
            {isContext ? (
              <Server size={30} className="text-cyan-400 relative z-10 animate-pulse" />
            ) : isAllProjects ? (
              <Globe size={30} className="text-purple-400 relative z-10 animate-pulse" />
            ) : (
              <FolderGit2 size={30} className="text-emerald-400 relative z-10 animate-pulse" />
            )}
          </div>

          {/* Small Orbiting Sparkle */}
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-400/80 animate-ping" />
        </div>

        {/* ========================================================================= */}
        {/* TITLE & TARGET BADGES                                                     */}
        {/* ========================================================================= */}
        <div className="space-y-2 max-w-lg">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-cyan-950/80 text-cyan-300 border border-cyan-800/80">
            <Sparkles size={12} className="animate-spin" />
            <span>{title || (isContext ? 'Switching Server Context' : 'Switching Project')}</span>
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80 text-xs font-semibold text-slate-100 font-mono shadow-inner">
              {isContext ? <Server size={13} className="text-cyan-400" /> : isAllProjects ? <Globe size={13} className="text-purple-400" /> : <FolderGit2 size={13} className="text-emerald-400" />}
              <span className="truncate max-w-[320px]">{target || 'Cluster'}</span>
            </div>

            {subTarget && (
              <>
                <ArrowRight size={13} className="text-slate-500 shrink-0" />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-medium text-slate-300 font-mono">
                  <span className="truncate max-w-[200px]">{subTarget}</span>
                </div>
              </>
            )}
          </div>

          {subtitle && (
            <p className="text-xs text-slate-400 font-medium pt-0.5">{subtitle}</p>
          )}
        </div>

        {/* ========================================================================= */}
        {/* DYNAMIC PROGRESS BAR & CURRENT STAGE                                      */}
        {/* ========================================================================= */}
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-xs font-mono font-semibold px-1">
            <span className="text-slate-300 flex items-center gap-1.5 truncate max-w-[340px]">
              <RefreshCw size={12} className={`text-cyan-400 ${clampedProgress < 100 ? 'animate-spin' : ''}`} />
              <span className="truncate">{currentStage || 'Preloading cluster manifests & objects...'}</span>
            </span>
            <span className="text-cyan-400 font-bold ml-2 shrink-0">{clampedProgress}%</span>
          </div>

          {/* Outer Bar */}
          <div className="w-full h-2.5 rounded-full bg-slate-900 border border-slate-700/70 overflow-hidden relative shadow-inner p-0.5">
            {/* Shimmer Light Sweep */}
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-indigo-500 transition-all duration-300 relative overflow-hidden"
              style={{ width: `${clampedProgress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer-slide" />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* REAL-TIME PRELOAD CHECKLIST PILLS                                         */}
        {/* ========================================================================= */}
        {steps && steps.length > 0 && (
          <div className="w-full grid grid-cols-2 gap-2 pt-1 text-left font-mono">
            {steps.map((step) => {
              const isCompleted = step.status === 'completed';
              const isInProgress = step.status === 'in-progress';
              const isError = step.status === 'error';

              return (
                <div
                  key={step.id}
                  className={`px-3 py-2 rounded-xl border flex items-center justify-between transition-all duration-200 text-[11px] ${
                    isCompleted
                      ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-300 shadow-sm shadow-emerald-950/40'
                      : isInProgress
                      ? 'bg-cyan-950/40 border-cyan-700/80 text-cyan-200 shadow-sm shadow-cyan-950/40 animate-pulse'
                      : isError
                      ? 'bg-rose-950/40 border-rose-800/70 text-rose-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-500 opacity-60'
                  }`}
                >
                  <span className="truncate pr-1 font-medium">{step.label}</span>
                  <div className="shrink-0 flex items-center">
                    {isCompleted ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : isInProgress ? (
                      <RefreshCw size={12} className="text-cyan-400 animate-spin" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-slate-700" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
