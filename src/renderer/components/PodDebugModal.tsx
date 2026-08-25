import React, { useState, useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  X,
  Bug,
  Terminal,
  Activity,
  ScrollText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  Server,
  Layers,
  Sparkles,
  Play,
  RotateCcw,
  FileCode2,
  Box,
  Cpu,
  Clock,
} from 'lucide-react';
import { ResourceItem, PodDebugDiagnostics, ContainerDebugState } from '../../types/k8s.js';
import { useCurrentTheme } from '../utils/themes.js';

interface PodDebugModalProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onOpenLogs?: (podName: string) => void;
  onOpenYaml?: (podName: string) => void;
}

export const PodDebugModal: React.FC<PodDebugModalProps> = ({
  item,
  namespace,
  onClose,
  onOpenLogs,
  onOpenYaml,
}) => {
  const { theme } = useCurrentTheme();
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'terminal' | 'crashLogs' | 'events'>('diagnostics');
  const [diagnostics, setDiagnostics] = useState<PodDebugDiagnostics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // Terminal state for interactive oc debug
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [termSessionId, setTermSessionId] = useState<string | null>(null);
  const [termStatus, setTermStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  // Fetch Pod Debug Information
  const fetchDebugInfo = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const api = (window as any).electronAPI;
      if (!api?.getPodDebugInfo) {
        throw new Error('Debug IPC API is not available');
      }
      const res = await api.getPodDebugInfo(item.name, namespace);
      if (res.error) {
        setError(res.error);
      } else if (res.diagnostics) {
        setDiagnostics(res.diagnostics);
      }
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to fetch pod debug info');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebugInfo();
    const interval = setInterval(() => {
      if (activeTab !== 'terminal') {
        fetchDebugInfo(true);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [item.name, namespace, activeTab]);

  // Handle Terminal Session when in 'terminal' tab
  useEffect(() => {
    if (activeTab !== 'terminal' || !terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      convertEol: true,
      allowTransparency: false,
      scrollback: 10000,
      theme: theme.xtermTheme,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    const fitTerminal = () => {
      if (!terminalRef.current || !fitAddon) return;
      try {
        fitAddon.fit();
      } catch {}
    };

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(fitTerminal);
    });
    resizeObserver.observe(terminalRef.current);

    requestAnimationFrame(fitTerminal);
    const fitTimer = setTimeout(fitTerminal, 100);

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[33m⚡ Launching OpenShift Debug Container replica for pod ' + item.name + '...\x1b[0m\r\n');
    term.writeln('\x1b[36mℹ️  Bypassing crashing entrypoint with interactive shell & exact volume mounts\x1b[0m\r\n');

    const sessionIdRef = { current: '' };
    const api = (window as any).electronAPI;

    const onDataDispose = term.onData((data) => {
      if (sessionIdRef.current && api?.writeTerminal) {
        api.writeTerminal(sessionIdRef.current, data);
      }
    });

    const removeListener = api?.onTerminalData
      ? api.onTerminalData((data: { sessionId: string; data: string }) => {
          if (!sessionIdRef.current || data.sessionId === sessionIdRef.current) {
            term.write(data.data);
          }
        })
      : () => {};

    const initDebugSession = async () => {
      try {
        setTermStatus('connecting');
        const newSessionId = await api.startTerminal(item.name, namespace, undefined, 'debug-pod');
        sessionIdRef.current = newSessionId;
        setTermSessionId(newSessionId);
        setTermStatus('connected');
        term.focus();
      } catch (err: any) {
        setTermStatus('error');
        term.writeln(`\r\n\x1b[31m[Debug session error: ${err.message || 'Failed to start debug session'}]\x1b[0m\r\n`);
      }
    };

    initDebugSession();

    return () => {
      clearTimeout(fitTimer);
      resizeObserver.disconnect();
      onDataDispose.dispose();
      removeListener();
      if (sessionIdRef.current && api?.stopTerminal) {
        api.stopTerminal(sessionIdRef.current);
      }
      term.dispose();
    };
  }, [activeTab, item.name, namespace, theme]);

  // Keyboard shortcut Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeTab !== 'terminal') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, activeTab]);

  const handleCopyCrashLogs = () => {
    const logs = diagnostics?.previousLogs || diagnostics?.recentLogs || '';
    if (logs) {
      navigator.clipboard.writeText(logs);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    }
  };

  const getExitCodeBadge = (exitCode?: number, signal?: number, reason?: string) => {
    if (exitCode === undefined && !reason) return null;
    let label = `Exit ${exitCode ?? '-'}`;
    let desc = 'Terminated';
    let isFatal = false;

    if (reason === 'OOMKilled' || exitCode === 137) {
      label = 'Exit 137 (OOMKilled)';
      desc = 'Out Of Memory - Exceeded Container Limit';
      isFatal = true;
    } else if (exitCode === 1) {
      label = 'Exit 1 (Application Error)';
      desc = 'Unhandled Exception / Fatal Crash';
      isFatal = true;
    } else if (exitCode === 143) {
      label = 'Exit 143 (SIGTERM)';
      desc = 'Gracefully Stopped / Evicted';
    } else if (exitCode === 0) {
      label = 'Exit 0 (Completed)';
      desc = 'Completed Cleanly';
    }

    return (
      <span
        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border flex items-center gap-1.5 ${
          isFatal
            ? 'bg-rose-950/80 text-rose-300 border-rose-800'
            : 'bg-amber-950/80 text-amber-300 border-amber-800'
        }`}
        title={desc}
      >
        <AlertTriangle size={12} />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-in fade-in duration-150"
    >
      <div
        className="rounded-xl shadow-2xl w-[96vw] max-w-[1500px] h-[92vh] flex flex-col overflow-hidden border"
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-subtle, #334155)',
          color: 'var(--text-main, #f8fafc)',
        }}
      >
        {/* Modal Header */}
        <div
          className="p-3.5 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #1e293b)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center border shadow-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--accent-red, #ef4444)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
              }}
            >
              <Bug size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span>Pod Diagnostics & Debugger:</span>
                  <span className="font-mono" style={{ color: 'var(--accent-cyan, #06b6d4)' }}>
                    {item.name}
                  </span>
                </h2>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
                  style={{
                    backgroundColor: item.status === 'Running' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: item.status === 'Running' ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)',
                    borderColor: item.status === 'Running' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                  }}
                >
                  {item.status}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono border"
                  style={{
                    backgroundColor: 'var(--bg-input, #0f172a)',
                    borderColor: 'var(--border-subtle, #334155)',
                    color: 'var(--text-muted, #94a3b8)',
                  }}
                >
                  Project: {namespace}
                </span>
                {diagnostics?.nodeName && (
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-mono border"
                    style={{
                      backgroundColor: 'var(--bg-input, #0f172a)',
                      borderColor: 'var(--border-subtle, #334155)',
                      color: 'var(--text-muted, #94a3b8)',
                    }}
                  >
                    Node: {diagnostics.nodeName}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                Failure analysis • Exit code investigation • Interactive oc debug container replica
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center p-1 rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
              }}
            >
              <button
                onClick={() => setActiveTab('diagnostics')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'diagnostics'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity size={13} />
                <span>Diagnostics</span>
              </button>

              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'terminal'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal size={13} />
                <span>Interactive Debug Shell</span>
              </button>

              <button
                onClick={() => setActiveTab('crashLogs')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'crashLogs'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ScrollText size={13} />
                <span>Crash Logs</span>
              </button>

              <button
                onClick={() => setActiveTab('events')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'events'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <AlertTriangle size={13} />
                <span>Events ({diagnostics?.events?.length || 0})</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border transition-colors hover:brightness-110 ml-2"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
                color: 'var(--text-muted, #94a3b8)',
              }}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading && !diagnostics ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
              <RefreshCw size={28} className="animate-spin text-cyan-400" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                Analyzing pod failure state and container exit codes...
              </p>
            </div>
          ) : error && !diagnostics ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3 text-center">
              <XCircle size={36} className="text-rose-400" />
              <p className="text-base font-bold text-rose-300">Failed to load pod diagnostics</p>
              <p className="text-xs font-mono max-w-md" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                {error}
              </p>
              <button
                onClick={() => fetchDebugInfo()}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold border border-slate-700 mt-2"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* TAB 1: DIAGNOSTICS & SUMMARY */}
              {activeTab === 'diagnostics' && diagnostics && (
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {/* Smart Suggestion Alert Card */}
                  <div
                    className="p-3.5 rounded-xl border flex items-start gap-3 shadow-sm"
                    style={{
                      backgroundColor: 'rgba(6, 182, 212, 0.08)',
                      borderColor: 'rgba(6, 182, 212, 0.3)',
                    }}
                  >
                    <div
                      className="p-2 rounded-lg shrink-0"
                      style={{
                        backgroundColor: 'rgba(6, 182, 212, 0.15)',
                        color: 'var(--accent-cyan, #06b6d4)',
                      }}
                    >
                      <Sparkles size={18} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xs font-bold font-mono" style={{ color: 'var(--accent-cyan, #06b6d4)' }}>
                        Diagnostic Analysis & Action Recommendation
                      </h3>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-main, #f8fafc)' }}>
                        {diagnostics.suggestedAction}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5">
                        <button
                          onClick={() => setActiveTab('terminal')}
                          className="px-3 py-1 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow"
                        >
                          <Terminal size={12} />
                          <span>Start Interactive Debug Container (`oc debug`)</span>
                        </button>
                        {diagnostics.previousLogs && (
                          <button
                            onClick={() => setActiveTab('crashLogs')}
                            className="px-3 py-1 rounded-md bg-rose-950/80 hover:bg-rose-900/80 text-rose-200 border border-rose-800 text-xs font-semibold flex items-center gap-1.5 transition-all"
                          >
                            <ScrollText size={12} />
                            <span>View Pre-Crash Logs ({diagnostics.previousLogs.split('\n').length} lines)</span>
                          </button>
                        )}
                        {onOpenLogs && (
                          <button
                            onClick={() => onOpenLogs(item.name)}
                            className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700"
                          >
                            <Play size={12} />
                            <span>Stream Live Logs</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Containers Lifecycle & Crash Analysis */}
                  <div
                    className="rounded-xl border overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-input, #0f172a)',
                      borderColor: 'var(--border-color, #1e293b)',
                    }}
                  >
                    <div
                      className="p-2.5 border-b flex items-center justify-between text-xs font-bold"
                      style={{
                        backgroundColor: 'var(--bg-card-header, #0f172a)',
                        borderColor: 'var(--border-color, #1e293b)',
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <Box size={14} style={{ color: 'var(--accent-purple, #a855f7)' }} />
                        <span>Container Failure States & Exit Codes</span>
                      </span>
                      <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        {diagnostics.containers.length} containers
                      </span>
                    </div>

                    <div className="divide-y" style={{ borderColor: 'var(--border-color, #1e293b)' }}>
                      {diagnostics.containers.map((c) => {
                        const isCrash = c.state.reason === 'CrashLoopBackOff' || (c.state.exitCode !== undefined && c.state.exitCode !== 0);
                        const isOOM = c.state.reason === 'OOMKilled' || c.lastState?.reason === 'OOMKilled';

                        return (
                          <div key={c.name} className="p-3 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold font-mono text-sm" style={{ color: 'var(--accent-cyan, #06b6d4)' }}>
                                  {c.name}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                                    c.ready
                                      ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                                      : 'bg-rose-950/70 text-rose-300 border-rose-800'
                                  }`}
                                >
                                  {c.ready ? 'Ready' : 'Not Ready'}
                                </span>
                                <span className="font-mono text-amber-300 text-[11px]">
                                  Restarts: {c.restartCount}x
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {getExitCodeBadge(c.state.exitCode, c.state.signal, c.state.reason)}
                                {c.lastState?.exitCode !== undefined && (
                                  <span className="text-[11px] font-mono text-slate-400">
                                    Last exit: {c.lastState.exitCode} ({c.lastState.reason || 'Terminated'})
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Current State Details */}
                            <div
                              className="p-2.5 rounded-lg border font-mono text-[11px] space-y-1"
                              style={{
                                backgroundColor: 'var(--bg-main, #0b0f19)',
                                borderColor: 'var(--border-subtle, #334155)',
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span style={{ color: 'var(--text-muted, #94a3b8)' }}>State:</span>
                                <span
                                  className={`font-bold ${
                                    c.state.type === 'running'
                                      ? 'text-emerald-400'
                                      : c.state.type === 'terminated'
                                      ? 'text-rose-400'
                                      : 'text-amber-400'
                                  }`}
                                >
                                  {c.state.type.toUpperCase()}{' '}
                                  {c.state.reason ? `(${c.state.reason})` : ''}
                                </span>
                              </div>

                              {c.state.message && (
                                <div className="text-rose-300 break-words mt-1">
                                  Message: {c.state.message}
                                </div>
                              )}

                              {c.lastState?.message && (
                                <div className="text-amber-300 break-words mt-1">
                                  Last Term Message: {c.lastState.message}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-slate-400 pt-1 text-[10px]">
                                <span className="truncate max-w-[450px]">Image: {c.image}</span>
                                {c.state.startedAt && <span>Started: {new Date(c.state.startedAt).toLocaleTimeString()}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pod Metadata & Node Context */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                    <div
                      className="p-3 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--bg-input, #0f172a)',
                        borderColor: 'var(--border-color, #1e293b)',
                      }}
                    >
                      <div className="flex items-center gap-2 font-bold mb-1.5" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        <Server size={14} style={{ color: 'var(--accent-blue, #3b82f6)' }} />
                        <span>Node & Network</span>
                      </div>
                      <div className="space-y-1">
                        <div>Node: {diagnostics.nodeName}</div>
                        <div>Pod IP: {diagnostics.podIP}</div>
                      </div>
                    </div>

                    <div
                      className="p-3 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--bg-input, #0f172a)',
                        borderColor: 'var(--border-color, #1e293b)',
                      }}
                    >
                      <div className="flex items-center gap-2 font-bold mb-1.5" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        <Clock size={14} style={{ color: 'var(--accent-yellow, #f59e0b)' }} />
                        <span>Timeline</span>
                      </div>
                      <div className="space-y-1">
                        <div>Phase: {diagnostics.phase}</div>
                        <div>
                          Started: {diagnostics.startTime ? new Date(diagnostics.startTime).toLocaleString() : '-'}
                        </div>
                      </div>
                    </div>

                    <div
                      className="p-3 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--bg-input, #0f172a)',
                        borderColor: 'var(--border-color, #1e293b)',
                      }}
                    >
                      <div className="flex items-center gap-2 font-bold mb-1.5" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        <FileCode2 size={14} style={{ color: 'var(--accent-green, #10b981)' }} />
                        <span>YAML & Manifest</span>
                      </div>
                      <div className="mt-1">
                        {onOpenYaml && (
                          <button
                            onClick={() => onOpenYaml(item.name)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-sans font-medium flex items-center gap-1.5 transition-all"
                          >
                            <FileCode2 size={12} />
                            <span>View Pod Manifest YAML</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: INTERACTIVE DEBUG SHELL (OC DEBUG) */}
              {activeTab === 'terminal' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div
                    className="p-2 border-b flex items-center justify-between text-xs font-mono"
                    style={{
                      backgroundColor: 'var(--bg-input, #0f172a)',
                      borderColor: 'var(--border-color, #1e293b)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          termStatus === 'connected'
                            ? 'bg-emerald-400 animate-pulse'
                            : termStatus === 'connecting'
                            ? 'bg-amber-400 animate-ping'
                            : 'bg-rose-400'
                        }`}
                      />
                      <span>
                        oc debug pod/{item.name} • {termStatus === 'connected' ? 'Interactive Terminal Ready' : termStatus}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (xtermInstance.current) {
                            xtermInstance.current.clear();
                            xtermInstance.current.focus();
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div
                    ref={terminalRef}
                    className="flex-1 w-full h-full overflow-hidden p-2"
                    style={{
                      backgroundColor: theme.preview.bg,
                    }}
                  />
                </div>
              )}

              {/* TAB 3: CRASH / PREVIOUS LOGS */}
              {activeTab === 'crashLogs' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div
                    className="p-2.5 border-b flex items-center justify-between text-xs font-mono"
                    style={{
                      backgroundColor: 'var(--bg-input, #0f172a)',
                      borderColor: 'var(--border-color, #1e293b)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <ScrollText size={14} className="text-rose-400" />
                      <span>
                        {diagnostics?.previousLogs ? 'Previous Crashed Instance Logs (oc logs -p)' : 'Recent Standard Output Logs'}
                      </span>
                    </div>

                    <button
                      onClick={handleCopyCrashLogs}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1.5 transition-all"
                    >
                      {copiedLogs ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedLogs ? 'Copied' : 'Copy Logs'}</span>
                    </button>
                  </div>

                  <div
                    className="flex-1 overflow-auto p-4 font-mono text-xs whitespace-pre-wrap select-text leading-relaxed"
                    style={{
                      backgroundColor: 'var(--bg-main, #0b0f19)',
                      color: 'var(--text-main, #f8fafc)',
                    }}
                  >
                    {diagnostics?.previousLogs || diagnostics?.recentLogs ? (
                      diagnostics.previousLogs || diagnostics.recentLogs
                    ) : (
                      <div className="italic text-slate-500">
                        No previous crashed logs found for this pod. The container may not have crashed or restarted yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: POD EVENTS */}
              {activeTab === 'events' && (
                <div className="flex-1 overflow-auto p-4">
                  {diagnostics?.events && diagnostics.events.length > 0 ? (
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr
                          className="border-b text-[11px] font-bold text-slate-400"
                          style={{ borderColor: 'var(--border-color, #1e293b)' }}
                        >
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Reason</th>
                          <th className="py-2 px-3">Message</th>
                          <th className="py-2 px-3">Count</th>
                          <th className="py-2 px-3">Age</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle, #334155)' }}>
                        {diagnostics.events.map((evt, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  evt.type === 'Warning'
                                    ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                }`}
                              >
                                {evt.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-bold text-cyan-300">{evt.reason}</td>
                            <td className="py-2 px-3 text-slate-200">{evt.message}</td>
                            <td className="py-2 px-3 text-amber-300">{evt.count}x</td>
                            <td className="py-2 px-3 text-slate-400">
                              {evt.lastTimestamp ? new Date(evt.lastTimestamp).toLocaleTimeString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center italic text-slate-500">
                      No warning or normal events reported for this pod.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="p-2.5 border-t flex items-center justify-between text-[11px] font-mono shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #1e293b)',
            color: 'var(--text-muted, #94a3b8)',
          }}
        >
          <div className="flex items-center gap-2">
            <Bug size={12} style={{ color: 'var(--accent-red, #ef4444)' }} />
            <span>OpenShift Pod Debugger • Auto-refreshing • {theme.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <span>Press Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
