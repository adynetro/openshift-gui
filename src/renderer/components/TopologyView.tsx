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
  Copy,
  Check,
  PanelRightClose,
  PanelRightOpen,
  SquareTerminal,
  ScrollText,
  Lock,
  Shield,
  Zap,
  ChevronRight,
  Grid3X3,
  Workflow,
  CircleDot,
  X,
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
  onOpenPodTerminal?: (item: ResourceItem) => void;
  onOpenPodLogs?: (item: ResourceItem) => void;
}

export const TopologyView: React.FC<TopologyViewProps> = ({
  currentProject,
  onSelectWorkload,
  onOpenWorkloadLogs,
  onOpenWorkloadYaml,
  onOpenWorkloadScale,
  onOpenPvcResize,
  onOpenExternal,
  onOpenPodTerminal,
  onOpenPodLogs,
}) => {
  const [data, setData] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'pipeline' | 'circular' | 'grid'>('circular');
  const [copiedFqdn, setCopiedFqdn] = useState<string | null>(null);

  const fetchTopology = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) setLoading(true);
        setError(null);
        const res = await (window as any).electronAPI.getTopologyData(currentProject);
        if (res.error) {
          setError(res.error);
        } else if (res.data) {
          setData(res.data);
          // Keep selected node updated with fresh live state
          if (selectedNode) {
            const fresh = res.data.workloads.find((w: TopologyNode) => w.id === selectedNode.id);
            if (fresh) setSelectedNode(fresh);
          }
        }
      } catch (err: any) {
        if (!isBackground) setError(err.message || 'Failed to fetch topology data');
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [currentProject, selectedNode]
  );

  useEffect(() => {
    fetchTopology(false);
    const interval = setInterval(() => {
      fetchTopology(true);
    }, 3500);
    return () => clearInterval(interval);
  }, [currentProject]);

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
        w.routes.some((r) => r.host.toLowerCase().includes(q)) ||
        w.services.some((s) => s.name.toLowerCase().includes(q))
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

  // Overall Project Stats Summary
  const stats = useMemo(() => {
    if (!data?.workloads) return { totalWorkloads: 0, totalPods: 0, healthy: 0, routesCount: 0, pvcsCount: 0 };
    const totalWorkloads = data.workloads.length;
    const totalPods = data.workloads.reduce((acc, w) => acc + w.podCount, 0);
    const healthy = data.workloads.filter((w) => w.readyReplicas === w.desiredReplicas && w.desiredReplicas > 0).length;
    const routesCount = data.workloads.reduce((acc, w) => acc + w.routes.length, 0);
    const pvcsCount = data.workloads.reduce((acc, w) => acc + w.pvcs.length, 0);
    return { totalWorkloads, totalPods, healthy, routesCount, pvcsCount };
  }, [data]);

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

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFqdn(id);
    setTimeout(() => setCopiedFqdn(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0b0f19] select-none">
      {/* 🌟 Top Summary Toolbar */}
      <div className="p-3 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30 text-cyan-400">
            <Workflow size={18} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-wide font-mono">Topology Flow Canvas</h2>
              <span className="px-2 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                {currentProject === 'all-projects' ? 'Cluster-Wide' : currentProject}
              </span>
              {data && (
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="px-2 py-0.2 rounded bg-emerald-950/70 border border-emerald-800 text-[10px] text-emerald-300 font-mono font-bold">
                    {stats.healthy}/{stats.totalWorkloads} Healthy
                  </span>
                  <span className="px-2 py-0.2 rounded bg-purple-950/70 border border-purple-800 text-[10px] text-purple-300 font-mono">
                    {stats.totalPods} Pods
                  </span>
                  <span className="px-2 py-0.2 rounded bg-blue-950/70 border border-blue-800 text-[10px] text-blue-300 font-mono">
                    {stats.routesCount} Routes
                  </span>
                  <span className="px-2 py-0.2 rounded bg-cyan-950/70 border border-cyan-800 text-[10px] text-cyan-300 font-mono">
                    {stats.pvcsCount} PVCs
                  </span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Relational Pipeline: Ingress Routes ➔ Services ➔ Compute Workloads ➔ Attached Storage
            </p>
          </div>
        </div>

        {/* View Mode & Filter Controls */}
        <div className="flex items-center space-x-2.5">
          {/* Search Bar */}
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter topology..."
              className="w-full bg-[#1e293b] border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Layout Toggle */}
          <div className="flex items-center bg-[#1e293b] p-0.5 rounded-lg border border-slate-700 text-xs font-mono">
            <button
              onClick={() => setViewMode('circular')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                viewMode === 'circular' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="OpenShift Radial Circular Graph View"
            >
              <CircleDot size={13} />
              <span>Graph</span>
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                viewMode === 'pipeline' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Horizontal Relational Pipeline View"
            >
              <Workflow size={13} />
              <span>Pipeline</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                viewMode === 'grid' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Compact Card Grid View"
            >
              <Grid3X3 size={13} />
              <span>Grid</span>
            </button>
          </div>

          {/* Inspector Toggle Button */}
          {selectedNode && (
            <button
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              className={`p-1.5 rounded-lg border transition-colors ${
                isInspectorOpen
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={isInspectorOpen ? 'Hide Right Inspector Drawer' : 'Show Right Inspector Drawer'}
            >
              {isInspectorOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* 🚀 Main Split-Screen Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left/Center Canvas Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading && !data && (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="animate-spin text-cyan-400" size={28} />
              <p className="text-xs font-mono text-slate-400">Rendering cluster application topology...</p>
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
              <p className="text-sm font-semibold text-slate-300 font-mono">No workloads found in this project</p>
              <p className="text-xs text-slate-500 font-mono">
                Deploy an application or switch to a project with active DeploymentConfigs or Deployments.
              </p>
            </div>
          )}

          {/* Render Application Boundaries */}
          {data &&
            Object.entries(groupedWorkloads).map(([appName, workloads]) => (
              <div
                key={appName}
                className="bg-[#0f172a]/95 border border-slate-800/90 rounded-xl p-4 shadow-xl backdrop-blur-sm"
              >
                {/* Application Group Header */}
                <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-800/80">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-6 h-6 rounded bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-500/40">
                      <FolderGit2 size={13} />
                    </div>
                    <span className="text-xs font-bold font-mono text-purple-300 uppercase tracking-wider">
                      Application: <span className="text-white">{appName}</span>
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
                      {workloads.length} {workloads.length === 1 ? 'workload' : 'workloads'}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    {workloads.reduce((acc, w) => acc + w.podCount, 0)} total pods running
                  </span>
                </div>

                {/* 🌟 VIEW MODE 1: End-to-End Horizontal Flow Pipeline */}
                {viewMode === 'pipeline' ? (
                  <div className="space-y-3.5">
                    {workloads.map((node) => {
                      const ringColor = getPodDonutColor(node.readyReplicas, node.desiredReplicas);
                      const resourceItem = toResourceItem(node);
                      const isSelected = selectedNode?.id === node.id;

                      return (
                        <div
                          key={node.id}
                          onClick={() => {
                            setSelectedNode(node);
                            setIsInspectorOpen(true);
                          }}
                          className={`rounded-xl border p-3.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1e293b] border-cyan-500 ring-1 ring-cyan-500 shadow-lg shadow-cyan-950/40'
                              : 'bg-[#162032]/80 hover:bg-[#1e293b]/90 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-center">
                            {/* STAGE 1: Ingress & Routes (3 Cols) */}
                            <div className="xl:col-span-3 flex flex-col justify-center space-y-1.5 pr-2">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1">
                                <Network size={11} className="text-red-400" />
                                <span>Ingress / Route</span>
                              </span>
                              {node.routes.length > 0 ? (
                                node.routes.map((r) => (
                                  <div
                                    key={r.name}
                                    className="p-2 rounded-lg bg-[#0b0f19] border border-slate-800 flex items-center justify-between gap-2 group/rt"
                                  >
                                    <div className="truncate flex items-center gap-1.5">
                                      {r.tls && <Lock size={11} className="text-emerald-400 shrink-0" />}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenExternal(r.url);
                                        }}
                                        className="text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300 hover:underline truncate text-left flex items-center gap-1"
                                        title={`Open ${r.host} in browser`}
                                      >
                                        <span className="truncate">{r.host}</span>
                                        <ExternalLink size={11} className="opacity-60 group-hover/rt:opacity-100 shrink-0" />
                                      </button>
                                    </div>
                                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-slate-400 shrink-0">
                                      {r.tls ? 'TLS' : 'HTTP'}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="p-2 rounded-lg bg-[#0b0f19]/60 border border-slate-800/80 text-[11px] text-slate-500 font-mono">
                                  No Public Ingress Route
                                </div>
                              )}
                            </div>

                            {/* Arrow Divider 1 */}
                            <div className="hidden xl:flex xl:col-span-1 items-center justify-center text-slate-600">
                              <ArrowRight size={16} className="text-cyan-500/40" />
                            </div>

                            {/* STAGE 2: Routing & Services (3 Cols) */}
                            <div className="xl:col-span-3 flex flex-col justify-center space-y-1.5 pr-2">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1">
                                <Network size={11} className="text-cyan-400" />
                                <span>Service & Ports</span>
                              </span>
                              {node.services.length > 0 ? (
                                node.services.map((svc) => (
                                  <div
                                    key={svc.name}
                                    className="p-2 rounded-lg bg-[#0b0f19] border border-slate-800 flex items-center justify-between gap-2"
                                  >
                                    <div className="truncate">
                                      <div className="text-xs font-mono font-bold text-slate-200 truncate">{svc.name}</div>
                                      <div className="text-[10px] font-mono text-amber-300 truncate">{svc.ports || '80/TCP'}</div>
                                    </div>
                                    <span className="px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-800 text-[10px] font-mono shrink-0">
                                      {svc.type || 'ClusterIP'}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="p-2 rounded-lg bg-[#0b0f19]/60 border border-slate-800/80 text-[11px] text-slate-500 font-mono">
                                  No Service Bound
                                </div>
                              )}
                            </div>

                            {/* Arrow Divider 2 */}
                            <div className="hidden xl:flex xl:col-span-1 items-center justify-center text-slate-600">
                              <ArrowRight size={16} className="text-cyan-500/40" />
                            </div>

                            {/* STAGE 3: Compute Workload & Pods (4 Cols) */}
                            <div className="xl:col-span-4 flex items-center justify-between p-2.5 rounded-lg bg-[#0b0f19] border border-slate-800">
                              <div className="flex items-center space-x-3 truncate">
                                {/* Pod Status Donut SVG */}
                                <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                    <path
                                      className="text-slate-800"
                                      strokeWidth="3.5"
                                      stroke="currentColor"
                                      fill="none"
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                    <path
                                      strokeDasharray={`${
                                        node.desiredReplicas > 0 ? (node.readyReplicas / node.desiredReplicas) * 100 : 0
                                      }, 100`}
                                      strokeWidth="3.5"
                                      strokeLinecap="round"
                                      stroke={ringColor}
                                      fill="none"
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                  </svg>
                                  <span className="absolute text-[10px] font-bold font-mono text-slate-200">
                                    {node.readyReplicas}
                                  </span>
                                </div>

                                <div className="truncate">
                                  <div className="flex items-center gap-1.5">
                                    {getKindIcon(node.kind)}
                                    <span className="text-xs font-bold font-mono text-white truncate">{node.name}</span>
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                                    {node.images[0] ? node.images[0].split('/').pop() : 'No image'}
                                  </div>
                                </div>
                              </div>

                              {/* Workload Quick Action Buttons */}
                              <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => onSelectWorkload(resourceItem)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-950 text-cyan-300 border border-slate-700 hover:border-cyan-500 transition-colors"
                                  title="Open Workload Details & Pods"
                                >
                                  <SlidersHorizontal size={13} />
                                </button>
                                <button
                                  onClick={() => onOpenWorkloadLogs(resourceItem)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-950 text-emerald-400 border border-slate-700 hover:border-emerald-500 transition-colors"
                                  title="Stream Aggregated Workload Logs"
                                >
                                  <ScrollText size={13} />
                                </button>
                                <button
                                  onClick={() => onOpenWorkloadYaml(resourceItem)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-purple-950 text-purple-300 border border-slate-700 hover:border-purple-500 transition-colors"
                                  title="Edit Workload YAML Manifest"
                                >
                                  <FileCode2 size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : viewMode === 'circular' ? (
                  /* 🌟 VIEW MODE 2: Authentic OpenShift Radial Circular Graph */
                  <div className="flex flex-wrap gap-8 items-center justify-center p-6 bg-[#0b0f19]/70 rounded-xl border border-slate-800/80">
                    {workloads.map((node) => {
                      const ringColor = getPodDonutColor(node.readyReplicas, node.desiredReplicas);
                      const isSelected = selectedNode?.id === node.id;

                      return (
                        <div
                          key={node.id}
                          onClick={() => {
                            setSelectedNode(node);
                            setIsInspectorOpen(true);
                          }}
                          className="relative flex flex-col items-center group cursor-pointer"
                        >
                          {/* Top-Right Floating Route Badge */}
                          {node.routes[0] && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenExternal(node.routes[0].url);
                              }}
                              className="absolute -top-3 -right-2 z-20 px-2 py-0.5 rounded-full bg-[#1e293b] hover:bg-cyan-950 text-cyan-400 border border-slate-700 hover:border-cyan-500 text-[10px] font-mono font-bold flex items-center gap-1 shadow-lg transition-all"
                              title={`Open ${node.routes[0].host} in browser`}
                            >
                              <ExternalLink size={10} />
                              <span className="max-w-[90px] truncate">{node.routes[0].name || 'Route'}</span>
                            </button>
                          )}

                          {/* Central Round Circular Node with Outer Status Donut */}
                          <div
                            className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-200 ${
                              isSelected
                                ? 'scale-105 ring-4 ring-cyan-500/80 shadow-2xl shadow-cyan-500/30'
                                : 'hover:scale-105 shadow-xl hover:shadow-cyan-950/40'
                            }`}
                          >
                            {/* Outer SVG Donut Halo */}
                            <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                              {/* Background Ring */}
                              <circle
                                cx="18"
                                cy="18"
                                r="15.5"
                                className="text-slate-800"
                                strokeWidth="3"
                                stroke="currentColor"
                                fill="none"
                              />
                              {/* Progress Ring */}
                              <circle
                                cx="18"
                                cy="18"
                                r="15.5"
                                strokeDasharray={`${
                                  node.desiredReplicas > 0 ? (node.readyReplicas / node.desiredReplicas) * 97.4 : 0
                                }, 100`}
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                stroke={ringColor}
                                fill="none"
                                className="transition-all duration-500"
                              />
                            </svg>

                            {/* Inner Circle Disc */}
                            <div className="w-[84px] h-[84px] rounded-full bg-[#162032] border border-slate-700/80 flex flex-col items-center justify-center p-1 text-center shadow-inner group-hover:bg-[#1e293b] transition-colors">
                              <div className="mb-0.5">{getKindIcon(node.kind)}</div>
                              <span className="text-xs font-bold font-mono text-white">
                                {node.readyReplicas}/{node.desiredReplicas}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400 capitalize truncate max-w-[70px]">
                                {node.kind === 'deploymentconfigs'
                                  ? 'DC'
                                  : node.kind === 'deployments'
                                  ? 'Deploy'
                                  : node.kind === 'statefulsets'
                                  ? 'Stateful'
                                  : 'Daemon'}
                              </span>
                            </div>

                            {/* Bottom-Right Attached Storage Badge */}
                            {node.pvcs.length > 0 && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenPvcResize({
                                    id: node.pvcs[0].name,
                                    name: node.pvcs[0].name,
                                    namespace: node.namespace,
                                    kind: 'pvc',
                                    status: node.pvcs[0].status,
                                    age: '',
                                  });
                                }}
                                className="absolute -bottom-1 -right-1 z-20 w-6 h-6 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700 flex items-center justify-center shadow-md hover:bg-cyan-900 transition-colors"
                                title={`Attached Storage: ${node.pvcs[0].name} (${node.pvcs[0].capacity})`}
                              >
                                <Database size={11} />
                              </div>
                            )}
                          </div>

                          {/* Node Label Pill */}
                          <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-[#162032] border border-slate-800 text-center max-w-[150px] group-hover:border-slate-600 transition-colors">
                            <div className="text-xs font-bold font-mono text-slate-100 truncate" title={node.name}>
                              {node.name}
                            </div>
                            <div className="text-[9px] font-mono text-slate-400 truncate">
                              {node.services[0]?.name || 'Internal Only'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* 🌟 VIEW MODE 3: Compact Card Grid */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {workloads.map((node) => {
                      const ringColor = getPodDonutColor(node.readyReplicas, node.desiredReplicas);
                      const resourceItem = toResourceItem(node);
                      const isSelected = selectedNode?.id === node.id;

                      return (
                        <div
                          key={node.id}
                          onClick={() => {
                            setSelectedNode(node);
                            setIsInspectorOpen(true);
                          }}
                          className={`rounded-xl border p-4 transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                            isSelected
                              ? 'bg-[#1e293b] border-cyan-500 ring-1 ring-cyan-500 shadow-lg shadow-cyan-950/40'
                              : 'bg-[#162032]/80 hover:bg-[#1e293b]/90 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center space-x-3 truncate">
                              <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                  <path
                                    className="text-slate-800"
                                    strokeWidth="3.5"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                  <path
                                    strokeDasharray={`${
                                      node.desiredReplicas > 0 ? (node.readyReplicas / node.desiredReplicas) * 100 : 0
                                    }, 100`}
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

                              <div className="truncate">
                                <div className="flex items-center gap-1.5">
                                  {getKindIcon(node.kind)}
                                  <span className="text-xs font-bold font-mono text-white truncate">{node.name}</span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 capitalize">{node.kind}</span>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold border ${
                                node.readyReplicas === node.desiredReplicas && node.desiredReplicas > 0
                                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                                  : 'bg-amber-950/70 text-amber-300 border-amber-800'
                              }`}
                            >
                              {node.readyReplicas === node.desiredReplicas && node.desiredReplicas > 0 ? 'Ready' : 'Scaling'}
                            </span>
                          </div>

                          {/* Quick Badges */}
                          <div className="space-y-1.5 text-xs font-mono">
                            {node.routes[0] && (
                              <div className="flex items-center gap-1 text-cyan-400 text-[11px] truncate">
                                <ExternalLink size={11} className="shrink-0" />
                                <span className="truncate">{node.routes[0].host}</span>
                              </div>
                            )}
                            {node.pvcs.length > 0 && (
                              <div className="flex items-center gap-1 text-cyan-300 text-[11px]">
                                <Database size={11} className="shrink-0" />
                                <span>{node.pvcs[0].name} ({node.pvcs[0].capacity})</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* 📋 RIGHT-HAND CONTEXT INSPECTOR DRAWER (32% Canvas Space) */}
        {selectedNode && isInspectorOpen && (
          <aside className="w-[380px] xl:w-[440px] bg-[#0f172a] border-l border-[#1e293b] flex flex-col justify-between shrink-0 animate-in slide-in-from-right duration-200 shadow-2xl">
            {/* Inspector Header */}
            <div className="p-4 bg-[#162032] border-b border-[#1e293b] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5 truncate">
                <div className="w-8 h-8 rounded-lg bg-[#1e293b] flex items-center justify-center border border-slate-700 text-cyan-400 shrink-0">
                  {getKindIcon(selectedNode.kind)}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white font-mono truncate">{selectedNode.name}</h3>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px] font-mono capitalize shrink-0">
                      {selectedNode.kind}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Project: {selectedNode.namespace}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsInspectorOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2"
                title="Close Inspector"
              >
                <X size={16} />
              </button>
            </div>

            {/* Inspector Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
              {/* Quick Action Toolbar */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => onSelectWorkload(toResourceItem(selectedNode))}
                  className="p-2 rounded-lg bg-[#1e293b] hover:bg-cyan-950 text-cyan-300 border border-slate-700 hover:border-cyan-500 flex flex-col items-center justify-center gap-1 transition-colors"
                  title="Workload Hierarchy & Controllers"
                >
                  <SlidersHorizontal size={14} />
                  <span className="text-[10px]">Details</span>
                </button>
                <button
                  onClick={() => onOpenWorkloadLogs(toResourceItem(selectedNode))}
                  className="p-2 rounded-lg bg-[#1e293b] hover:bg-emerald-950 text-emerald-400 border border-slate-700 hover:border-emerald-500 flex flex-col items-center justify-center gap-1 transition-colors"
                  title="Stream Live Logs"
                >
                  <ScrollText size={14} />
                  <span className="text-[10px]">Logs</span>
                </button>
                <button
                  onClick={() => onOpenWorkloadYaml(toResourceItem(selectedNode))}
                  className="p-2 rounded-lg bg-[#1e293b] hover:bg-purple-950 text-purple-300 border border-slate-700 hover:border-purple-500 flex flex-col items-center justify-center gap-1 transition-colors"
                  title="Edit YAML"
                >
                  <FileCode2 size={14} />
                  <span className="text-[10px]">YAML</span>
                </button>
                <button
                  onClick={() => onOpenWorkloadScale(toResourceItem(selectedNode))}
                  className="p-2 rounded-lg bg-[#1e293b] hover:bg-amber-950 text-amber-300 border border-slate-700 hover:border-amber-500 flex flex-col items-center justify-center gap-1 transition-colors"
                  title="Scale Replicas"
                >
                  <Zap size={14} />
                  <span className="text-[10px]">Scale</span>
                </button>
              </div>

              {/* Workload Status Pill */}
              <div className="p-3 rounded-lg bg-[#162032] border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Replicas (Ready/Desired):</span>
                <span className="font-bold text-slate-100 flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedNode.readyReplicas === selectedNode.desiredReplicas && selectedNode.desiredReplicas > 0
                        ? 'bg-emerald-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  {selectedNode.readyReplicas} of {selectedNode.desiredReplicas}
                </span>
              </div>

              {/* ⚡ Live Pods List in Inspector */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Live Running Pods ({selectedNode.pods.length})</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {selectedNode.pods.length === 0 ? (
                    <div className="p-3 rounded-lg bg-[#162032]/60 border border-slate-800 text-slate-500 text-center text-[11px]">
                      No active pods running
                    </div>
                  ) : (
                    selectedNode.pods.map((pod) => (
                      <div
                        key={pod.name}
                        className="p-2 rounded-lg bg-[#162032] border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <div className="text-xs font-bold text-cyan-300 truncate">{pod.name}</div>
                          <div className="text-[10px] text-slate-400">{pod.status} • {pod.ready} ready</div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {onOpenPodTerminal && (
                            <button
                              onClick={() =>
                                onOpenPodTerminal({
                                  id: pod.name,
                                  name: pod.name,
                                  namespace: selectedNode.namespace,
                                  kind: 'pods',
                                  status: pod.status,
                                  age: '',
                                })
                              }
                              className="p-1.5 rounded bg-slate-800 hover:bg-cyan-950 text-cyan-400 border border-slate-700 hover:border-cyan-500 transition-colors"
                              title="Open Pod Shell Terminal"
                            >
                              <SquareTerminal size={12} />
                            </button>
                          )}
                          <button
                            onClick={() =>
                              onOpenWorkloadLogs({
                                id: pod.name,
                                name: pod.name,
                                namespace: selectedNode.namespace,
                                kind: 'pods',
                                status: pod.status,
                                age: '',
                              })
                            }
                            className="p-1.5 rounded bg-slate-800 hover:bg-emerald-950 text-emerald-400 border border-slate-700 hover:border-emerald-500 transition-colors"
                            title="Stream Pod Logs"
                          >
                            <ScrollText size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Ingress Routes in Inspector */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Ingress Routes ({selectedNode.routes.length})
                </div>
                {selectedNode.routes.map((r) => (
                  <div
                    key={r.name}
                    className="p-2 rounded-lg bg-[#162032] border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="truncate text-xs font-mono text-cyan-400">{r.host}</div>
                    <button
                      onClick={() => onOpenExternal(r.url)}
                      className="p-1 rounded bg-slate-800 hover:bg-cyan-950 text-cyan-300 border border-slate-700 transition-colors shrink-0"
                      title="Open in Browser"
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Services in Inspector */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Services & Ports ({selectedNode.services.length})
                </div>
                {selectedNode.services.map((s) => {
                  const fqdn = `${s.name}.${selectedNode.namespace}.svc.cluster.local`;
                  return (
                    <div key={s.name} className="p-2 rounded-lg bg-[#162032] border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{s.name}</span>
                        <span className="text-[10px] text-amber-300">{s.ports}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="truncate select-all">{fqdn}</span>
                        <button
                          onClick={() => handleCopy(fqdn, s.name)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-300 shrink-0"
                          title="Copy FQDN"
                        >
                          {copiedFqdn === s.name ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Persistent Volume Storage in Inspector */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Attached Storage ({selectedNode.pvcs.length})
                </div>
                {selectedNode.pvcs.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-[#162032]/60 border border-slate-800 text-slate-500 text-[11px]">
                    Stateless (No persistent volume claims attached)
                  </div>
                ) : (
                  selectedNode.pvcs.map((pvc) => (
                    <div
                      key={pvc.name}
                      className="p-2.5 rounded-lg bg-[#162032] border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-cyan-300">{pvc.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {pvc.capacity} • {pvc.storageClass || 'gp3'} • {pvc.status}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          onOpenPvcResize({
                            id: pvc.name,
                            name: pvc.name,
                            namespace: selectedNode.namespace,
                            kind: 'pvc',
                            status: pvc.status,
                            age: '',
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-emerald-950 text-emerald-400 border border-slate-700 hover:border-emerald-500 text-[10px] font-bold transition-colors shrink-0"
                        title="Resize PVC Storage"
                      >
                        Expand
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Inspector Footer */}
            <div className="p-3 bg-[#162032] border-t border-[#1e293b] flex items-center justify-between text-[11px] font-mono text-slate-500 shrink-0">
              <span>Workload: <strong>{selectedNode.name}</strong></span>
              <span>Press <strong>Esc</strong> to close</span>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
