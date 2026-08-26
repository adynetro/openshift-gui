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
import { ThemeSelector } from './ThemeSelector.js';

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

declare const __APP_VERSION__: string | undefined;

export const Sidebar: React.FC<SidebarProps> = ({
  currentKind,
  onSelectKind,
  counts,
  onOpenHelp,
}) => {
  const displayVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.0.1';

  return (
    <aside
      className="w-64 border-r flex flex-col justify-between select-none shrink-0 transition-colors duration-150"
      style={{
        backgroundColor: 'var(--bg-sidebar, #0f172a)',
        borderColor: 'var(--border-color, #1e293b)',
        color: 'var(--text-main, #f8fafc)',
      }}
    >
      {/* Navigation Groups */}
      <div className="p-3 space-y-3 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider font-mono opacity-50">
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
                      : 'opacity-75 hover:opacity-100 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <Icon
                      size={15}
                      className={isActive ? 'text-white' : 'opacity-70 group-hover:opacity-100'}
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
                            : 'bg-white/10 opacity-80'
                        }`}
                      >
                        {count}
                      </span>
                    )}

                    <span
                      className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-black/20 opacity-60 group-hover:opacity-90'
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

      {/* Footer Info, Theme Selector & Shortcuts/Help */}
      <div
        className="p-3 border-t space-y-2 shrink-0 transition-colors"
        style={{ borderColor: 'var(--border-color, #1e293b)' }}
      >
        {/* Theme Selector placed right above Shortcuts & Help */}
        <div className="w-full">
          <ThemeSelector />
        </div>

        {/* Shortcuts & Help button */}
        <button
          onClick={onOpenHelp}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs opacity-75 hover:opacity-100 hover:bg-white/5 transition-all border"
          style={{ borderColor: 'var(--border-subtle, #334155)' }}
          title="Open Keyboard Shortcuts & Help (?)"
        >
          <div className="flex items-center space-x-2">
            <HelpCircle size={14} className="text-cyan-400" />
            <span className="font-semibold">Shortcuts & Help</span>
          </div>
          <span
            className="text-[10px] font-mono px-1.5 py-0.2 rounded border font-bold"
            style={{
              backgroundColor: 'var(--bg-input, #0f172a)',
              borderColor: 'var(--border-color, #334155)',
            }}
          >
            ?
          </span>
        </button>

        <div className="px-3 text-[10px] opacity-60 font-mono flex items-center justify-between">
          <span>OpenShift GUI</span>
          <span className="text-emerald-400 font-bold">v{displayVersion}</span>
        </div>
      </div>
    </aside>
  );
};
