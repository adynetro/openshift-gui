import React from 'react';
import {
  Terminal,
  SlidersHorizontal,
  RefreshCw,
  Sparkles,
  FileText,
  Code2,
  Trash2,
  Anchor,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  KeyRound,
  Edit3,
} from 'lucide-react';
import { ResourceKind, ResourceItem, ImageStreamResource } from '../../types/k8s.js';

interface ResourceTableProps {
  kind: ResourceKind;
  items: ResourceItem[];
  selectedItem: ResourceItem | null;
  onSelectItem: (item: ResourceItem) => void;
  loading: boolean;
  error?: string | null;
  isUnauthorized?: boolean;
  onRowAction: (actionType: string, item: ResourceItem) => void;
  onOpenContextModal?: () => void;
  onRetry?: () => void;
}

export const ResourceTable: React.FC<ResourceTableProps> = ({
  kind,
  items,
  selectedItem,
  onSelectItem,
  loading,
  error,
  isUnauthorized,
  onRowAction,
  onOpenContextModal,
  onRetry,
}) => {
  const getStatusBadge = (status: string, color?: string) => {
    const s = (status || '').toLowerCase();
    let bg = 'bg-slate-800 text-slate-300 border-slate-700';
    let Icon = Clock;

    if (s === 'running' || s === 'active' || s === 'ready' || s === 'deployed' || s === 'admitted' || s === 'completed' || s === 'succeeded') {
      bg = 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80';
      Icon = CheckCircle2;
    } else if (s.includes('crash') || s.includes('error') || s.includes('failed') || s.includes('unhealthy') || s.includes('notready')) {
      bg = 'bg-rose-950/60 text-rose-300 border-rose-800/80';
      Icon = XCircle;
    } else if (s.includes('pending') || s.includes('init') || s.includes('terminating') || s.includes('warning') || s.includes('degraded') || s.includes('superseded')) {
      bg = 'bg-amber-950/60 text-amber-300 border-amber-800/80';
      Icon = AlertTriangle;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${bg}`}>
        <Icon size={12} />
        <span>{status}</span>
      </span>
    );
  };

  // Error / Unauthorized Alert State
  if (error && items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-950/40">
          {isUnauthorized ? <KeyRound size={32} /> : <AlertTriangle size={32} />}
        </div>

        <div className="max-w-md space-y-2">
          <h3 className="text-base font-bold text-slate-100">
            {isUnauthorized ? 'OpenShift Cluster Session Expired / Unauthorized' : 'Unable to Load Cluster Resources'}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed font-mono">
            {error}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {onOpenContextModal && (
            <button
              onClick={onOpenContextModal}
              className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-950 transition-all"
            >
              <Layers size={14} />
              <span>Switch Context</span>
            </button>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-2 transition-all"
            >
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
        <RefreshCw size={28} className="animate-spin text-cyan-400" />
        <p className="text-sm font-medium">Fetching {kind} from cluster...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-500 space-y-3 text-center">
        <p className="text-base font-semibold text-slate-300">No {kind} found in this project</p>
        <p className="text-xs text-slate-500 max-w-sm">
          Try switching to another project / namespace or clearing status filters.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#0b0f19]">
      <table className="w-full text-left border-collapse text-xs">
        <thead className="sticky top-0 bg-[#0f172a] border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider z-10 select-none shadow-sm">
          <tr>
            <th className="py-3 px-4">Name</th>
            {kind === 'pods' && (
              <>
                <th className="py-3 px-3">Ready</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Restarts</th>
                <th className="py-3 px-3">Pod IP</th>
                <th className="py-3 px-3">Node</th>
              </>
            )}
            {kind === 'deploymentconfigs' && (
              <>
                <th className="py-3 px-3">Ready</th>
                <th className="py-3 px-3">Revision</th>
                <th className="py-3 px-3">Triggers</th>
                <th className="py-3 px-3">Strategy</th>
                <th className="py-3 px-3">Status</th>
              </>
            )}
            {(kind === 'deployments' || kind === 'statefulsets' || kind === 'daemonsets') && (
              <>
                <th className="py-3 px-3">Ready</th>
                <th className="py-3 px-3">Up-To-Date</th>
                <th className="py-3 px-3">Available</th>
                <th className="py-3 px-3">Status</th>
              </>
            )}
            {kind === 'services' && (
              <>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Cluster IP</th>
                <th className="py-3 px-3">Ports</th>
              </>
            )}
            {kind === 'routes' && (
              <>
                <th className="py-3 px-3">Host</th>
                <th className="py-3 px-3">Path</th>
                <th className="py-3 px-3">Service</th>
                <th className="py-3 px-3">TLS</th>
                <th className="py-3 px-3">Status</th>
              </>
            )}
            {kind === 'imagestreams' && (
              <>
                <th className="py-3 px-3">Tags Count</th>
                <th className="py-3 px-3">Latest SemVer Tags</th>
              </>
            )}
            {kind === 'helm' && (
              <>
                <th className="py-3 px-3">Revision</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Chart</th>
                <th className="py-3 px-3">App Version</th>
              </>
            )}
            {kind === 'nodes' && (
              <>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Roles</th>
                <th className="py-3 px-3">Kubelet Version</th>
              </>
            )}
            <th className="py-3 px-3">Age</th>
            <th className="py-3 px-4 text-right">Quick Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-800/60 font-sans">
          {items.map((item) => {
            const isSelected = selectedItem?.id === item.id;

            return (
              <tr
                key={item.id}
                onClick={() => onSelectItem(item)}
                className={`cursor-pointer transition-colors group ${
                  isSelected
                    ? 'bg-slate-800/90 text-white'
                    : 'hover:bg-slate-800/40 text-slate-200'
                }`}
              >
                {/* Name */}
                <td className="py-2.5 px-4 font-mono font-semibold text-slate-100 flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSelected ? 'bg-cyan-400' : 'bg-transparent group-hover:bg-slate-600'
                    }`}
                  />
                  <span className="truncate max-w-[280px]" title={item.name}>
                    {item.name}
                  </span>
                </td>

                {/* Pod Columns */}
                {kind === 'pods' && (
                  <>
                    <td className="py-2.5 px-3 font-mono text-slate-300">{item.ready || '-'}</td>
                    <td className="py-2.5 px-3">{getStatusBadge(item.status, item.statusColor)}</td>
                    <td className="py-2.5 px-3 font-mono text-amber-300">
                      {item.restarts ? `${item.restarts}x` : '0'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.ip || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 truncate max-w-[140px]" title={item.node}>
                      {item.node || '-'}
                    </td>
                  </>
                )}

                {/* DeploymentConfig Columns */}
                {kind === 'deploymentconfigs' && (
                  <>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-200">{item.ready || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-cyan-300">rev {item.extra?.revision || '1'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] truncate max-w-[160px]" title={item.extra?.triggers}>
                      {item.extra?.triggers || 'Config'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 text-[11px]">{item.extra?.strategy || 'Rolling'}</td>
                    <td className="py-2.5 px-3">{getStatusBadge(item.status, item.statusColor)}</td>
                  </>
                )}

                {/* Workload Columns */}
                {(kind === 'deployments' || kind === 'statefulsets' || kind === 'daemonsets') && (
                  <>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-200">{item.ready || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.extra?.upToDate ?? '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.extra?.available ?? '-'}</td>
                    <td className="py-2.5 px-3">{getStatusBadge(item.status, item.statusColor)}</td>
                  </>
                )}

                {/* Service Columns */}
                {kind === 'services' && (
                  <>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800 text-[11px] font-mono">
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.ip || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-amber-300 truncate max-w-[200px]" title={item.extra?.ports}>
                      {item.extra?.ports || '-'}
                    </td>
                  </>
                )}

                {/* Route Columns */}
                {kind === 'routes' && (
                  <>
                    <td className="py-2.5 px-3 font-mono text-cyan-300 truncate max-w-[220px]" title={item.extra?.host}>
                      {item.extra?.host || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.extra?.path || '/'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">{item.extra?.targetService || '-'}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-yellow-300 font-mono text-[10px]">
                        {item.extra?.tls || 'None'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">{getStatusBadge(item.status, item.statusColor)}</td>
                  </>
                )}

                {/* ImageStream Columns */}
                {kind === 'imagestreams' && (
                  <>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-bold">
                        {item.extra?.tagCount ?? 0} tags
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 truncate max-w-[320px]">
                      {((item as ImageStreamResource).tags || item.extra?.tags || [])
                        .slice(0, 4)
                        .map((t: any) => (
                          <span
                            key={t.tag}
                            className={`inline-block mr-1 px-1.5 py-0.2 rounded text-[10px] ${
                              t.isSemver
                                ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {t.tag}
                          </span>
                        ))}
                    </td>
                  </>
                )}

                {/* Helm Columns */}
                {kind === 'helm' && (
                  <>
                    <td className="py-2.5 px-3 font-mono text-slate-300">{item.extra?.revision || '1'}</td>
                    <td className="py-2.5 px-3">{getStatusBadge(item.status, item.statusColor)}</td>
                    <td className="py-2.5 px-3 font-mono text-blue-300 truncate max-w-[200px]" title={item.extra?.chart}>
                      {item.extra?.chart || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-yellow-300">{item.extra?.appVersion || '-'}</td>
                  </>
                )}

                {/* Node Columns */}
                {kind === 'nodes' && (
                  <>
                    <td className="py-2.5 px-3">{getStatusBadge(item.status, item.statusColor)}</td>
                    <td className="py-2.5 px-3 font-mono text-amber-300">{item.extra?.roles || 'worker'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.extra?.version || '-'}</td>
                  </>
                )}

                {/* Age */}
                <td className="py-2.5 px-3 font-mono text-slate-400">{item.age}</td>

                {/* Clickable Quick Action Buttons for this row */}
                <td className="py-2.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    {/* Direct Edit YAML Button for Workloads */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowAction(kind === 'helm' ? 'helm-manage' : 'edit-yaml', item);
                      }}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-emerald-950 text-emerald-400 border border-slate-700 hover:border-emerald-500 transition-colors flex items-center gap-1 font-semibold"
                      title="Edit Resource"
                    >
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </button>

                    {(kind === 'pods' || kind === 'deployments' || kind === 'deploymentconfigs') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowAction('logs', item);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-emerald-900/70 text-emerald-400 border border-slate-700 hover:border-emerald-500 transition-colors flex items-center gap-1"
                        title="Stream Live Logs"
                      >
                        <Terminal size={12} />
                        <span>Logs</span>
                      </button>
                    )}

                    {(kind === 'deployments' || kind === 'deploymentconfigs' || kind === 'statefulsets') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowAction('scale', item);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-cyan-900/70 text-cyan-400 border border-slate-700 hover:border-cyan-500 transition-colors flex items-center gap-1"
                        title="Scale Replicas"
                      >
                        <SlidersHorizontal size={12} />
                        <span>Scale</span>
                      </button>
                    )}

                    {kind === 'imagestreams' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowAction('clean-is', item);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-purple-900/70 text-purple-300 border border-slate-700 hover:border-purple-500 transition-colors flex items-center gap-1 font-semibold"
                        title="Open SemVer Cleanup Wizard"
                      >
                        <Sparkles size={12} />
                        <span>SemVer Clean</span>
                      </button>
                    )}

                    {kind === 'helm' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowAction('helm-manage', item);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-blue-900/70 text-blue-300 border border-slate-700 hover:border-blue-500 transition-colors flex items-center gap-1 font-semibold"
                        title="Manage Helm Release"
                      >
                        <Anchor size={12} />
                        <span>Manage</span>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowAction('describe', item);
                      }}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                      title="Describe Details"
                    >
                      <FileText size={12} />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowAction('yaml', item);
                      }}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                      title="View YAML"
                    >
                      <Code2 size={12} />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowAction('delete', item);
                      }}
                      className="p-1 rounded bg-slate-800 hover:bg-rose-900/80 text-rose-400 hover:text-rose-200 border border-slate-700 hover:border-rose-500 transition-colors"
                      title="Delete Resource"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
