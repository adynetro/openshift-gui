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

const NAV_ITEMS: NavItem[] = [
  { kind: 'pods', label: 'Pods', icon: Box, hotkey: '1' },
  { kind: 'deployments', label: 'Deployments', icon: Layers, hotkey: '2' },
  { kind: 'deploymentconfigs', label: 'DeploymentConfigs', icon: Layers2, hotkey: '3', badgeText: 'OpenShift', badgeColor: 'bg-red-950 text-red-300 border-red-800' },
  { kind: 'statefulsets', label: 'StatefulSets', icon: Server, hotkey: '4' },
  { kind: 'daemonsets', label: 'DaemonSets', icon: Cpu, hotkey: '5' },
  { kind: 'routes', label: 'Routes', icon: Network, hotkey: '6', badgeText: 'OpenShift', badgeColor: 'bg-red-950 text-red-300 border-red-800' },
  { kind: 'services', label: 'Services', icon: Network, hotkey: '7' },
  { kind: 'imagestreams', label: 'ImageStreams', icon: Image, hotkey: '8', badgeText: 'SemVer', badgeColor: 'bg-purple-950 text-purple-300 border-purple-800' },
  { kind: 'helm', label: 'Helm Releases', icon: Anchor, hotkey: '9', badgeText: 'v3', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800' },
  { kind: 'configmaps', label: 'ConfigMaps', icon: FileText, hotkey: '0' },
  { kind: 'secrets', label: 'Secrets', icon: Key, hotkey: '-' },
  { kind: 'nodes', label: 'Cluster Nodes', icon: HardDrive, hotkey: 'n' },
  { kind: 'events', label: 'Live Events', icon: Activity, hotkey: 'e', badgeText: 'Stream', badgeColor: 'bg-amber-950 text-amber-300 border-amber-800' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentKind,
  onSelectKind,
  counts,
  onOpenHelp,
}) => {
  return (
    <aside className="w-64 bg-[#0f172a] border-r border-[#1e293b] flex flex-col justify-between select-none shrink-0">
      {/* Navigation List */}
      <div className="p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Resources
        </div>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentKind === item.kind;
          const count = counts[item.kind];

          return (
            <button
              key={item.kind}
              onClick={() => onSelectKind(item.kind)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
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

                {count !== undefined && count > 0 && (
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
                    isActive ? 'bg-black/20 text-white' : 'text-slate-500 bg-slate-900'
                  }`}
                >
                  {item.hotkey}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Info & Shortcuts */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 space-y-2">
        <button
          onClick={onOpenHelp}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <HelpCircle size={14} className="text-slate-400" />
            <span>Shortcuts & Help</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400">?</kbd>
        </button>

        <div className="px-3 py-1 text-[10px] text-slate-500 flex items-center justify-between font-mono">
          <span>OpenShift GUI</span>
          <span>v0.1.0</span>
        </div>
      </div>
    </aside>
  );
};
