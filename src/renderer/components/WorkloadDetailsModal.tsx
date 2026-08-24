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
} from 'lucide-react';
import { ResourceItem, WorkloadDetails, WorkloadRevisionItem, WorkloadPodItem } from '../../types/k8s.js';

interface WorkloadDetailsModalProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onAction: (actionType: string, targetItem?: ResourceItem) => void;
  onOpenPodLogs?: (podName: string) => void;
  onOpenPodDescribe?: (podName: string) => void;
  onOpenPodYaml?: (podName: string) => void;
}

export const WorkloadDetailsModal: React.FC<WorkloadDetailsModalProps> = ({
  item,
  namespace,
  onClose,
  onAction,
  onOpenPodLogs,
  onOpenPodDescribe,
  onOpenPodYaml,
}) => {
  const [details, setDetails] = useState<WorkloadDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedImage, setCopiedImage] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await (window as any).electronAPI.getWorkloadDetails(item.kind, item.name, namespace);
      if (res.error) {
        setError(res.error);
      } else if (res.details) {
        setDetails(res.details);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch workload details');
    } finally {
      setLoading(false);
    }
  }, [item.kind, item.name, namespace]);

  useEffect(() => {
    fetchDetails();
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
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-[96vw] max-w-[1750px] h-[94vh] flex flex-col overflow-hidden text-[#f8f8f2]">
        {/* Monokai Header */}
        <div className="p-3.5 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#3e3d32] flex items-center justify-center border border-[#49483e]">
              {getKindIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#f8f8f2] flex items-center gap-2">
                  <span className="text-[#66d9ef] font-mono">{item.name}</span>
                </h2>
                <span className="px-2 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                  {item.kind}
                </span>
                <span className="px-2 py-0.2 rounded bg-cyan-950/60 border border-cyan-800 text-[10px] text-cyan-300 font-mono">
                  Project: {details?.namespace || namespace}
                </span>
                {details && (
                  <span className="px-2 py-0.2 rounded bg-[#a6e22e]/20 border border-[#a6e22e]/40 text-[10px] text-[#a6e22e] font-mono font-bold">
                    Replicas: {details.readyReplicas}/{details.desiredReplicas} Ready
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#75715e] font-mono">
                Hierarchy drilldown: Workload → Replicas & Revisions → Live Pods
              </p>
            </div>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAction('logs', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#a6e22e]/15 hover:bg-[#a6e22e]/30 text-[#a6e22e] border border-[#a6e22e]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Stream aggregated logs across all pods"
            >
              <Terminal size={13} />
              <span>Logs</span>
            </button>

            <button
              onClick={() => onAction('edit-yaml', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#66d9ef]/15 hover:bg-[#66d9ef]/30 text-[#66d9ef] border border-[#66d9ef]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Open interactive IDE YAML editor"
            >
              <FileCode2 size={13} />
              <span>Edit YAML</span>
            </button>

            <button
              onClick={() => onAction('scale', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#ae81ff]/15 hover:bg-[#ae81ff]/30 text-[#ae81ff] border border-[#ae81ff]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Scale Replicas"
            >
              <SlidersHorizontal size={13} />
              <span>Scale</span>
            </button>

            <button
              onClick={() => onAction('restart', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#fd971f]/15 hover:bg-[#fd971f]/30 text-[#fd971f] border border-[#fd971f]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Rollout Restart / Latest"
            >
              <RefreshCw size={13} />
              <span>Restart</span>
            </button>

            <button
              onClick={() => onAction('describe', item)}
              className="px-2.5 py-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-slate-300 hover:text-white border border-[#49483e] text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Describe Resource Details"
            >
              <FileText size={13} />
              <span>Describe</span>
            </button>

            <button
              onClick={fetchDetails}
              disabled={loading}
              className="p-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-[#75715e] hover:text-[#f8f8f2] border border-[#49483e] transition-colors disabled:opacity-50"
              title="Refresh workload details"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-[#66d9ef]' : ''} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#75715e] hover:text-[#f8f8f2] hover:bg-[#3e3d32] transition-colors ml-1"
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
              <RefreshCw className="animate-spin text-[#66d9ef]" size={28} />
              <p className="text-sm font-mono text-[#75715e]">Loading revisions and live pod statuses...</p>
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
                <div className="p-3 bg-[#272822] border border-[#3e3d32] rounded-lg">
                  <div className="text-[11px] font-bold text-[#75715e] uppercase tracking-wider mb-1">Strategy</div>
                  <div className="text-sm font-semibold font-mono text-[#66d9ef]">{details.strategy || 'Rolling'}</div>
                </div>

                <div className="p-3 bg-[#272822] border border-[#3e3d32] rounded-lg">
                  <div className="text-[11px] font-bold text-[#75715e] uppercase tracking-wider mb-1">Triggers</div>
                  <div className="text-sm font-semibold font-mono text-[#fd971f]">{details.triggers || 'Config'}</div>
                </div>

                <div className="p-3 bg-[#272822] border border-[#3e3d32] rounded-lg">
                  <div className="text-[11px] font-bold text-[#75715e] uppercase tracking-wider mb-1">Replicas</div>
                  <div className="text-sm font-semibold font-mono text-[#a6e22e]">
                    {details.readyReplicas} / {details.desiredReplicas} Ready
                  </div>
                </div>

                <div className="p-3 bg-[#272822] border border-[#3e3d32] rounded-lg">
                  <div className="text-[11px] font-bold text-[#75715e] uppercase tracking-wider mb-1">Active Revisions</div>
                  <div className="text-sm font-semibold font-mono text-[#ae81ff]">
                    {details.revisions.length} total ({details.revisions.filter((r) => r.active).length} active)
                  </div>
                </div>
              </div>

              {/* Images & Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Images */}
                <div className="p-3 bg-[#272822] border border-[#3e3d32] rounded-lg space-y-1.5">
                  <div className="text-[11px] font-bold text-[#75715e] uppercase tracking-wider flex items-center gap-1.5">
                    <HardDrive size={12} className="text-[#66d9ef]" />
                    <span>Container Images</span>
                  </div>
                  <div className="space-y-1">
                    {details.images.length === 0 ? (
                      <span className="text-xs text-[#75715e] font-mono">No images defined</span>
                    ) : (
                      details.images.map((img, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-[#1e1f1c] px-2.5 py-1 rounded border border-[#3e3d32] text-xs font-mono text-slate-200 group"
                        >
                          <span className="truncate max-w-[480px]" title={img}>
                            {img}
                          </span>
                          <button
                            onClick={() => handleCopy(img)}
                            className="text-[#75715e] hover:text-[#a6e22e] transition-colors p-1"
                            title="Copy image reference"
                          >
                            {copiedImage === img ? <Check size={12} className="text-[#a6e22e]" /> : <Copy size={12} />}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Selectors */}
                <div className="p-3 bg-[#272822] border border-[#3e3d32] rounded-lg space-y-1.5">
                  <div className="text-[11px] font-bold text-[#75715e] uppercase tracking-wider flex items-center gap-1.5">
                    <Tag size={12} className="text-[#ae81ff]" />
                    <span>Selector Labels</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(details.selectors || {}).length === 0 ? (
                      <span className="text-xs text-[#75715e] font-mono">No selector labels</span>
                    ) : (
                      Object.entries(details.selectors || {}).map(([k, v]) => (
                        <span
                          key={k}
                          className="px-2 py-0.5 rounded bg-[#1e1f1c] border border-[#3e3d32] text-[11px] font-mono text-slate-300"
                        >
                          <strong className="text-[#66d9ef]">{k}</strong>: {v}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 1. Replication Controllers / ReplicaSets Section */}
              <div className="bg-[#272822] border border-[#3e3d32] rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-[#1e1f1c] border-b border-[#3e3d32] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Layers2 size={14} className="text-[#fd971f]" />
                    <span>{revisionKindLabel} ({details.revisions.length})</span>
                  </h3>
                  <span className="text-[11px] text-[#75715e] font-mono">Sorted by latest revision</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#3e3d32] text-[#75715e] font-mono text-[11px] bg-[#272822]/60">
                        <th className="py-2 px-3 font-semibold">Revision</th>
                        <th className="py-2 px-3 font-semibold">Name</th>
                        <th className="py-2 px-3 font-semibold">Status / Phase</th>
                        <th className="py-2 px-3 font-semibold">Replicas (Ready/Desired)</th>
                        <th className="py-2 px-3 font-semibold">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#3e3d32]/60 font-mono">
                      {details.revisions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-[#75715e]">
                            No {revisionKindLabel.toLowerCase()} found for this workload.
                          </td>
                        </tr>
                      ) : (
                        details.revisions.map((rev) => (
                          <tr
                            key={rev.name}
                            className={`hover:bg-[#3e3d32]/30 transition-colors ${
                              rev.active ? 'bg-[#a6e22e]/5' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
                                  rev.active
                                    ? 'bg-[#a6e22e]/20 text-[#a6e22e] border-[#a6e22e]/40'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                rev {rev.revision} {rev.active && '• Active'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-[#f8f8f2]">{rev.name}</td>
                            <td className="py-2.5 px-3">{getStatusBadge(rev.status, rev.statusColor)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-200">
                              {rev.ready} / {rev.desired}
                            </td>
                            <td className="py-2.5 px-3 text-[#75715e]">{rev.age}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Live Pods Section */}
              <div className="bg-[#272822] border border-[#3e3d32] rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-[#1e1f1c] border-b border-[#3e3d32] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Box size={14} className="text-[#66d9ef]" />
                    <span>Live Pods ({details.pods.length})</span>
                  </h3>
                  <span className="text-[11px] text-[#75715e] font-mono">
                    Direct actions available per pod
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#3e3d32] text-[#75715e] font-mono text-[11px] bg-[#272822]/60">
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
                    <tbody className="divide-y divide-[#3e3d32]/60 font-mono">
                      {details.pods.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-[#75715e]">
                            No active pods currently running for this workload (Replicas = 0).
                          </td>
                        </tr>
                      ) : (
                        details.pods.map((pod) => (
                          <tr key={pod.name} className="hover:bg-[#3e3d32]/30 transition-colors group">
                            <td className="py-2.5 px-3 font-bold text-[#66d9ef]">{pod.name}</td>
                            <td className="py-2.5 px-3">{getStatusBadge(pod.status, pod.statusColor)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-200">{pod.ready}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[11px] ${
                                  pod.restarts > 0 ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'text-[#75715e]'
                                }`}
                              >
                                {pod.restarts}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 flex items-center gap-1">
                              <HardDrive size={11} className="text-[#75715e]" />
                              <span>{pod.node}</span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">{pod.ip}</td>
                            <td className="py-2.5 px-3 text-[#75715e]">{pod.age}</td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
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
                                  className="p-1 rounded bg-[#1e1f1c] hover:bg-emerald-950 text-emerald-400 border border-[#3e3d32] hover:border-emerald-500 transition-colors"
                                  title="Stream logs for this pod"
                                >
                                  <Terminal size={12} />
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
                                  className="p-1 rounded bg-[#1e1f1c] hover:bg-slate-700 text-slate-300 hover:text-white border border-[#3e3d32] transition-colors"
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
                                  className="p-1 rounded bg-[#1e1f1c] hover:bg-slate-700 text-slate-300 hover:text-white border border-[#3e3d32] transition-colors"
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
