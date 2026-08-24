import React from 'react';
import {
  Box,
  Layers,
  Layers2,
  Server,
  Network,
  Image,
  FileText,
  Key,
  Anchor,
  HardDrive,
  HelpCircle,
  Cpu,
  Activity,
  Database,
  Boxes,
  ShieldCheck,
  Shield,
} from 'lucide-react';
import { ResourceKind } from '../../types/k8s.js';

interface SidebarProps {
  currentKind: ResourceKind;
  onSelectKind: (kind: ResourceKind) => void;
  counts: Partial<Record<ResourceKind, number>>;
  onOpenHelp: () => void;
}

interface NavItem {
  kind: ResourceKind;
  label: string;
  icon: any;
  hotkey: string;
  badgeColor?: string;
  badgeText?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { kind: 'topology', label: 'Topology', icon: Network, hotkey: '1', badgeText: 'Graph', badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
    ],
  },
  {
    title: 'Workloads',
    items: [
      { kind: 'pods', label: 'Pods', icon: Box, hotkey: '2' },
      { kind: 'deployments', label: 'Deployments', icon: Layers, hotkey: '3' },
      { kind: 'deploymentconfigs', label: 'DeploymentConfigs', icon: Layers2, hotkey: '4', badgeText: 'OpenShift', badgeColor: 'bg-red-950 text-red-300 border-red-800' },
      { kind: 'statefulsets', label: 'StatefulSets', icon: Server, hotkey: '5' },
      { kind: 'daemonsets', label: 'DaemonSets', icon: Cpu, hotkey: '6' },
      { kind: 'helm', label: 'Helm Releases', icon: Anchor, hotkey: 'h', badgeText: 'v3', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800' },
    ],
  },
  {
    title: 'Networking',
    items: [
      { kind: 'routes', label: 'Routes', icon: Network, hotkey: '7', badgeText: 'OpenShift', badgeColor: 'bg-red-950 text-red-300 border-red-800' },
      { kind: 'services', label: 'Services', icon: Network, hotkey: '8' },
      { kind: 'networkpolicies', label: 'NetworkPolicies', icon: Shield, hotkey: 'w', badgeText: 'Security', badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-800' },
    ],
  },
  {
    title: 'Storage',
    items: [
      { kind: 'pvc', label: 'PersistentVolumeClaims', icon: Database, hotkey: '9' },
      { kind: 'pv', label: 'PersistentVolumes', icon: HardDrive, hotkey: '0', badgeText: 'Cluster', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { kind: 'configmaps', label: 'ConfigMaps', icon: FileText, hotkey: 'c' },
      { kind: 'secrets', label: 'Secrets', icon: Key, hotkey: 's', badgeText: 'GUI', badgeColor: 'bg-amber-950 text-amber-300 border-amber-800' },
      { kind: 'imagestreams', label: 'ImageStreams', icon: Image, hotkey: 'i', badgeText: 'SemVer', badgeColor: 'bg-purple-950 text-purple-300 border-purple-800' },
      { kind: 'crd', label: 'CustomResources', icon: Boxes, hotkey: 'k', badgeText: 'CRDs', badgeColor: 'bg-purple-950 text-purple-300 border-purple-800' },
    ],
  },
  {
    title: 'Observe & Cluster',
    items: [
      { kind: 'nodes', label: 'Cluster Nodes', icon: HardDrive, hotkey: 'n' },
      { kind: 'clusteroperators', label: 'Cluster Operators', icon: ShieldCheck, hotkey: 'o', badgeText: 'OpenShift', badgeColor: 'bg-red-950 text-red-300 border-red-800' },
      { kind: 'events', label: 'Live Events', icon: Activity, hotkey: 'e', badgeText: 'Stream', badgeColor: 'bg-amber-950 text-amber-300 border-amber-800' },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentKind,
  onSelectKind,
  counts,
  onOpenHelp,
}) => {
  return (
    <aside className="w-64 bg-[#0f172a] border-r border-[#1e293b] flex flex-col justify-between select-none shrink-0">
      {/* Navigation Groups */}
      <div className="p-3 space-y-3 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              {group.title}
            </div>

            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentKind === item.kind;
              const count = counts[item.kind];

              return (
                <button
                  key={item.kind}
                  onClick={() => onSelectKind(item.kind)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all group ${
                    isActive
                      ? 'bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-lg shadow-red-950/60 font-semibold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <Icon
                      size={15}
                      className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {item.badgeText && !isActive && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] border font-mono ${item.badgeColor}`}>
                        {item.badgeText}
                      </span>
                    )}

                    {count !== undefined && count > 0 && item.kind !== 'topology' && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                          isActive
                            ? 'bg-white/20 text-white font-bold'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {count}
                      </span>
                    )}

                    <span
                      className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-900 text-slate-500 group-hover:text-slate-400'
                      }`}
                    >
                      {item.hotkey}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Info & Help */}
      <div className="p-3 border-t border-[#1e293b] space-y-2">
        <button
          onClick={onOpenHelp}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <HelpCircle size={14} />
            <span>Shortcuts & Help</span>
          </div>
          <span className="text-[10px] font-mono bg-slate-900 px-1 py-0.2 rounded text-slate-500">
            ?
          </span>
        </button>

        <div className="px-3 text-[10px] text-slate-400 font-mono flex items-center justify-between">
          <span>OpenShift GUI</span>
          <span className="text-emerald-500">v0.1.0</span>
        </div>
      </div>
    </aside>
  );
};
