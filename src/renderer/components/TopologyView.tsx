import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Network,
  Layers,
  Layers2,
  Server,
  Cpu,
  Box,
  HardDrive,
  ExternalLink,
  Search,
  RefreshCw,
  Terminal,
  FileCode2,
  SlidersHorizontal,
  FolderGit2,
  AlertTriangle,
  CheckCircle2,
  Database,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { TopologyData, TopologyNode, ResourceItem, ResourceKind } from '../../types/k8s.js';

interface TopologyViewProps {
  currentProject: string;
  onSelectWorkload: (item: ResourceItem) => void;
  onOpenWorkloadLogs: (item: ResourceItem) => void;
  onOpenWorkloadYaml: (item: ResourceItem) => void;
  onOpenWorkloadScale: (item: ResourceItem) => void;
  onOpenPvcResize: (item: ResourceItem) => void;
  onOpenExternal: (url: string) => void;
}

export const TopologyView: React.FC<TopologyViewProps> = ({
  currentProject,
  onSelectWorkload,
  onOpenWorkloadLogs,
  onOpenWorkloadYaml,
  onOpenWorkloadScale,
  onOpenPvcResize,
  onOpenExternal,
}) => {
  const [data, setData] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTopology = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      setError(null);
      const res = await (window as any).electronAPI.getTopologyData(currentProject);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setData(res.data);
      }
    } catch (err: any) {
      if (!isBackground) setError(err.message || 'Failed to fetch topology data');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    fetchTopology(false);
    const interval = setInterval(() => {
      fetchTopology(true);
    }, 3500);
    return () => clearInterval(interval);
  }, [fetchTopology]);

  // Group workloads by application
  const groupedWorkloads = useMemo(() => {
    if (!data?.workloads) return {};
    const filtered = data.workloads.filter((w) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        w.name.toLowerCase().includes(q) ||
        w.appName?.toLowerCase().includes(q) ||
        w.images.some((img) => img.toLowerCase().includes(q)) ||
        w.routes.some((r) => r.host.toLowerCase().includes(q))
      );
    });

    const map: Record<string, TopologyNode[]> = {};
    for (const w of filtered) {
      const app = w.appName || 'unassigned';
      if (!map[app]) map[app] = [];
      map[app].push(w);
    }
    return map;
  }, [data, searchQuery]);

  const getKindIcon = (kind: ResourceKind) => {
    switch (kind) {
      case 'deploymentconfigs':
        return <Layers2 size={16} className="text-red-400" />;
      case 'deployments':
        return <Layers size={16} className="text-blue-400" />;
      case 'statefulsets':
        return <Server size={16} className="text-purple-400" />;
      case 'daemonsets':
        return <Cpu size={16} className="text-amber-400" />;
      default:
        return <Box size={16} className="text-cyan-400" />;
    }
  };

  const getPodDonutColor = (ready: number, desired: number) => {
    if (desired === 0) return '#71717a';
    if (ready === desired) return '#10b981'; // emerald-500
    if (ready > 0) return '#f59e0b'; // amber-500
    return '#ef4444'; // rose-500
  };

  const toResourceItem = (node: TopologyNode): ResourceItem => {
    return {
      id: node.id,
      name: node.name,
      namespace: node.namespace,
      kind: node.kind,
      status: node.status,
      statusColor: node.statusColor,
      age: node.age,
      ready: `${node.readyReplicas}/${node.desiredReplicas}`,
    };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0b0f19] select-none">
      {/* Topology Toolbar */}
      <div className="p-3.5 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 text-emerald-400">
            <Network size={18} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-wide">Application Topology</h2>
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                {currentProject === 'all-projects' ? 'Cluster-Wide' : currentProject}
              </span>
              {data && (
                <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-[10px] text-emerald-300 font-mono">
                  {data.workloads.length} Workloads • {data.workloads.reduce((acc, w) => acc + w.podCount, 0)} Pods
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Visual map: Routes ➔ Services ➔ Workloads ➔ Pods & PVC Storage
            </p>
          </div>
        </div>

        {/* Filter & Search */}
        <div className="flex items-center space-x-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter topology nodes..."
              className="w-full bg-[#1e293b] border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading && !data && (
          <div className="h-64 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="animate-spin text-cyan-400" size={28} />
            <p className="text-sm font-mono text-slate-400">Rendering cluster application topology...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs font-mono flex items-center gap-2">
            <AlertTriangle size={16} className="text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {data && Object.keys(groupedWorkloads).length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center space-y-2 text-center text-slate-500">
            <Network size={36} className="text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">No workloads found in this project</p>
            <p className="text-xs text-slate-500">
              Deploy an application or switch to a project with active DeploymentConfigs or Deployments.
            </p>
          </div>
        )}

        {data &&
          Object.entries(groupedWorkloads).map(([appName, workloads]) => (
            <div
              key={appName}
              className="bg-[#0f172a]/90 border border-slate-800 rounded-xl p-5 shadow-xl relative backdrop-blur-sm"
            >
              {/* Application Group Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
                <div className="flex items-center space-x-2.5">
                  <div className="w-6 h-6 rounded bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-500/40">
                    <FolderGit2 size={13} />
                  </div>
                  <span className="text-xs font-bold font-mono text-purple-300 uppercase tracking-wider">
                    Application: <span className="text-white">{appName}</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
                    {workloads.length} {workloads.length === 1 ? 'component' : 'components'}
                  </span>
                </div>
              </div>

              {/* Workload Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {workloads.map((node) => {
                  const ringColor = getPodDonutColor(node.readyReplicas, node.desiredReplicas);
                  const resourceItem = toResourceItem(node);

                  return (
                    <div
                      key={node.id}
                      onClick={() => onSelectWorkload(resourceItem)}
                      className="bg-[#1e293b]/80 hover:bg-[#1e293b] border border-slate-700/70 hover:border-cyan-500/60 rounded-xl p-4 transition-all shadow-lg hover:shadow-cyan-950/30 group cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden"
                    >
                      {/* Top: Node Header & Pod Ring */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-3">
                          {/* Pod Status Donut SVG */}
                          <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                              <path
                                className="text-slate-800"
                                strokeWidth="3.5"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                strokeDasharray={`${node.desiredReplicas > 0 ? (node.readyReplicas / node.desiredReplicas) * 100 : 0}, 100`}
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                stroke={ringColor}
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <span className="absolute text-[10px] font-bold font-mono text-slate-200">
                              {node.readyReplicas}/{node.desiredReplicas}
                            </span>
                          </div>

                          {/* Workload Name & Kind */}
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5 mb-0.5">
                              {getKindIcon(node.kind)}
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">
                                {node.kind === 'deploymentconfigs' ? 'DeploymentConfig' : node.kind}
                              </span>
                            </div>
                            <h3
                              className="text-sm font-bold text-white group-hover:text-cyan-300 font-mono truncate transition-colors"
                              title={node.name}
                            >
                              {node.name}
                            </h3>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 ${
                            node.readyReplicas === node.desiredReplicas && node.desiredReplicas > 0
                              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                              : node.desiredReplicas === 0
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-amber-950/70 text-amber-300 border-amber-800'
                          }`}
                        >
                          {node.status}
                        </span>
                      </div>

                      {/* Middle: Connected Routes, Services, Storage */}
                      <div className="space-y-2 pt-1">
                        {/* Connected Ingress Routes */}
                        {node.routes.map((route, i) => (
                          <div
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (route.url) onOpenExternal(route.url);
                            }}
                            className="flex items-center justify-between bg-[#0f172a] hover:bg-cyan-950/50 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-cyan-800/80 text-[11px] font-mono text-cyan-300 group/route transition-colors"
                            title={`Open route: ${route.url}`}
                          >
                            <div className="flex items-center space-x-1.5 truncate">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                              <span className="truncate">{route.host}</span>
                            </div>
                            <ExternalLink size={12} className="text-cyan-400 shrink-0 ml-1 opacity-70 group-hover/route:opacity-100" />
                          </div>
                        ))}

                        {/* Connected Services */}
                        {node.services.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {node.services.map((svc, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-blue-950/50 border border-blue-900 text-[10px] font-mono text-blue-300 flex items-center gap-1"
                              >
                                <Network size={10} />
                                <span>{svc.name}</span>
                                <span className="text-slate-400">({svc.ports})</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Connected PVC Storage */}
                        {node.pvcs.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {node.pvcs.map((pvc, i) => (
                              <button
                                key={i}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenPvcResize({
                                    id: `${node.namespace}/${pvc.name}`,
                                    name: pvc.name,
                                    namespace: node.namespace,
                                    kind: 'pvc',
                                    status: pvc.status,
                                    extra: {
                                      capacity: pvc.capacity,
                                      storageClass: pvc.storageClass,
                                    },
                                    age: '',
                                  });
                                }}
                                className="px-2 py-0.5 rounded bg-purple-950/60 hover:bg-purple-900/80 border border-purple-900 hover:border-purple-600 text-[10px] font-mono text-purple-300 flex items-center gap-1 transition-colors cursor-pointer"
                                title={`Click to resize/expand storage for ${pvc.name}`}
                              >
                                <Database size={10} className="text-purple-400" />
                                <span>{pvc.name}</span>
                                <span className="text-purple-200 font-bold">({pvc.capacity})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bottom Action Bar */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-mono">{node.age}</span>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenWorkloadLogs(resourceItem);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-emerald-950 text-emerald-400 border border-slate-700 hover:border-emerald-500 transition-colors"
                            title="Stream Logs"
                          >
                            <Terminal size={12} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenWorkloadYaml(resourceItem);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-cyan-950 text-cyan-400 border border-slate-700 hover:border-cyan-500 transition-colors"
                            title="Edit YAML"
                          >
                            <FileCode2 size={12} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenWorkloadScale(resourceItem);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-purple-950 text-purple-400 border border-slate-700 hover:border-purple-500 transition-colors"
                            title="Scale"
                          >
                            <SlidersHorizontal size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
