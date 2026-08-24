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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className={`bg-[#0f172a] border ${config.borderColor} rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${config.iconColor}`}>
              <Icon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{config.title}</h2>
              <p className="text-xs text-slate-400 font-mono">
                {item.kind}/{item.name}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {mode === 'scale' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Current Replicas: <strong className="text-cyan-400 font-mono">{currentDesired}</strong></span>
                <span>Namespace: <strong className="text-slate-200 font-mono">{namespace}</strong></span>
              </div>

              {/* Counter Input */}
              <div className="flex items-center justify-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-800">
                <button
                  onClick={() => setReplicas((prev) => Math.max(0, prev - 1))}
                  className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg flex items-center justify-center border border-slate-700 active:scale-95 transition-all"
                >
                  -
                </button>

                <div className="w-20 text-center font-mono text-2xl font-black text-cyan-300">
                  {replicas}
                </div>

                <button
                  onClick={() => setReplicas((prev) => prev + 1)}
                  className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg flex items-center justify-center border border-slate-700 active:scale-95 transition-all"
                >
                  +
                </button>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={0}
                max={20}
                value={replicas}
                onChange={(e) => setReplicas(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          )}

          {mode === 'restart' && (
            <div className="space-y-2">
              <p className="text-sm text-slate-200">
                Are you sure you want to trigger a rolling restart for{' '}
                <strong className="text-white font-mono">{item.name}</strong>?
              </p>
              <p className="text-xs text-slate-400">
                This triggers a safe zero-downtime rolling replacement of all running pod replicas.
              </p>
            </div>
          )}

          {mode === 'delete' && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                <AlertTriangle size={15} />
                <span>Permanent Deletion Warning</span>
              </div>
              <p className="text-xs text-rose-200">
                Are you sure you want to delete <strong className="font-mono text-white">{item.kind}/{item.name}</strong> in project <strong className="font-mono text-white">{namespace}</strong>?
              </p>
              <p className="text-[11px] text-rose-300/80">
                This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
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
