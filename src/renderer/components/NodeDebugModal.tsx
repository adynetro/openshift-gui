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
  HardDrive,
  Network,
  ShieldAlert,
} from 'lucide-react';
import { ResourceItem, NodeDebugDiagnostics } from '../../types/k8s.js';
import { useCurrentTheme } from '../utils/themes.js';

interface NodeDebugModalProps {
  item: ResourceItem;
  onClose: () => void;
  onOpenYaml?: (nodeName: string) => void;
  onOpenDescribe?: (nodeName: string) => void;
}

export const NodeDebugModal: React.FC<NodeDebugModalProps> = ({
  item,
  onClose,
  onOpenYaml,
  onOpenDescribe,
}) => {
  const { theme } = useCurrentTheme();
  const [activeTab, setActiveTab] = useState<'terminal' | 'health' | 'events'>('terminal');
  const [diagnostics, setDiagnostics] = useState<NodeDebugDiagnostics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Terminal state for interactive oc debug node
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [termSessionId, setTermSessionId] = useState<string | null>(null);
  const [termStatus, setTermStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  // Fetch Node Debug Information
  const fetchDebugInfo = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const api = (window as any).electronAPI;
      if (!api?.getNodeDebugInfo) {
        throw new Error('Debug IPC API is not available');
      }
      const res = await api.getNodeDebugInfo(item.name);
      if (res.error) {
        setError(res.error);
      } else if (res.diagnostics) {
        setDiagnostics(res.diagnostics);
      }
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to fetch node debug info');
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
    }, 5000);
    return () => clearInterval(interval);
  }, [item.name, activeTab]);

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

    term.writeln('\x1b[33m⚡ Spawning OpenShift Privileged Debugger Pod on node ' + item.name + '...\x1b[0m\r\n');
    term.writeln('\x1b[36mℹ️  Host root filesystem is mounted at /host. Run "chroot /host" to access host binaries.\x1b[0m\r\n');

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
        const newSessionId = await api.startTerminal(item.name, '', undefined, 'debug-node');
        sessionIdRef.current = newSessionId;
        setTermSessionId(newSessionId);
        setTermStatus('connected');
        term.focus();
      } catch (err: any) {
        setTermStatus('error');
        term.writeln(`\r\n\x1b[31m[Node debug session error: ${err.message || 'Failed to start debug session'}]\x1b[0m\r\n`);
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
  }, [activeTab, item.name, theme]);

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

  const runCommandPill = (cmd: string) => {
    const api = (window as any).electronAPI;
    if (termSessionId && api?.writeTerminal) {
      api.writeTerminal(termSessionId, cmd + '\n');
      if (xtermInstance.current) {
        xtermInstance.current.focus();
      }
    }
  };

  const getConditionColor = (cond: { type: string; status: string }) => {
    if (cond.type === 'Ready') {
      return cond.status === 'True' ? 'text-emerald-400 border-emerald-800 bg-emerald-950/70' : 'text-rose-400 border-rose-800 bg-rose-950/70';
    }
    // For MemoryPressure, DiskPressure, PIDPressure, NetworkUnavailable: 'False' is healthy
    return cond.status === 'False' ? 'text-emerald-400 border-emerald-800 bg-emerald-950/70' : 'text-rose-400 border-rose-800 bg-rose-950/70';
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
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                color: 'var(--accent-purple, #a855f7)',
                borderColor: 'rgba(168, 85, 247, 0.3)',
              }}
            >
              <Server size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span>Node Diagnostics & Host Shell:</span>
                  <span className="font-mono" style={{ color: 'var(--accent-cyan, #06b6d4)' }}>
                    {item.name}
                  </span>
                </h2>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
                  style={{
                    backgroundColor: item.status === 'Ready' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: item.status === 'Ready' ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)',
                    borderColor: item.status === 'Ready' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                  }}
                >
                  {item.status}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono border"
                  style={{
                    backgroundColor: 'var(--bg-input, #0f172a)',
                    borderColor: 'var(--border-subtle, #334155)',
                    color: 'var(--accent-yellow, #f59e0b)',
                  }}
                >
                  Roles: {diagnostics?.roles?.join(', ') || item.extra?.roles || 'worker'}
                </span>
              </div>
              <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                Privileged node debugger (`oc debug node`) • Host root access (/host) • Capacity & conditions
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
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'terminal'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal size={13} />
                <span>Interactive Node Shell</span>
              </button>

              <button
                onClick={() => setActiveTab('health')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'health'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity size={13} />
                <span>Health & Resources</span>
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
                <span>Node Events ({diagnostics?.events?.length || 0})</span>
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
          {/* TAB 1: INTERACTIVE HOST NODE SHELL */}
          {activeTab === 'terminal' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Quick Helper Command Toolbar */}
              <div
                className="px-3 py-2 border-b flex items-center justify-between text-xs font-mono"
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
                  <span className="font-bold">
                    oc debug node/{item.name} • {termStatus === 'connected' ? 'Host Shell Connected' : termStatus}
                  </span>
                </div>

                {/* Command Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[10px] text-slate-400">Quick Commands:</span>
                  <button
                    onClick={() => runCommandPill('chroot /host')}
                    className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900/80 text-purple-300 border border-purple-800 text-[11px] font-mono transition-all"
                    title="Enter host root environment"
                  >
                    chroot /host
                  </button>
                  <button
                    onClick={() => runCommandPill('journalctl -u kubelet -n 40 --no-pager')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-mono transition-all"
                    title="Inspect kubelet service log"
                  >
                    kubelet logs
                  </button>
                  <button
                    onClick={() => runCommandPill('crictl ps')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-mono transition-all"
                    title="List container runtime pods"
                  >
                    crictl ps
                  </button>
                  <button
                    onClick={() => runCommandPill('df -h')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-mono transition-all"
                    title="Check filesystem disk space"
                  >
                    df -h
                  </button>
                  <button
                    onClick={() => runCommandPill('free -m')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-mono transition-all"
                    title="Check memory usage"
                  >
                    free -m
                  </button>
                  <button
                    onClick={() => runCommandPill('dmesg | tail -n 30')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-mono transition-all"
                    title="Check kernel log buffer"
                  >
                    dmesg
                  </button>

                  <button
                    onClick={() => {
                      if (xtermInstance.current) {
                        xtermInstance.current.clear();
                        xtermInstance.current.focus();
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 ml-2"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Terminal View */}
              <div
                ref={terminalRef}
                className="flex-1 w-full h-full overflow-hidden p-2"
                style={{
                  backgroundColor: theme.preview.bg,
                }}
              />
            </div>
          )}

          {/* TAB 2: HEALTH & RESOURCE DIAGNOSTICS */}
          {activeTab === 'health' && (
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {loading && !diagnostics ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
                  <RefreshCw size={28} className="animate-spin text-cyan-400" />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                    Inspecting node conditions, capacity, and system info...
                  </p>
                </div>
              ) : diagnostics ? (
                <>
                  {/* Node Conditions Grid */}
                  <div>
                    <h3 className="text-xs font-bold font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                      Node Health Conditions
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                      {diagnostics.conditions.map((cond) => {
                        const isHealthy = cond.type === 'Ready' ? cond.status === 'True' : cond.status === 'False';
                        return (
                          <div
                            key={cond.type}
                            className={`p-3 rounded-xl border font-mono text-xs ${getConditionColor(cond)}`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span>{cond.type}</span>
                              {isHealthy ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                            </div>
                            <div className="text-sm font-bold mt-1">{cond.status}</div>
                            {cond.message && (
                              <div className="text-[10px] opacity-80 truncate mt-1" title={cond.message}>
                                {cond.message}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Resource Capacity vs Allocatable */}
                  <div
                    className="p-4 rounded-xl border font-mono text-xs"
                    style={{
                      backgroundColor: 'var(--bg-input, #0f172a)',
                      borderColor: 'var(--border-color, #1e293b)',
                    }}
                  >
                    <h3 className="text-xs font-bold font-mono uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                      <Cpu size={14} style={{ color: 'var(--accent-cyan, #06b6d4)' }} />
                      <span>Capacity vs Allocatable Resources</span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                        <div className="text-slate-400 text-[11px]">CPU Cores</div>
                        <div className="text-lg font-bold text-cyan-300 mt-1">
                          {diagnostics.allocatable.cpu} / {diagnostics.capacity.cpu}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Allocatable / Total Capacity</div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                        <div className="text-slate-400 text-[11px]">Memory RAM</div>
                        <div className="text-lg font-bold text-emerald-300 mt-1">
                          {diagnostics.allocatable.memory}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Capacity: {diagnostics.capacity.memory}</div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                        <div className="text-slate-400 text-[11px]">Max Pods</div>
                        <div className="text-lg font-bold text-purple-300 mt-1">
                          {diagnostics.allocatable.pods}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Pod capacity limit</div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                        <div className="text-slate-400 text-[11px]">Ephemeral Storage</div>
                        <div className="text-lg font-bold text-amber-300 mt-1">
                          {diagnostics.allocatable.ephemeralStorage || '-'}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Capacity: {diagnostics.capacity.ephemeralStorage || '-'}</div>
                      </div>
                    </div>
                  </div>

                  {/* System Info & Taints */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* System Information */}
                    <div
                      className="p-4 rounded-xl border font-mono text-xs space-y-2"
                      style={{
                        backgroundColor: 'var(--bg-input, #0f172a)',
                        borderColor: 'var(--border-color, #1e293b)',
                      }}
                    >
                      <h3 className="text-xs font-bold font-mono uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        <HardDrive size={14} style={{ color: 'var(--accent-green, #10b981)' }} />
                        <span>System & Runtime Environment</span>
                      </h3>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div><span className="text-slate-400">OS Image:</span> <span className="text-slate-200">{diagnostics.systemInfo.osImage}</span></div>
                        <div><span className="text-slate-400">Kernel:</span> <span className="text-slate-200">{diagnostics.systemInfo.kernelVersion}</span></div>
                        <div><span className="text-slate-400">Container Runtime:</span> <span className="text-cyan-300">{diagnostics.systemInfo.containerRuntime}</span></div>
                        <div><span className="text-slate-400">Kubelet Version:</span> <span className="text-purple-300">{diagnostics.systemInfo.kubeletVersion}</span></div>
                        <div><span className="text-slate-400">Architecture:</span> <span className="text-slate-200">{diagnostics.systemInfo.architecture}</span></div>
                        <div><span className="text-slate-400">OS:</span> <span className="text-slate-200">{diagnostics.systemInfo.operatingSystem}</span></div>
                      </div>
                    </div>

                    {/* Taints & Addresses */}
                    <div
                      className="p-4 rounded-xl border font-mono text-xs space-y-2"
                      style={{
                        backgroundColor: 'var(--bg-input, #0f172a)',
                        borderColor: 'var(--border-color, #1e293b)',
                      }}
                    >
                      <h3 className="text-xs font-bold font-mono uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        <ShieldAlert size={14} style={{ color: 'var(--accent-yellow, #f59e0b)' }} />
                        <span>Taints & Network Addresses</span>
                      </h3>

                      <div className="space-y-2">
                        <div>
                          <div className="text-[11px] text-slate-400 mb-1">Addresses:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {diagnostics.addresses.map((a) => (
                              <span key={a.address} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                                <span className="text-slate-400">{a.type}:</span> <span className="text-cyan-300 font-bold">{a.address}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400 mb-1">Taints:</div>
                          {diagnostics.taints.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {diagnostics.taints.map((t, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-[11px]">
                                  {t.key}{t.value ? `=${t.value}` : ''}:{t.effect}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* TAB 3: NODE EVENTS */}
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
                  No warning or normal events reported for this node.
                </div>
              )}
            </div>
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
            <Bug size={12} style={{ color: 'var(--accent-purple, #a855f7)' }} />
            <span>OpenShift Node Host Debugger • {theme.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <span>Press Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
