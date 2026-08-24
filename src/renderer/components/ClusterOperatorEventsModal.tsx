import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  ShieldCheck,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Layers,
  FileText,
} from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';
import { FuzzyMatcher } from '../../utils/fuzzy.js';

interface ClusterOperatorEventsModalProps {
  operatorItem: ResourceItem;
  onClose: () => void;
}

export const ClusterOperatorEventsModal: React.FC<ClusterOperatorEventsModalProps> = ({
  operatorItem,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    operatorName: string;
    version?: string;
    status?: string;
    conditions: any[];
    events: ResourceItem[];
    relatedObjects?: any[];
    error?: string;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Warning' | 'Normal'>('ALL');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const api = (window as any).electronAPI;
      if (api?.getClusterOperatorEvents) {
        const res = await api.getClusterOperatorEvents(operatorItem.name);
        setData(res);
      }
    } catch (err: any) {
      setData({
        operatorName: operatorItem.name,
        conditions: [],
        events: [],
        error: err.message || 'Failed to fetch cluster operator events',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [operatorItem.name]);

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    let list = data.events;

    if (typeFilter !== 'ALL') {
      list = list.filter((ev) => ev.extra?.eventType === typeFilter);
    }

    if (query.trim()) {
      const matcher = new FuzzyMatcher(list, [
        'name',
        'namespace',
        'status',
        'extra.reason',
        'extra.message',
        'extra.objectName',
        'extra.objectKind',
      ]);
      list = matcher.search(query);
    }

    return list;
  }, [data?.events, query, typeFilter]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-[94vw] max-w-[1300px] h-[88vh] flex flex-col overflow-hidden text-[#f8f8f2]">
        {/* Header */}
        <div className="p-4 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#3e3d32] flex items-center justify-center border border-[#49483e] text-cyan-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-[#f8f8f2] font-mono flex items-center gap-2">
                  <span>Cluster Operator:</span>
                  <span className="text-cyan-400">{operatorItem.name}</span>
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                    (data?.status || operatorItem.status) === 'Available'
                      ? 'bg-emerald-950/80 text-[#a6e22e] border-emerald-700'
                      : (data?.status || operatorItem.status) === 'Progressing'
                      ? 'bg-amber-950/80 text-[#fd971f] border-amber-700'
                      : 'bg-rose-950/80 text-rose-300 border-rose-700'
                  }`}
                >
                  ● {data?.status || operatorItem.status || 'Available'}
                </span>
                {(data?.version || operatorItem.extra?.version) && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 font-bold">
                    v{data?.version || operatorItem.extra?.version}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#75715e] font-mono mt-0.5">
                Live events and condition state transition history
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-slate-300 hover:text-white border border-[#49483e] text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Refresh events"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#75715e] hover:text-[#f8f8f2] hover:bg-[#3e3d32] transition-colors ml-1"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Operator Conditions Bar */}
        {data?.conditions && data.conditions.length > 0 && (
          <div className="px-4 py-3 bg-[#272822]/80 border-b border-[#3e3d32] shrink-0">
            <div className="text-[11px] font-bold text-[#75715e] uppercase tracking-wider font-mono mb-2">
              Operator Conditions & Transition State
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {data.conditions.map((cond: any) => {
                const isDeg = cond.type === 'Degraded';
                const isProg = cond.type === 'Progressing';
                const isAvail = cond.type === 'Available';
                const isUpgr = cond.type === 'Upgradeable';

                const isGood =
                  (isAvail && cond.status === 'True') ||
                  (isUpgr && cond.status === 'True') ||
                  (isDeg && cond.status === 'False') ||
                  (isProg && cond.status === 'False');

                return (
                  <div
                    key={cond.type}
                    className={`p-2.5 rounded-lg border flex flex-col justify-between ${
                      isGood
                        ? 'bg-[#1e1f1c] border-[#3e3d32]'
                        : isDeg && cond.status === 'True'
                        ? 'bg-rose-950/40 border-rose-800'
                        : isProg && cond.status === 'True'
                        ? 'bg-amber-950/40 border-amber-800'
                        : 'bg-[#1e1f1c] border-[#3e3d32]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 font-mono">{cond.type}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                          isGood ? 'bg-emerald-950 text-[#a6e22e] border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {cond.status}
                      </span>
                    </div>
                    {cond.message && (
                      <p className="text-[11px] text-[#75715e] font-mono truncate mt-1" title={cond.message}>
                        {cond.message}
                      </p>
                    )}
                    {cond.reason && (
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Reason: {cond.reason}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Toolbar Filter */}
        <div className="p-3 bg-[#1e1f1c] border-b border-[#3e3d32] flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75715e]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter events by object, reason, or message..."
              className="w-full bg-[#272822] text-[#f8f8f2] text-xs font-mono rounded-lg pl-9 pr-3 py-1.5 border border-[#49483e] focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#272822] p-0.5 rounded-lg border border-[#3e3d32] text-xs font-mono">
            <button
              onClick={() => setTypeFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                typeFilter === 'ALL' ? 'bg-[#3e3d32] text-white font-bold' : 'text-[#75715e] hover:text-slate-200'
              }`}
            >
              All ({data?.events?.length || 0})
            </button>
            <button
              onClick={() => setTypeFilter('Warning')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                typeFilter === 'Warning' ? 'bg-rose-950 text-rose-300 font-bold border border-rose-800' : 'text-[#75715e] hover:text-rose-300'
              }`}
            >
              Warnings ({data?.events?.filter((e) => e.extra?.eventType === 'Warning').length || 0})
            </button>
            <button
              onClick={() => setTypeFilter('Normal')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                typeFilter === 'Normal' ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-800' : 'text-[#75715e] hover:text-emerald-300'
              }`}
            >
              Normal ({data?.events?.filter((e) => e.extra?.eventType === 'Normal').length || 0})
            </button>
          </div>
        </div>

        {/* Events Table Container */}
        <div className="flex-1 overflow-auto bg-[#1e1f1c]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <RefreshCw size={28} className="animate-spin text-cyan-400 mb-3" />
              <p className="text-xs font-mono text-[#75715e]">Loading events for {operatorItem.name}...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <CheckCircle2 size={36} className="text-[#a6e22e] mb-2 opacity-80" />
              <h3 className="text-sm font-bold text-slate-200 font-mono">No Events Recorded</h3>
              <p className="text-xs text-[#75715e] font-mono mt-1 max-w-md">
                No active events found for {operatorItem.name} and its operands in the cluster event buffer. The operator is running steadily.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#272822] z-10 border-b border-[#3e3d32]">
                <tr className="text-[#75715e] font-mono text-[11px]">
                  <th className="py-2.5 px-3 font-semibold">Type</th>
                  <th className="py-2.5 px-3 font-semibold">Reason</th>
                  <th className="py-2.5 px-3 font-semibold">Involved Object</th>
                  <th className="py-2.5 px-3 font-semibold">Namespace</th>
                  <th className="py-2.5 px-3 font-semibold">Message</th>
                  <th className="py-2.5 px-3 font-semibold">Count</th>
                  <th className="py-2.5 px-3 font-semibold">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3e3d32]/60 font-mono">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-[#3e3d32]/30 transition-colors">
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold border ${
                          ev.extra?.eventType === 'Warning'
                            ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                            : 'bg-emerald-950/80 text-[#a6e22e] border-emerald-800'
                        }`}
                      >
                        {ev.extra?.eventType || 'Normal'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-200">{ev.extra?.reason || ev.status}</td>
                    <td className="py-2 px-3 font-bold text-cyan-300">{ev.name}</td>
                    <td className="py-2 px-3 text-purple-300">
                      <span className="px-1.5 py-0.2 rounded bg-purple-950/60 border border-purple-800 text-[10px]">
                        {ev.namespace}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[#f8f8f2] break-words max-w-[400px] leading-relaxed">{ev.extra?.message}</td>
                    <td className="py-2 px-3 text-amber-300">{ev.extra?.count ? `${ev.extra.count}x` : '1x'}</td>
                    <td className="py-2 px-3 text-[#75715e] whitespace-nowrap">{ev.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#272822] border-t border-[#3e3d32] flex items-center justify-between text-xs text-[#75715e] font-mono shrink-0">
          <div>
            <span>Showing <strong>{filteredEvents.length}</strong> of <strong>{data?.events?.length || 0}</strong> events</span>
            {data?.relatedObjects && data.relatedObjects.length > 0 && (
              <span className="ml-3">• <strong>{data.relatedObjects.length}</strong> related objects monitored</span>
            )}
          </div>

          <div>
            <span>Press <strong>Esc</strong> to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
