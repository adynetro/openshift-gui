import React, { useState } from 'react';
import { X, SlidersHorizontal, RefreshCw, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';

interface ActionDialogProps {
  mode: 'scale' | 'restart' | 'delete';
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ActionDialog: React.FC<ActionDialogProps> = ({
  mode,
  item,
  namespace,
  onClose,
  onSuccess,
  onError,
}) => {
  const currentDesired = item.extra?.desired ?? 1;
  const [replicas, setReplicas] = useState<number>(currentDesired);
  const [loading, setLoading] = useState<boolean>(false);

  const handleExecute = async () => {
    setLoading(true);
    try {
      let cmdKind: string = item.kind;
      if (cmdKind === 'imagestreams') cmdKind = 'is';
      if (cmdKind === 'statefulsets') cmdKind = 'sts';
      if (cmdKind === 'configmaps') cmdKind = 'cm';

      if (mode === 'scale') {
        const res = await (window as any).electronAPI.scaleResource(cmdKind, item.name, namespace, replicas);
        if (res.success) onSuccess(res.message);
        else onError(res.message);
      } else if (mode === 'restart') {
        const res = await (window as any).electronAPI.rolloutRestart(cmdKind, item.name, namespace);
        if (res.success) onSuccess(res.message);
        else onError(res.message);
      } else if (mode === 'delete') {
        const res = await (window as any).electronAPI.deleteResource(cmdKind, item.name, namespace);
        if (res.success) onSuccess(res.message);
        else onError(res.message);
      }
    } catch (e: any) {
      onError(e.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const getDialogConfig = () => {
    switch (mode) {
      case 'scale':
        return {
          title: 'Scale Workload Replicas',
          icon: SlidersHorizontal,
          iconColor: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
          borderColor: 'border-cyan-500/40',
          buttonText: `Scale to ${replicas} Replicas`,
          buttonColor: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/50',
        };
      case 'restart':
        return {
          title: 'Rollout Restart',
          icon: RefreshCw,
          iconColor: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
          borderColor: 'border-amber-500/40',
          buttonText: 'Restart Workload',
          buttonColor: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/50',
        };
      case 'delete':
        return {
          title: 'Delete Resource',
          icon: Trash2,
          iconColor: 'text-rose-400 bg-rose-500/20 border-rose-500/30',
          borderColor: 'border-rose-500/40',
          buttonText: 'Permanently Delete',
          buttonColor: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/50',
        };
    }
  };

  const config = getDialogConfig();
  const Icon = config.icon;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div
        className={`border ${config.borderColor} rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col transition-colors`}
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-color, #334155)',
          color: 'var(--text-main, #f8fafc)',
        }}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${config.iconColor}`}>
              <Icon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold">{config.title}</h2>
              <p className="text-xs opacity-60 font-mono">
                {item.kind}/{item.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/10 transition-colors"
            title="Close window (Esc)"
            aria-label="Close window"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {mode === 'scale' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs opacity-80">
                <span>Current Replicas: <strong className="text-cyan-400 font-mono">{currentDesired}</strong></span>
                <span>Namespace: <strong className="font-mono">{namespace}</strong></span>
              </div>

              {/* Counter Input with Direct Text Box */}
              <div
                className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl border"
                style={{
                  backgroundColor: 'var(--bg-input, #0f172a)',
                  borderColor: 'var(--border-subtle, #334155)',
                }}
              >
                <div className="flex items-center justify-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setReplicas((prev) => Math.max(0, prev - 1))}
                    className="w-10 h-10 rounded-lg border opacity-80 hover:opacity-100 font-bold text-lg flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-card, #1e293b)',
                      borderColor: 'var(--border-color, #334155)',
                    }}
                    title="Decrease by 1"
                  >
                    -
                  </button>

                  {/* Direct Editable Textbox for Replicas */}
                  <div className="relative flex items-center justify-center">
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={isNaN(replicas) ? '' : replicas}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                        setReplicas(isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !loading) {
                          e.preventDefault();
                          handleExecute();
                        }
                      }}
                      className="w-28 h-12 text-center font-mono text-2xl font-black text-cyan-300 rounded-lg border border-cyan-500/40 bg-slate-950/80 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all shadow-inner"
                      title="Directly enter target number of replicas"
                      autoFocus
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setReplicas((prev) => prev + 1)}
                    className="w-10 h-10 rounded-lg border opacity-80 hover:opacity-100 font-bold text-lg flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-card, #1e293b)',
                      borderColor: 'var(--border-color, #334155)',
                    }}
                    title="Increase by 1"
                  >
                    +
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center justify-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Presets:</span>
                  {[0, 1, 2, 3, 5, 10].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setReplicas(count)}
                      className={`px-2 py-0.5 rounded text-xs font-mono font-bold border transition-all cursor-pointer ${
                        replicas === count
                          ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {count === 0 ? '0 (Stop)' : count}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slider */}
              <div className="space-y-1">
                <input
                  type="range"
                  min={0}
                  max={Math.max(20, replicas, currentDesired)}
                  value={replicas}
                  onChange={(e) => setReplicas(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>0 (Scale Down)</span>
                  <span>Max: {Math.max(20, replicas, currentDesired)}</span>
                </div>
              </div>
            </div>
          )}

          {mode === 'restart' && (
            <div className="space-y-2">
              <p className="text-sm">
                Are you sure you want to trigger a rolling restart for{' '}
                <strong className="font-mono">{item.name}</strong>?
              </p>
              <p className="text-xs opacity-70">
                This triggers a safe zero-downtime rolling replacement of all running pod replicas.
              </p>
            </div>
          )}

          {mode === 'delete' && (
            <div
              className="p-3 border rounded-lg space-y-2"
              style={{
                backgroundColor: 'rgba(225, 29, 72, 0.1)',
                borderColor: 'rgba(225, 29, 72, 0.3)',
              }}
            >
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                <AlertTriangle size={15} />
                <span>Permanent Deletion Warning</span>
              </div>
              <p className="text-xs text-rose-200">
                Are you sure you want to delete <strong className="font-mono">{item.kind}/{item.name}</strong> in project <strong className="font-mono">{namespace}</strong>?
              </p>
              <p className="text-[11px] opacity-70">
                This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="p-4 border-t flex items-center justify-end gap-2"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
          }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium border opacity-80 hover:opacity-100 hover:bg-white/5 transition-colors disabled:opacity-30"
            style={{
              borderColor: 'var(--border-subtle, #334155)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={loading}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50 ${config.buttonColor}`}
          >
            {loading && <RefreshCw size={13} className="animate-spin" />}
            <span>{config.buttonText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
