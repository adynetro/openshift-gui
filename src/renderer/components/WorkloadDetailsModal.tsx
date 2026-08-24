import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Layers,
  Layers2,
  Server,
  Cpu,
  Box,
  Terminal,
  FileCode2,
  FileText,
  SlidersHorizontal,
  RefreshCw,
  Clock,
  HardDrive,
  Network,
  Tag,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Zap,
  SquareTerminal,
  ScrollText,
} from 'lucide-react';
import { ResourceItem, WorkloadDetails, WorkloadRevisionItem, WorkloadPodItem } from '../../types/k8s.js';

interface WorkloadDetailsModalProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onAction: (actionType: string, targetItem?: ResourceItem) => void;
  onOpenPodTerminal?: (podName: string) => void;
  onOpenPodLogs?: (podName: string) => void;
  onOpenPodDescribe?: (podName: string) => void;
  onOpenPodYaml?: (podName: string) => void;
}

export const WorkloadDetailsModal: React.FC<WorkloadDetailsModalProps> = ({
  item,
  namespace,
  onClose,
  onAction,
  onOpenPodTerminal,
  onOpenPodLogs,
  onOpenPodDescribe,
  onOpenPodYaml,
}) => {
  const [details, setDetails] = useState<WorkloadDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedImage, setCopiedImage] = useState<string | null>(null);

  const fetchDetails = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      setError(null);
      const res = await (window as any).electronAPI.getWorkloadDetails(item.kind, item.name, namespace);
      if (res.error) {
        setError(res.error);
      } else if (res.details) {
        setDetails(res.details);
      }
    } catch (err: any) {
      if (!isBackground) setError(err.message || 'Failed to fetch workload details');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [item.kind, item.name, namespace]);

  useEffect(() => {
    fetchDetails(false);
    const interval = setInterval(() => {
      fetchDetails(true);
    }, 3500);
    return () => clearInterval(interval);
  }, [fetchDetails]);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedImage(text);
    setTimeout(() => setCopiedImage(null), 2000);
  };

  const getStatusBadge = (status: string, color?: string) => {
    const s = (status || 'Unknown').toLowerCase();
    let bg = 'bg-slate-800 text-slate-300 border-slate-700';
    let Icon = CheckCircle2;

    if (s.includes('running') || s.includes('complete') || s.includes('active') || color === 'green') {
      bg = 'bg-emerald-950/70 text-emerald-300 border-emerald-800';
      Icon = CheckCircle2;
    } else if (s.includes('fail') || s.includes('crash') || s.includes('error') || color === 'red') {
      bg = 'bg-rose-950/70 text-rose-300 border-rose-800';
      Icon = XCircle;
    } else if (s.includes('pending') || s.includes('scaled down') || color === 'yellow') {
      bg = 'bg-amber-950/70 text-amber-300 border-amber-800';
      Icon = AlertTriangle;
    }

    return (
      <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium border flex items-center gap-1 w-fit ${bg}`}>
        <Icon size={12} />
        <span>{status}</span>
      </span>
    );
  };

  const getKindIcon = () => {
    switch (item.kind) {
      case 'deploymentconfigs':
        return <Layers2 size={20} className="text-red-400" />;
      case 'deployments':
        return <Layers size={20} className="text-blue-400" />;
      case 'statefulsets':
        return <Server size={20} className="text-purple-400" />;
      case 'daemonsets':
        return <Cpu size={20} className="text-amber-400" />;
      default:
        return <Box size={20} className="text-cyan-400" />;
    }
  };

  const isDc = item.kind === 'deploymentconfigs';
  const revisionKindLabel = isDc ? 'Replication Controllers' : item.kind === 'statefulsets' ? 'Controller Revisions' : 'ReplicaSets';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-in fade-in duration-150 select-none"
    >
      <div className="rounded-xl shadow-2xl w-[96vw] max-w-[1750px] h-[94vh] flex flex-col overflow-hidden border transition-colors" style={{ backgroundColor: "var(--bg-card, #1e293b)", borderColor: "var(--border-color, #334155)", color: "var(--text-main, #f8fafc)" }}>
        {/* Monokai Header */}
        <div className="p-3.5 border-b flex items-center justify-between shrink-0" style={{ backgroundColor: "var(--bg-card-header, #0f172a)", borderColor: "var(--border-color, #334155)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center border" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}>
              {getKindIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span className="font-mono font-bold text-cyan-400">{item.name}</span>
                </h2>
                <span className="px-2 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                  {item.kind}
                </span>
                <span className="px-2 py-0.2 rounded bg-cyan-950/60 border border-cyan-800 text-[10px] text-cyan-300 font-mono">
                  Project: {details?.namespace || namespace}
                </span>
                {details && (
                  <span className="px-2 py-0.2 rounded bg-[#a6e22e]/20 border border-[#a6e22e]/40 text-[10px] text-emerald-400 font-mono font-bold">
                    Replicas: {details.readyReplicas}/{details.desiredReplicas} Ready
                  </span>
                )}
              </div>
              <p className="text-[11px] opacity-60 font-mono">
                Hierarchy drilldown: Workload → Replicas & Revisions → Live Pods
              </p>
            </div>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAction('logs', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#a6e22e]/15 hover:bg-[#a6e22e]/30 text-emerald-400 border border-[#a6e22e]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Stream aggregated logs across all pods"
            >
              <Terminal size={13} />
              <span>Logs</span>
            </button>

            <button
              onClick={() => onAction('edit-yaml', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#66d9ef]/15 hover:bg-[#66d9ef]/30 text-cyan-400 border border-[#66d9ef]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Open interactive IDE YAML editor"
            >
              <FileCode2 size={13} />
              <span>Edit YAML</span>
            </button>

            <button
              onClick={() => onAction('scale', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#ae81ff]/15 hover:bg-[#ae81ff]/30 text-purple-400 border border-[#ae81ff]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Scale Replicas"
            >
              <SlidersHorizontal size={13} />
              <span>Scale</span>
            </button>

            <button
              onClick={() => onAction('restart', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#fd971f]/15 hover:bg-[#fd971f]/30 text-amber-400 border border-[#fd971f]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Rollout Restart / Latest"
            >
              <RefreshCw size={13} />
              <span>Restart</span>
            </button>

            <button
              onClick={() => onAction('describe', item)}
              className="px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors opacity-80 hover:opacity-100" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}
              title="Describe Resource Details"
            >
              <FileText size={13} />
              <span>Describe</span>
            </button>

            <button
              onClick={() => fetchDetails(false)}
              disabled={loading}
              className="p-1.5 rounded-lg border transition-colors opacity-80 hover:opacity-100 disabled:opacity-50" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}
              title="Refresh workload details"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-cyan-400' : ''} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/10 transition-colors ml-1"
              title="Close window (Esc)"
              aria-label="Close window"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && !details && (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="animate-spin text-cyan-400" size={28} />
              <p className="text-sm font-mono opacity-60">Loading revisions and live pod statuses...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs font-mono">
              <div className="font-bold flex items-center gap-2 mb-1">
                <AlertTriangle size={15} className="text-rose-400" />
                <span>Error fetching details</span>
              </div>
              <p>{error}</p>
            </div>
          )}

          {details && (
            <>
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}>
                  <div className="text-[11px] font-bold opacity-60 uppercase tracking-wider mb-1">Strategy</div>
                  <div className="text-sm font-semibold font-mono text-cyan-400">{details.strategy || 'Rolling'}</div>
                </div>

                <div className="p-3 rounded-lg border" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}>
                  <div className="text-[11px] font-bold opacity-60 uppercase tracking-wider mb-1">Triggers</div>
                  <div className="text-sm font-semibold font-mono text-amber-400">{details.triggers || 'Config'}</div>
                </div>

                <div className="p-3 rounded-lg border" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}>
                  <div className="text-[11px] font-bold opacity-60 uppercase tracking-wider mb-1">Replicas</div>
                  <div className="text-sm font-semibold font-mono text-emerald-400">
                    {details.readyReplicas} / {details.desiredReplicas} Ready
                  </div>
                </div>

                <div className="p-3 rounded-lg border" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}>
                  <div className="text-[11px] font-bold opacity-60 uppercase tracking-wider mb-1">Active Revisions</div>
                  <div className="text-sm font-semibold font-mono text-purple-400">
                    {details.revisions.length} total ({details.revisions.filter((r) => r.active).length} active)
                  </div>
                </div>
              </div>

              {/* Images & Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Images */}
                <div className="p-3 rounded-lg border space-y-1.5" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}>
                  <div className="text-[11px] font-bold opacity-60 uppercase tracking-wider flex items-center gap-1.5">
                    <HardDrive size={12} className="text-cyan-400" />
                    <span>Container Images</span>
                  </div>
                  <div className="space-y-1">
                    {details.images.length === 0 ? (
                      <span className="text-xs opacity-60 font-mono">No images defined</span>
                    ) : (
                      details.images.map((img, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-white/5 px-2.5 py-1 rounded border border-[var(--border-subtle,#334155)] text-xs font-mono text-slate-200 group"
                        >
                          <span className="truncate max-w-[480px]" title={img}>
                            {img}
                          </span>
                          <button
                            onClick={() => handleCopy(img)}
                            className="opacity-60 hover:text-emerald-400 transition-colors p-1"
                            title="Copy image reference"
                          >
                            {copiedImage === img ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Selectors */}
                <div className="p-3 rounded-lg border space-y-1.5" style={{ backgroundColor: "var(--bg-input, #0f172a)", borderColor: "var(--border-subtle, #334155)" }}>
                  <div className="text-[11px] font-bold opacity-60 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag size={12} className="text-purple-400" />
                    <span>Selector Labels</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(details.selectors || {}).length === 0 ? (
                      <span className="text-xs opacity-60 font-mono">No selector labels</span>
                    ) : (
                      Object.entries(details.selectors || {}).map(([k, v]) => (
                        <span
                          key={k}
                          className="px-2 py-0.5 rounded bg-white/5 border border-[var(--border-subtle,#334155)] text-[11px] font-mono text-slate-300"
                        >
                          <strong className="text-cyan-400">{k}</strong>: {v}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 1. Replication Controllers / ReplicaSets Section */}
              <div className="bg-[var(--bg-input,#0f172a)] border border-[var(--border-subtle,#334155)] rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-white/5 border-b border-[var(--border-subtle,#334155)] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Layers2 size={14} className="text-amber-400" />
                    <span>{revisionKindLabel} ({details.revisions.length})</span>
                  </h3>
                  <span className="text-[11px] opacity-60 font-mono">Sorted by latest revision</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle,#334155)] opacity-60 font-mono text-[11px] bg-[var(--bg-input,#0f172a)]/60">
                        <th className="py-2 px-3 font-semibold">Revision</th>
                        <th className="py-2 px-3 font-semibold">Name</th>
                        <th className="py-2 px-3 font-semibold">Status / Phase</th>
                        <th className="py-2 px-3 font-semibold">Replicas (Ready/Desired)</th>
                        <th className="py-2 px-3 font-semibold">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle,#334155)] font-mono">
                      {details.revisions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center opacity-60">
                            No {revisionKindLabel.toLowerCase()} found for this workload.
                          </td>
                        </tr>
                      ) : (
                        details.revisions.map((rev) => (
                          <tr
                            key={rev.name}
                            className={`hover:bg-white/5 transition-colors ${
                              rev.active ? 'bg-[#a6e22e]/5' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
                                  rev.active
                                    ? 'bg-[#a6e22e]/20 text-emerald-400 border-[#a6e22e]/40'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                rev {rev.revision} {rev.active && '• Active'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-bold font-bold">{rev.name}</td>
                            <td className="py-2.5 px-3">{getStatusBadge(rev.status, rev.statusColor)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-200">
                              {rev.ready} / {rev.desired}
                            </td>
                            <td className="py-2.5 px-3 opacity-60">{rev.age}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Live Pods Section */}
              <div className="bg-[var(--bg-input,#0f172a)] border border-[var(--border-subtle,#334155)] rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-white/5 border-b border-[var(--border-subtle,#334155)] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Box size={14} className="text-cyan-400" />
                    <span>Live Pods ({details.pods.length})</span>
                  </h3>
                  <span className="text-[11px] opacity-60 font-mono">
                    Direct actions available per pod
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle,#334155)] opacity-60 font-mono text-[11px] bg-[var(--bg-input,#0f172a)]/60">
                        <th className="py-2 px-3 font-semibold">Pod Name</th>
                        <th className="py-2 px-3 font-semibold">Status</th>
                        <th className="py-2 px-3 font-semibold">Containers Ready</th>
                        <th className="py-2 px-3 font-semibold">Restarts</th>
                        <th className="py-2 px-3 font-semibold">Node</th>
                        <th className="py-2 px-3 font-semibold">IP</th>
                        <th className="py-2 px-3 font-semibold">Age</th>
                        <th className="py-2 px-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle,#334155)] font-mono">
                      {details.pods.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-6 text-center opacity-60">
                            No active pods currently running for this workload (Replicas = 0).
                          </td>
                        </tr>
                      ) : (
                        details.pods.map((pod) => (
                          <tr key={pod.name} className="hover:bg-white/5 transition-colors group">
                            <td className="py-2.5 px-3 font-bold text-cyan-400">{pod.name}</td>
                            <td className="py-2.5 px-3">{getStatusBadge(pod.status, pod.statusColor)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-200">{pod.ready}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[11px] ${
                                  pod.restarts > 0 ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'opacity-60'
                                }`}
                              >
                                {pod.restarts}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 flex items-center gap-1">
                              <HardDrive size={11} className="opacity-60" />
                              <span>{pod.node}</span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">{pod.ip}</td>
                            <td className="py-2.5 px-3 opacity-60">{pod.age}</td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    if (onOpenPodTerminal) {
                                      onOpenPodTerminal(pod.name);
                                    } else {
                                      onAction('terminal', {
                                        id: pod.name,
                                        name: pod.name,
                                        namespace: pod.namespace,
                                        kind: 'pods',
                                        status: pod.status,
                                        age: pod.age,
                                      });
                                    }
                                  }}
                                  className="p-1 rounded bg-white/5 hover:bg-cyan-950 text-cyan-400 border border-[var(--border-subtle,#334155)] hover:border-cyan-500 transition-colors"
                                  title="Open interactive terminal (Shell)"
                                >
                                  <SquareTerminal size={12} />
                                </button>

                                <button
                                  onClick={() => {
                                    if (onOpenPodLogs) {
                                      onOpenPodLogs(pod.name);
                                    } else {
                                      onAction('logs', {
                                        id: pod.name,
                                        name: pod.name,
                                        namespace: pod.namespace,
                                        kind: 'pods',
                                        status: pod.status,
                                        age: pod.age,
                                      });
                                    }
                                  }}
                                  className="p-1 rounded bg-white/5 hover:bg-emerald-950 text-emerald-400 border border-[var(--border-subtle,#334155)] hover:border-emerald-500 transition-colors"
                                  title="Stream logs for this pod"
                                >
                                  <ScrollText size={12} />
                                </button>

                                <button
                                  onClick={() => {
                                    if (onOpenPodDescribe) {
                                      onOpenPodDescribe(pod.name);
                                    } else {
                                      onAction('describe', {
                                        id: pod.name,
                                        name: pod.name,
                                        namespace: pod.namespace,
                                        kind: 'pods',
                                        status: pod.status,
                                        age: pod.age,
                                      });
                                    }
                                  }}
                                  className="p-1 rounded bg-white/5 hover:bg-slate-700 text-slate-300 hover:text-white border border-[var(--border-subtle,#334155)] transition-colors"
                                  title="Describe this pod"
                                >
                                  <FileText size={12} />
                                </button>

                                <button
                                  onClick={() => {
                                    if (onOpenPodYaml) {
                                      onOpenPodYaml(pod.name);
                                    } else {
                                      onAction('yaml', {
                                        id: pod.name,
                                        name: pod.name,
                                        namespace: pod.namespace,
                                        kind: 'pods',
                                        status: pod.status,
                                        age: pod.age,
                                      });
                                    }
                                  }}
                                  className="p-1 rounded bg-white/5 hover:bg-slate-700 text-slate-300 hover:text-white border border-[var(--border-subtle,#334155)] transition-colors"
                                  title="View YAML definition for this pod"
                                >
                                  <FileCode2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
