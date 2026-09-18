import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Radio,
  ExternalLink,
  Copy,
  Check,
  Square,
  Play,
  StopCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Server,
  Network,
  Box,
  Layers,
} from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';
import { useCurrentTheme } from '../utils/themes.js';

interface PortForwardModalProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

interface DetectedPort {
  port: number;
  targetPort?: number | string;
  name?: string;
  protocol?: string;
  nodePort?: number;
}

interface ActiveSession {
  id: string;
  kind: 'services' | 'pods' | 'routes' | 'ingresses';
  name: string;
  namespace: string;
  localPort: number;
  targetPort: number | string;
  status: 'starting' | 'active' | 'error' | 'stopped';
  url: string;
  startedAt: string;
  error?: string;
}

export const PortForwardModal: React.FC<PortForwardModalProps> = ({
  item,
  namespace,
  onClose,
  onSuccess,
}) => {
  const { theme } = useCurrentTheme();
  const [detectedPorts, setDetectedPorts] = useState<DetectedPort[]>([]);
  const [localPort, setLocalPort] = useState<string>('8080');
  const [targetPort, setTargetPort] = useState<string>('80');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  const actualNamespace = item.namespace || (namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : 'default');

  const refreshSessions = async () => {
    const api = (window as any).electronAPI;
    if (api?.listPortForwards) {
      try {
        const list = await api.listPortForwards();
        setActiveSessions(list || []);
      } catch {}
    }
  };

  useEffect(() => {
    let isMounted = true;
    const api = (window as any).electronAPI;

    async function loadPorts() {
      setLoading(true);
      try {
        if (api?.getPortForwardPorts) {
          const res = await api.getPortForwardPorts(item.kind, item.name, actualNamespace);
          if (!isMounted) return;
          if (res && Array.isArray(res.ports) && res.ports.length > 0) {
            setDetectedPorts(res.ports);
            const first = res.ports[0];
            setTargetPort(String(first.targetPort || first.port || 80));
            setLocalPort(String(res.defaultLocalPort || first.port || 8080));
          } else {
            setLocalPort('8080');
            setTargetPort('80');
          }
        }
        await refreshSessions();
      } catch (err: any) {
        if (isMounted) setErrorMessage(err.message || 'Failed to detect ports');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadPorts();

    const interval = setInterval(refreshSessions, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [item.name, item.kind, actualNamespace]);

  const currentActiveSession = useMemo(() => {
    return activeSessions.find(
      (s) => s.name === item.name && s.namespace === actualNamespace && s.status === 'active'
    );
  }, [activeSessions, item.name, actualNamespace]);

  const handleStartForward = async () => {
    const lPort = parseInt(localPort, 10);
    const tPort = targetPort.trim();

    if (isNaN(lPort) || lPort <= 0 || lPort > 65535) {
      setErrorMessage('Please provide a valid local TCP port between 1 and 65535.');
      return;
    }
    if (!tPort) {
      setErrorMessage('Please specify target port.');
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      const api = (window as any).electronAPI;
      if (!api?.startPortForward) throw new Error('Port forward API not available');

      const session = await api.startPortForward(item.kind, item.name, actualNamespace, lPort, tPort);
      await refreshSessions();
      if (onSuccess) onSuccess(`Port forward active: http://localhost:${lPort} -> ${tPort}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start port forward');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopForward = async (sessionId: string) => {
    setActionLoading(true);
    try {
      const api = (window as any).electronAPI;
      if (api?.stopPortForward) {
        await api.stopPortForward(sessionId);
        await refreshSessions();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to stop port forward');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenBrowser = (url: string) => {
    const api = (window as any).electronAPI;
    if (api?.openExternal) {
      api.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleCopyUrl = (sessionId: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedSessionId(sessionId);
    setTimeout(() => setCopiedSessionId(null), 2000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !currentActiveSession && !actionLoading) {
        handleStartForward();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, currentActiveSession, actionLoading, localPort, targetPort]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none font-sans"
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-subtle, #334155)',
          color: 'var(--text-main, #f8fafc)',
        }}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #1e293b)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center border"
              style={{
                backgroundColor: `${theme.cssVars['--accent-cyan'] || '#06b6d4'}20`,
                borderColor: `${theme.cssVars['--accent-cyan'] || '#06b6d4'}40`,
                color: 'var(--accent-cyan, #06b6d4)',
              }}
            >
              <Radio size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <span>Port Forwarding:</span>
                <span className="font-mono text-cyan-300">{item.name}</span>
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Kind: <strong className="text-slate-200">{item.kind}</strong> • Project: <strong className="text-purple-300">{actualNamespace}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close window (Esc)"
            aria-label="Close window"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border-b border-rose-800 text-xs font-semibold text-rose-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-slate-400 hover:text-white text-xs px-1">
              ✕
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 space-y-5 flex-1 overflow-auto">
          {/* Active Forward Status Card if running */}
          {currentActiveSession && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-950/60 to-slate-900 border border-cyan-500/50 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 -ml-4.5" />
                  <span className="text-xs font-bold text-emerald-300 font-mono">PORT FORWARD ACTIVE</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {currentActiveSession.localPort} → {currentActiveSession.targetPort}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="font-mono text-xs font-bold text-cyan-300 select-all">
                  {currentActiveSession.url}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopyUrl(currentActiveSession.id, currentActiveSession.url)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
                    title="Copy URL"
                  >
                    {copiedSessionId === currentActiveSession.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span className="text-[11px]">{copiedSessionId === currentActiveSession.id ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenBrowser(currentActiveSession.url)}
                    className="px-2.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                    title="Open in default browser"
                  >
                    <ExternalLink size={13} />
                    <span>Open in Browser</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() => handleStopForward(currentActiveSession.id)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <StopCircle size={13} />
                  <span>Stop Forwarding</span>
                </button>
              </div>
            </div>
          )}

          {/* Forwarding Configuration Form */}
          <div className="space-y-4">
            {/* Detected Ports Selection */}
            {detectedPorts.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Network size={13} className="text-cyan-400" />
                  <span>Detected Resource Ports (click to select):</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {detectedPorts.map((p, idx) => {
                    const isSelected = targetPort === String(p.targetPort || p.port);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setTargetPort(String(p.targetPort || p.port));
                          setLocalPort(String(p.port || p.targetPort || 8080));
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-500 font-bold shadow-sm'
                            : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:border-slate-500'
                        }`}
                      >
                        <span>{p.port}/{p.protocol || 'TCP'}</span>
                        {p.name && <span className="text-[10px] text-slate-400 font-sans">({p.name})</span>}
                        {isSelected && <Check size={12} className="text-cyan-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Local & Target Port Inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <span>Local Port (Your Mac/PC):</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)}
                  placeholder="e.g. 8080"
                  className="w-full px-3 py-2 rounded-lg border text-xs font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  style={{
                    backgroundColor: 'var(--bg-input, #0f172a)',
                    borderColor: 'var(--border-subtle, #334155)',
                    color: 'var(--text-main, #f8fafc)',
                  }}
                />
                <span className="text-[10px] text-slate-400 font-mono">Accessible at localhost:{localPort || 8080}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <span>Target Port ({item.kind}):</span>
                </label>
                <input
                  type="text"
                  value={targetPort}
                  onChange={(e) => setTargetPort(e.target.value)}
                  placeholder="e.g. 80 or 8080"
                  className="w-full px-3 py-2 rounded-lg border text-xs font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  style={{
                    backgroundColor: 'var(--bg-input, #0f172a)',
                    borderColor: 'var(--border-subtle, #334155)',
                    color: 'var(--text-main, #f8fafc)',
                  }}
                />
                <span className="text-[10px] text-slate-400 font-mono">Container / Service port</span>
              </div>
            </div>

            {/* Start Button */}
            {!currentActiveSession && (
              <button
                type="button"
                onClick={handleStartForward}
                disabled={actionLoading || loading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                <span>Start Port Forwarding (localhost:{localPort} → {targetPort})</span>
              </button>
            )}
          </div>

          {/* Active Sessions across cluster */}
          {activeSessions.length > 0 && (
            <div className="pt-4 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 font-mono">
                <span>Active Port Forward Sessions ({activeSessions.length}):</span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-auto">
                {activeSessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-bold text-cyan-300 truncate max-w-[140px]">{s.name}</span>
                      <span className="text-slate-400">({s.namespace})</span>
                      <ArrowRight size={11} className="text-slate-500" />
                      <span className="text-emerald-300 font-semibold">{s.localPort}→{s.targetPort}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenBrowser(s.url)}
                        className="p-1 rounded bg-slate-800 hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 transition-colors"
                        title="Open in Browser"
                      >
                        <ExternalLink size={12} />
                      </button>
                      <button
                        onClick={() => handleStopForward(s.id)}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400 transition-colors"
                        title="Stop Session"
                      >
                        <StopCircle size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-3 border-t flex items-center justify-between text-xs font-mono shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #1e293b)',
            color: 'var(--text-muted, #94a3b8)',
          }}
        >
          <span>Native kubectl/oc tunnel • Press <strong>Esc</strong> to close</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
