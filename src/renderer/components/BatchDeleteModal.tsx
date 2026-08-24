import React, { useState, useEffect } from "react";
import { X, Trash2, AlertTriangle, RefreshCw, Box } from "lucide-react";
import { ResourceItem } from "../../types/k8s.js";

interface BatchDeleteModalProps {
  items: ResourceItem[];
  namespace: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const BatchDeleteModal: React.FC<BatchDeleteModalProps> = ({
  items,
  namespace,
  onClose,
  onSuccess,
  onError,
}) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleExecute = async () => {
    setLoading(true);
    try {
      const podNames = items.map((i) => i.name);
      const res = await (window as any).electronAPI.deleteMultiplePods(podNames, namespace);
      if (res.success) {
        onSuccess(res.message || `Successfully deleted ${podNames.length} pod(s).`);
      } else {
        onError(res.message || "Failed to delete pods");
      }
    } catch (e: any) {
      onError(e.message || "Failed to execute batch deletion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border transition-colors"
        style={{
          backgroundColor: "var(--bg-card, #1e293b)",
          borderColor: "rgba(244, 63, 94, 0.4)",
          color: "var(--text-main, #f8fafc)",
        }}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{
            backgroundColor: "var(--bg-card-header, #0f172a)",
            borderColor: "var(--border-color, #334155)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-rose-500/20 text-rose-400 border-rose-500/30">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold">Batch Delete Pods</h2>
              <p className="text-xs font-mono opacity-60">
                Project: <strong className="opacity-100">{namespace}</strong> • {items.length} selected
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/10 transition-all disabled:opacity-30"
            title="Close window (Esc)"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Warning Banner */}
          <div
            className="p-3 rounded-lg border space-y-1.5"
            style={{
              backgroundColor: "rgba(225, 29, 72, 0.1)",
              borderColor: "rgba(225, 29, 72, 0.3)",
            }}
          >
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
              <AlertTriangle size={15} />
              <span>Permanent Termination Warning</span>
            </div>
            <p className="text-xs text-rose-200">
              Are you sure you want to permanently delete{" "}
              <strong>{items.length} pod(s)</strong> in project{" "}
              <strong className="font-mono">{namespace}</strong>?
            </p>
            <p className="text-[11px] opacity-70">
              This action cannot be undone. Running pods will be terminated.
            </p>
          </div>

          {/* Pods List */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider font-mono opacity-60 flex items-center justify-between">
              <span>Pods to be deleted ({items.length})</span>
            </div>
            <div
              className="max-h-48 overflow-y-auto p-2 rounded-lg border space-y-1 font-mono text-xs"
              style={{
                backgroundColor: "var(--bg-input, #0f172a)",
                borderColor: "var(--border-subtle, #334155)",
              }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-2 py-1 rounded bg-white/5 text-xs truncate"
                >
                  <Box size={13} className="text-rose-400 shrink-0" />
                  <span className="truncate">{item.name}</span>
                  {item.status && (
                    <span className="ml-auto text-[10px] opacity-60 px-1.5 py-0.2 rounded border border-white/10 shrink-0">
                      {item.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="p-4 border-t flex items-center justify-end gap-2"
          style={{
            backgroundColor: "var(--bg-card-header, #0f172a)",
            borderColor: "var(--border-color, #334155)",
          }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium border opacity-80 hover:opacity-100 hover:bg-white/5 transition-all disabled:opacity-30"
            style={{
              borderColor: "var(--border-subtle, #334155)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={loading || items.length === 0}
            className="px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50 bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/60"
          >
            {loading ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            <span>{loading ? "Deleting Pods..." : `Delete ${items.length} Pods`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
