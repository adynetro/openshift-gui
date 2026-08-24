import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Boxes,
  Search,
  RefreshCw,
  AlertTriangle,
  FileCode2,
  FileText,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';
import { FuzzyMatcher } from '../../utils/fuzzy.js';

interface CrdInstancesModalProps {
  crdItem: ResourceItem;
  namespace: string;
  onClose: () => void;
  onEditInstance: (item: ResourceItem) => void;
  onDescribeInstance: (item: ResourceItem) => void;
  onDeleteInstance: (item: ResourceItem) => void;
}

export const CrdInstancesModal: React.FC<CrdInstancesModalProps> = ({
  crdItem,
  namespace,
  onClose,
  onEditInstance,
  onDescribeInstance,
  onDeleteInstance,
}) => {
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [scope, setScope] = useState<string>('Namespaced');
  const [crdKind, setCrdKind] = useState<string>(crdItem.extra?.crdKind || crdItem.name);
  const [group, setGroup] = useState<string>(crdItem.extra?.group || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const fetchInstances = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) setLoading(true);
        setError(null);
        const res = await (window as any).electronAPI.getCrdInstances(crdItem.name, namespace);
        if (res.error) {
          setError(res.error);
        } else {
          setItems(res.items || []);
          if (res.scope) setScope(res.scope);
          if (res.crdKind) setCrdKind(res.crdKind);
          if (res.group) setGroup(res.group);
        }
      } catch (err: any) {
        if (!isBackground) setError(err.message || 'Failed to fetch CRD instances');
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [crdItem.name, namespace]
  );

  useEffect(() => {
    fetchInstances(false);
    const interval = setInterval(() => {
      fetchInstances(true);
    }, 3500);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  // Filter instances by search query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const matcher = new FuzzyMatcher(items, ['name', 'namespace', 'status']);
    return matcher.search(query);
  }, [items, query]);

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

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-[92vw] max-w-[1250px] h-[88vh] flex flex-col overflow-hidden text-[#f8f8f2]">
        {/* Monokai Header */}
        <div className="p-3.5 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#3e3d32] flex items-center justify-center border border-[#49483e] text-[#ae81ff]">
              <Boxes size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#f8f8f2] font-mono flex items-center gap-2">
                  <span>Custom Resource:</span>
                  <span className="text-[#66d9ef] font-bold">{crdKind}</span>
                </h2>
                <span className="px-2 py-0.2 rounded bg-purple-950/60 border border-purple-800 text-[10px] text-purple-300 font-mono">
                  {crdItem.name}
                </span>
                <span className="px-2 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                  Scope: {scope}
                </span>
                {scope !== 'Cluster' && (
                  <span className="px-2 py-0.2 rounded bg-cyan-950/60 border border-cyan-800 text-[10px] text-cyan-300 font-mono">
                    Project: {namespace === 'all-projects' ? 'All Projects' : namespace}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#75715e] font-mono">
                Click any instance name to edit its YAML manifest directly • Live auto-refreshing
              </p>
            </div>
          </div>

          {/* Search and Close */}
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2 text-[#75715e]" size={14} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter instances..."
                className="w-full bg-[#1e1f1c] border border-[#49483e] rounded-lg pl-8 pr-3 py-1 text-xs text-[#f8f8f2] placeholder-[#75715e] focus:outline-none focus:border-[#66d9ef] font-mono"
              />
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#75715e] hover:text-[#f8f8f2] hover:bg-[#3e3d32] transition-colors"
              title="Close window (Esc)"
              aria-label="Close window"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body / Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && items.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="animate-spin text-[#66d9ef]" size={28} />
              <p className="text-sm font-mono text-[#75715e]">Loading {crdKind} instances from cluster...</p>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs font-mono flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && items.length === 0 && !error && (
            <div className="h-64 flex flex-col items-center justify-center space-y-2 text-center text-[#75715e] font-mono">
              <Boxes size={36} className="text-[#49483e] mb-2" />
              <p className="text-sm font-bold text-slate-300">No {crdKind} instances found</p>
              <p className="text-xs text-[#75715e]">
                No custom resources of kind &apos;{crdKind}&apos; currently exist in{' '}
                {scope === 'Cluster' ? 'the cluster' : `project '${namespace}'`}.
              </p>
            </div>
          )}

          {items.length > 0 && (
            <div className="border border-[#3e3d32] rounded-lg overflow-hidden bg-[#272822]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#1e1f1c] text-[#75715e] uppercase text-[10px] tracking-wider border-b border-[#3e3d32]">
                  <tr>
                    <th className="py-2.5 px-4 font-bold">Instance Name</th>
                    {scope !== 'Cluster' && <th className="py-2.5 px-3">Project / Namespace</th>}
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Age</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3e3d32]/60">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-[#3e3d32]/60 transition-colors group cursor-pointer"
                      onClick={() => onEditInstance(item)}
                    >
                      {/* Name - Clickable to Edit YAML */}
                      <td className="py-2.5 px-4 font-bold text-white group-hover:text-[#66d9ef] transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#a6e22e]" />
                          <span className="truncate max-w-[340px]" title={item.name}>
                            {item.name}
                          </span>
                        </div>
                      </td>

                      {/* Namespace */}
                      {scope !== 'Cluster' && (
                        <td className="py-2.5 px-3 text-[#ae81ff]">
                          <span className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/80">
                            {item.namespace}
                          </span>
                        </td>
                      )}

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            item.statusColor === 'green'
                              ? 'bg-emerald-950/60 text-[#a6e22e] border-emerald-800'
                              : item.statusColor === 'red'
                              ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                              : 'bg-amber-950/60 text-[#fd971f] border-amber-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      {/* Age */}
                      <td className="py-2.5 px-3 text-[#75715e]">{item.age}</td>

                      {/* Action Buttons */}
                      <td className="py-2 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          {/* Edit YAML */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditInstance(item);
                            }}
                            className="p-1.5 rounded bg-[#1e1f1c] hover:bg-[#66d9ef]/20 text-[#66d9ef] border border-[#3e3d32] hover:border-[#66d9ef]/50 transition-colors"
                            title="Edit Custom Resource YAML"
                            aria-label="Edit YAML"
                          >
                            <FileCode2 size={13} />
                          </button>

                          {/* Describe */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDescribeInstance(item);
                            }}
                            className="p-1.5 rounded bg-[#1e1f1c] hover:bg-[#3e3d32] text-slate-300 hover:text-white border border-[#3e3d32] transition-colors"
                            title="Describe Custom Resource"
                            aria-label="Describe"
                          >
                            <FileText size={13} />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteInstance(item);
                            }}
                            className="p-1.5 rounded bg-[#1e1f1c] hover:bg-rose-950/60 text-[#75715e] hover:text-rose-300 border border-[#3e3d32] hover:border-rose-800 transition-colors"
                            title="Delete Custom Resource"
                            aria-label="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#272822] border-t border-[#3e3d32] flex items-center justify-between text-xs text-[#75715e] font-mono shrink-0">
          <div>
            <span>Total instances: {items.length}</span>
            {group && (
              <>
                <span className="mx-2">•</span>
                <span>API Group: {group}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span>Press <strong>Esc</strong> to return</span>
          </div>
        </div>
      </div>
    </div>
  );
};
