import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  HardDrive,
  Maximize2,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Save,
} from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';

interface ResizePvcModalProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const ResizePvcModal: React.FC<ResizePvcModalProps> = ({
  item,
  namespace,
  onClose,
  onSuccess,
}) => {
  const currentCapacityStr = item.extra?.capacity || '1Gi';
  const currentNumericSize = parseInt(currentCapacityStr, 10) || 1;
  const currentUnit = currentCapacityStr.replace(/\d+/g, '').trim() || 'Gi';

  const [newSizeNumber, setNewSizeNumber] = useState<number>(currentNumericSize + 5);
  const [unit, setUnit] = useState<string>(currentUnit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageClass = item.extra?.storageClass || '-';
  const volumeName = item.extra?.volume || '-';
  const accessModes = item.extra?.accessModes || 'RWO';

  const handleQuickAdd = (delta: number) => {
    setNewSizeNumber((prev) => Math.max(currentNumericSize + 1, prev + delta));
  };

  const handleDouble = () => {
    setNewSizeNumber(currentNumericSize * 2);
  };

  const handleResize = async () => {
    if (newSizeNumber <= currentNumericSize && unit === currentUnit) {
      setError(`New storage size (${newSizeNumber}${unit}) must be greater than current size (${currentCapacityStr}). Kubernetes PVCs cannot be downsized.`);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newSize = `${newSizeNumber}${unit}`;
      const res = await (window as any).electronAPI.resizePvc(item.name, namespace, newSize);
      if (res.success) {
        onSuccess(res.message);
        onClose();
      } else {
        setError(res.message || 'Failed to resize PVC');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resize PVC');
    } finally {
      setLoading(false);
    }
  };

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

  const percentOld = Math.min(100, Math.round((currentNumericSize / (newSizeNumber || 1)) * 100));

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-[92vw] max-w-[650px] overflow-hidden text-[#f8f8f2]">
        {/* Header */}
        <div className="p-4 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#3e3d32] flex items-center justify-center border border-[#49483e] text-[#a6e22e]">
              <Database size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#f8f8f2] font-mono">
                  <span>Resize PVC:</span>
                  <span className="text-[#66d9ef] ml-1">{item.name}</span>
                </h2>
                <span className="px-2 py-0.2 rounded bg-emerald-950/60 border border-emerald-800 text-[10px] text-emerald-300 font-mono">
                  {item.status}
                </span>
              </div>
              <p className="text-[11px] text-[#75715e] font-mono">
                Dynamically expand persistent volume storage capacity
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#75715e] hover:text-[#f8f8f2] hover:bg-[#3e3d32] transition-colors"
            title="Close window (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 font-mono">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2">
              <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Current PVC Metadata Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2.5 bg-[#272822] border border-[#3e3d32] rounded-lg">
              <div className="text-[10px] font-bold text-[#75715e] uppercase">Current Size</div>
              <div className="text-sm font-bold text-[#a6e22e]">{currentCapacityStr}</div>
            </div>

            <div className="p-2.5 bg-[#272822] border border-[#3e3d32] rounded-lg">
              <div className="text-[10px] font-bold text-[#75715e] uppercase">StorageClass</div>
              <div className="text-xs font-bold text-[#66d9ef] truncate" title={storageClass}>
                {storageClass}
              </div>
            </div>

            <div className="p-2.5 bg-[#272822] border border-[#3e3d32] rounded-lg">
              <div className="text-[10px] font-bold text-[#75715e] uppercase">Access Mode</div>
              <div className="text-xs font-bold text-[#fd971f]">{accessModes}</div>
            </div>
          </div>

          {/* Resize Controls */}
          <div className="p-4 bg-[#272822] border border-[#3e3d32] rounded-lg space-y-3">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wide block">
              Target Storage Capacity
            </label>

            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center bg-[#1e1f1c] border border-[#49483e] rounded-lg px-3 py-1.5 focus-within:border-[#a6e22e]">
                <HardDrive size={15} className="text-[#a6e22e] mr-2" />
                <input
                  type="number"
                  min={currentNumericSize + 1}
                  value={newSizeNumber}
                  onChange={(e) => setNewSizeNumber(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-transparent text-sm font-bold text-white focus:outline-none"
                />
              </div>

              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="bg-[#1e1f1c] border border-[#49483e] rounded-lg px-3 py-2 text-xs font-bold text-[#66d9ef] focus:outline-none"
              >
                <option value="Gi">Gi (Gibibytes)</option>
                <option value="Ti">Ti (Tebibytes)</option>
                <option value="Mi">Mi (Mebibytes)</option>
              </select>
            </div>

            {/* Quick Add Pills */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-[#75715e]">Quick add:</span>
              <button
                onClick={() => handleQuickAdd(1)}
                className="px-2 py-1 rounded bg-[#1e1f1c] hover:bg-[#3e3d32] text-xs font-bold text-[#a6e22e] border border-[#3e3d32] transition-colors"
              >
                +1 {unit}
              </button>
              <button
                onClick={() => handleQuickAdd(5)}
                className="px-2 py-1 rounded bg-[#1e1f1c] hover:bg-[#3e3d32] text-xs font-bold text-[#a6e22e] border border-[#3e3d32] transition-colors"
              >
                +5 {unit}
              </button>
              <button
                onClick={() => handleQuickAdd(10)}
                className="px-2 py-1 rounded bg-[#1e1f1c] hover:bg-[#3e3d32] text-xs font-bold text-[#a6e22e] border border-[#3e3d32] transition-colors"
              >
                +10 {unit}
              </button>
              <button
                onClick={handleDouble}
                className="px-2 py-1 rounded bg-[#1e1f1c] hover:bg-[#3e3d32] text-xs font-bold text-[#66d9ef] border border-[#3e3d32] transition-colors"
              >
                2x Double
              </button>
            </div>
          </div>

          {/* Visual Storage Expansion Graph */}
          <div className="p-3 bg-[#272822] border border-[#3e3d32] rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#75715e]">Capacity Expansion:</span>
              <span className="flex items-center gap-2 font-bold">
                <span className="text-[#75715e]">{currentCapacityStr}</span>
                <ArrowRight size={12} className="text-[#a6e22e]" />
                <span className="text-[#a6e22e]">
                  {newSizeNumber}
                  {unit}
                </span>
              </span>
            </div>

            {/* Capacity Progress Bar */}
            <div className="w-full bg-[#1e1f1c] h-4 rounded-full overflow-hidden flex border border-[#3e3d32]">
              <div
                style={{ width: `${percentOld}%` }}
                className="bg-[#66d9ef] h-full flex items-center justify-center text-[9px] font-bold text-[#272822]"
                title={`Current: ${currentCapacityStr}`}
              >
                Current ({currentCapacityStr})
              </div>
              <div
                style={{ width: `${100 - percentOld}%` }}
                className="bg-[#a6e22e]/40 h-full flex items-center justify-center text-[9px] font-bold text-[#a6e22e]"
                title={`New expansion: +${Math.max(0, newSizeNumber - currentNumericSize)}${unit}`}
              >
                +{Math.max(0, newSizeNumber - currentNumericSize)}
                {unit}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#272822] border-t border-[#3e3d32] flex items-center justify-end gap-2 font-mono">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#3e3d32] border border-[#49483e] text-xs transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleResize}
            disabled={loading || newSizeNumber <= currentNumericSize}
            className="px-4 py-1.5 rounded-lg bg-[#a6e22e] hover:bg-[#a6e22e]/80 text-[#272822] font-bold text-xs flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
          >
            <Maximize2 size={13} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Resizing...' : `Expand Storage to ${newSizeNumber}${unit}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
