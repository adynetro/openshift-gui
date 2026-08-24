import React from 'react';
import {
  Box,
  Layers,
  Server,
  Globe,
  Network,
  Image as ImageIcon,
  Anchor,
  FileCode,
  Lock,
  Cpu,
  HelpCircle,
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
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hotkey: string;
  badgeColor?: string;
  badgeText?: string;
}

export const SIDEBAR_ITEMS: NavItem[] = [
  { kind: 'pods', label: 'Pods', icon: Box, hotkey: '1' },
  { kind: 'deployments', label: 'Deployments', icon: Layers, hotkey: '2' },
  { kind: 'statefulsets', label: 'StatefulSets', icon: Server, hotkey: '3' },
  { kind: 'routes', label: 'Routes', icon: Globe, hotkey: '4', badgeText: 'OpenShift', badgeColor: 'bg-red-950 text-red-400 border-red-800' },
  { kind: 'services', label: 'Services', icon: Network, hotkey: '5' },
  { kind: 'imagestreams', label: 'ImageStreams', icon: ImageIcon, hotkey: '6', badgeText: 'SemVer', badgeColor: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
  { kind: 'helm', label: 'Helm Releases', icon: Anchor, hotkey: '7', badgeText: 'Helm 3', badgeColor: 'bg-blue-950 text-blue-400 border-blue-800' },
  { kind: 'configmaps', label: 'ConfigMaps', icon: FileCode, hotkey: '8' },
  { kind: 'secrets', label: 'Secrets', icon: Lock, hotkey: '9' },
  { kind: 'nodes', label: 'Cluster Nodes', icon: Cpu, hotkey: '0' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentKind,
  onSelectKind,
  counts,
  onOpenHelp,
}) => {
  return (
    <aside className="w-60 bg-[#0f172a] border-r border-[#1e293b] flex flex-col justify-between p-3 select-none shrink-0">
      {/* Navigation List */}
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Workloads & Resources
        </div>
        <nav className="space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentKind === item.kind;
            const count = counts[item.kind];

            return (
              <button
                key={item.kind}
                onClick={() => onSelectKind(item.kind)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-red-600/20 to-red-600/5 text-white border border-red-500/40 shadow-sm shadow-red-950/50'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    size={16}
                    className={
                      isActive
                        ? 'text-[#ee0000]'
                        : 'text-slate-400 group-hover:text-slate-200 transition-colors'
                    }
                  />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badgeText && !isActive && (
                    <span className={`text-[9px] px-1 py-0.2 rounded border font-mono ${item.badgeColor}`}>
                      {item.badgeText}
                    </span>
                  )}
                  {count !== undefined && count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                        isActive
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 font-mono">[{item.hotkey}]</span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Shortcuts & Help */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <button
          onClick={onOpenHelp}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
        >
          <HelpCircle size={15} />
          <span>Keyboard Shortcuts & Help</span>
        </button>

        <div className="px-3 py-1 bg-slate-900/60 rounded-md border border-slate-800 text-[10px] text-slate-400 font-mono flex justify-between items-center">
          <span>OpenShift GUI</span>
          <span className="text-emerald-400 font-bold">v0.1.0</span>
        </div>
      </div>
    </aside>
  );
};
