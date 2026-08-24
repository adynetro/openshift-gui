import React, { useState, useEffect } from 'react';
import { X, Save, FileCode2, RefreshCw, AlertTriangle, CheckCircle2, Copy, Check, RotateCcw } from 'lucide-react';
import { parse as parseYaml } from 'yaml';
import { ResourceItem } from '../../types/k8s.js';

interface EditYamlModalProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const EditYamlModal: React.FC<EditYamlModalProps> = ({
  item,
  namespace,
  onClose,
  onSuccess,
}) => {
  const [yamlText, setYamlText] = useState<string>('');
  const [originalYaml, setOriginalYaml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let cmdKind: string = item.kind;
        if (cmdKind === 'deploymentconfigs') cmdKind = 'dc';
        if (cmdKind === 'imagestreams') cmdKind = 'is';
        if (cmdKind === 'statefulsets') cmdKind = 'sts';
        if (cmdKind === 'daemonsets') cmdKind = 'ds';
        if (cmdKind === 'configmaps') cmdKind = 'cm';

        const text = await (window as any).electronAPI.getYaml(cmdKind, item.name, namespace);
        setYamlText(text);
        setOriginalYaml(text);
      } catch (err: any) {
        setStatusMessage({ text: err.message || 'Failed to load YAML', type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [item, namespace]);

  const handleTextChange = (val: string) => {
    setYamlText(val);
    try {
      parseYaml(val);
      setValidationError(null);
    } catch (err: any) {
      setValidationError(err.message || 'YAML syntax error');
    }
  };

  const handleSave = async () => {
    // Validate first
    try {
      parseYaml(yamlText);
    } catch (err: any) {
      setValidationError(`Invalid YAML: ${err.message}`);
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await (window as any).electronAPI.applyYaml(yamlText, namespace);
      if (res.success) {
        onSuccess(res.message);
        onClose();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to apply changes', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(yamlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (window.confirm('Discard all unapplied edits and reset to original YAML?')) {
      setYamlText(originalYaml);
      setValidationError(null);
    }
  };

  const isDirty = yamlText !== originalYaml;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#0b0f19] border border-cyan-500/40 rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <FileCode2 size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Edit Resource YAML:{' '}
                <span className="text-cyan-400 font-mono">
                  {item.kind}/{item.name}
                </span>
                {isDirty && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
                    Unsaved Changes
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Project: {namespace} • Live Edit & Apply
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                onClick={handleReset}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 border border-slate-700 transition-colors"
                title="Reset to original"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}

            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 border border-slate-700 transition-colors"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving || loading || !!validationError}
              className="px-3.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              <span>Save & Apply</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Validation Error Alert */}
        {validationError && (
          <div className="px-4 py-2 bg-rose-950/80 text-rose-300 border-b border-rose-800 text-xs flex items-center gap-2 font-mono">
            <AlertTriangle size={14} className="shrink-0 text-rose-400" />
            <span className="truncate">{validationError}</span>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs flex items-center gap-2 border-b font-mono ${
              statusMessage.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-800'
                : 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
            }`}
          >
            {statusMessage.type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* YAML Code Editor Area */}
        <div className="flex-1 overflow-hidden flex bg-black">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
              <RefreshCw size={18} className="animate-spin text-cyan-400" />
              <span className="text-xs">Loading resource YAML...</span>
            </div>
          ) : (
            <textarea
              value={yamlText}
              onChange={(e) => handleTextChange(e.target.value)}
              spellCheck={false}
              className="flex-1 p-4 bg-[#070b14] text-slate-100 font-mono text-xs leading-relaxed outline-none resize-none selection:bg-cyan-900 border-none overflow-auto"
            />
          )}
        </div>

        {/* Footer info */}
        <div className="p-2.5 bg-[#0f172a] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            Press <strong>Save & Apply</strong> to update this workload live in project{' '}
            <code className="text-cyan-300 bg-slate-800 px-1 rounded">{namespace}</code>.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !!validationError}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-40"
            >
              <Save size={12} />
              <span>Save & Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
