import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Save,
  RefreshCw,
  AlertTriangle,
  FileCode2,
  Lock,
  Unlock,
} from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';

interface SecretEditorModalProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

interface SecretEntry {
  id: string;
  key: string;
  value: string;
  isMasked: boolean;
}

export const SecretEditorModal: React.FC<SecretEditorModalProps> = ({
  item,
  namespace,
  onClose,
  onSuccess,
}) => {
  const [entries, setEntries] = useState<SecretEntry[]>([]);
  const [secretType, setSecretType] = useState<string>('Opaque');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealAll, setRevealAll] = useState(false);

  const fetchSecret = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await (window as any).electronAPI.getSecretData(item.name, namespace);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setSecretType(res.type || 'Opaque');
        const list: SecretEntry[] = Object.entries(res.data).map(([k, v], idx) => ({
          id: `entry-${idx}-${Date.now()}`,
          key: k,
          value: v as string,
          isMasked: true,
        }));
        setEntries(list);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load secret data');
    } finally {
      setLoading(false);
    }
  }, [item.name, namespace]);

  useEffect(() => {
    fetchSecret();
  }, [fetchSecret]);

  // Global toggle reveal/mask
  const handleToggleRevealAll = () => {
    const next = !revealAll;
    setRevealAll(next);
    setEntries((prev) => prev.map((e) => ({ ...e, isMasked: !next })));
  };

  const handleAddEntry = () => {
    const newEntry: SecretEntry = {
      id: `entry-${Date.now()}`,
      key: '',
      value: '',
      isMasked: false,
    };
    setEntries((prev) => [...prev, newEntry]);
  };

  const handleDeleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleUpdateEntry = (id: string, field: 'key' | 'value', val: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: val } : e))
    );
  };

  const handleToggleMask = (id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isMasked: !e.isMasked } : e))
    );
  };

  const handleCopyValue = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Validate entries
      const data: Record<string, string> = {};
      for (const entry of entries) {
        const trimmedKey = entry.key.trim();
        if (!trimmedKey) {
          setError('Secret key names cannot be empty.');
          setSaving(false);
          return;
        }
        data[trimmedKey] = entry.value;
      }

      const res = await (window as any).electronAPI.saveSecret(
        item.name,
        namespace,
        data,
        secretType
      );

      if (res.success) {
        onSuccess(res.message);
        onClose();
      } else {
        setError(res.message || 'Failed to save secret');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut ⌘S to save, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-[92vw] max-w-[1300px] h-[90vh] flex flex-col overflow-hidden text-[#f8f8f2]">
        {/* Monokai Header */}
        <div className="p-3.5 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#3e3d32] flex items-center justify-center border border-[#49483e] text-[#fd971f]">
              <Key size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#f8f8f2] flex items-center gap-2 font-mono">
                  <span>Secret:</span>
                  <span className="text-[#a6e22e]">{item.name}</span>
                </h2>
                <span className="px-2 py-0.2 rounded bg-purple-950/60 border border-purple-800 text-[10px] text-purple-300 font-mono">
                  {secretType}
                </span>
                <span className="px-2 py-0.2 rounded bg-cyan-950/60 border border-cyan-800 text-[10px] text-cyan-300 font-mono">
                  Project: {namespace}
                </span>
              </div>
              <p className="text-[11px] text-[#75715e] font-mono">
                Decoded key-value GUI editor • Auto-encodes to base64 on save (⌘S)
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleRevealAll}
              className="px-2.5 py-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-slate-300 hover:text-white border border-[#49483e] text-xs font-mono flex items-center gap-1.5 transition-colors"
              title={revealAll ? 'Mask all secret values' : 'Reveal all secret values'}
            >
              {revealAll ? <EyeOff size={13} className="text-[#fd971f]" /> : <Eye size={13} className="text-[#66d9ef]" />}
              <span>{revealAll ? 'Mask All' : 'Reveal All'}</span>
            </button>

            <button
              onClick={handleAddEntry}
              className="px-2.5 py-1.5 rounded-lg bg-[#a6e22e]/15 hover:bg-[#a6e22e]/30 text-[#a6e22e] border border-[#a6e22e]/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Add a new key-value entry"
            >
              <Plus size={13} />
              <span>Add Key</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-3 py-1.5 rounded-lg bg-[#a6e22e] hover:bg-[#a6e22e]/80 text-[#272822] font-bold text-xs flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
              title="Save & Apply Secret (⌘S)"
            >
              <Save size={13} className={saving ? 'animate-spin' : ''} />
              <span>{saving ? 'Saving...' : 'Save Secret'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#75715e] hover:text-[#f8f8f2] hover:bg-[#3e3d32] transition-colors ml-1"
              title="Close editor (Esc)"
              aria-label="Close window"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Editor Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono">
          {loading && (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="animate-spin text-[#66d9ef]" size={28} />
              <p className="text-sm text-[#75715e]">Loading and decoding secret keys...</p>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center space-y-3 text-center text-[#75715e]">
              <Key size={32} className="text-[#49483e]" />
              <p className="text-sm">This secret currently has no key-value data.</p>
              <button
                onClick={handleAddEntry}
                className="px-3 py-1.5 rounded-lg bg-[#a6e22e]/20 text-[#a6e22e] border border-[#a6e22e]/40 text-xs font-bold flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>Add First Key/Value</span>
              </button>
            </div>
          )}

          {!loading &&
            entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="bg-[#272822] border border-[#3e3d32] hover:border-[#49483e] rounded-lg p-3.5 space-y-2.5 transition-colors group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[11px] text-[#75715e] font-bold">#{idx + 1}</span>
                    <input
                      type="text"
                      value={entry.key}
                      onChange={(e) => handleUpdateEntry(entry.id, 'key', e.target.value)}
                      placeholder="KEY_NAME (e.g. API_KEY, password, tls.key)"
                      className="flex-1 max-w-[360px] bg-[#1e1f1c] border border-[#49483e] focus:border-[#66d9ef] rounded px-2.5 py-1 text-xs text-[#66d9ef] font-bold focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleMask(entry.id)}
                      className="p-1.5 rounded bg-[#1e1f1c] hover:bg-[#3e3d32] text-[#75715e] hover:text-[#f8f8f2] border border-[#3e3d32] transition-colors"
                      title={entry.isMasked ? 'Reveal value' : 'Mask value'}
                    >
                      {entry.isMasked ? <Eye size={13} /> : <EyeOff size={13} className="text-[#fd971f]" />}
                    </button>

                    <button
                      onClick={() => handleCopyValue(entry.id, entry.value)}
                      className="p-1.5 rounded bg-[#1e1f1c] hover:bg-[#3e3d32] text-[#75715e] hover:text-[#a6e22e] border border-[#3e3d32] transition-colors"
                      title="Copy plaintext value"
                    >
                      {copiedId === entry.id ? <Check size={13} className="text-[#a6e22e]" /> : <Copy size={13} />}
                    </button>

                    <button
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="p-1.5 rounded bg-[#1e1f1c] hover:bg-rose-950/60 text-[#75715e] hover:text-rose-300 border border-[#3e3d32] hover:border-rose-800 transition-colors"
                      title="Delete this key"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Plaintext / Masked Value Textarea */}
                <div>
                  <textarea
                    rows={entry.value.includes('\n') ? 5 : 2}
                    value={entry.isMasked ? '••••••••••••••••••••••••••••••••' : entry.value}
                    onChange={(e) => {
                      if (!entry.isMasked) {
                        handleUpdateEntry(entry.id, 'value', e.target.value);
                      }
                    }}
                    onFocus={() => {
                      if (entry.isMasked) handleToggleMask(entry.id);
                    }}
                    placeholder="Enter secret value..."
                    className={`w-full bg-[#1e1f1c] border border-[#3e3d32] focus:border-[#a6e22e] rounded p-2.5 text-xs text-[#f8f8f2] focus:outline-none font-mono resize-y ${
                      entry.isMasked ? 'text-[#75715e] tracking-widest' : ''
                    }`}
                  />
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#272822] border-t border-[#3e3d32] flex items-center justify-between text-xs text-[#75715e] font-mono shrink-0">
          <div>
            <span>Keys: {entries.length}</span>
            <span className="mx-2">•</span>
            <span>Type: {secretType}</span>
          </div>

          <div className="flex items-center gap-2">
            <span>Press <strong>⌘S</strong> to Save & Apply</span>
          </div>
        </div>
      </div>
    </div>
  );
};
