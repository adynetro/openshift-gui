import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, FileCode2, RefreshCw, AlertTriangle, CheckCircle2, Copy, Check, RotateCcw, ShieldCheck } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { monokai } from '@uiw/codemirror-theme-monokai';
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

  const handleTextChange = useCallback((val: string) => {
    setYamlText(val);
    try {
      if (val.trim()) {
        parseYaml(val);
      }
      setValidationError(null);
    } catch (err: any) {
      setValidationError(err.message || 'YAML syntax error');
    }
  }, []);

  const handleSave = async () => {
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

  // Keyboard shortcut: Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!saving && !loading && !validationError) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, loading, validationError, yamlText]);

  const isDirty = yamlText !== originalYaml;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-in fade-in duration-150"
    >
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-[96vw] max-w-[1750px] h-[94vh] flex flex-col overflow-hidden">
        {/* Monokai Header */}
        <div className="p-3 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#a6e22e]/10 text-[#a6e22e] flex items-center justify-center border border-[#a6e22e]/30">
              <FileCode2 size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#f8f8f2] flex items-center gap-2">
                IDE Resource Editor:{' '}
                <span className="text-[#66d9ef] font-mono">
                  {item.kind}/{item.name}
                </span>
                {isDirty && (
                  <span className="px-2 py-0.5 rounded-full bg-[#fd971f]/20 text-[#fd971f] border border-[#fd971f]/40 text-[10px] font-semibold">
                    • Modified
                  </span>
                )}
                {!validationError && !loading && (
                  <span className="px-2 py-0.5 rounded-full bg-[#a6e22e]/20 text-[#a6e22e] border border-[#a6e22e]/40 text-[10px] font-semibold flex items-center gap-1">
                    <ShieldCheck size={10} /> Valid YAML
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-[#75715e] font-mono">
                Project: {namespace} • Monokai Theme & JetBrains Mono
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-[#f8f8f2] text-xs font-medium flex items-center gap-1 border border-[#49483e] transition-colors cursor-pointer"
                title="Reset to original"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}

            <button
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-[#f8f8f2] text-xs font-medium flex items-center gap-1 border border-[#49483e] transition-colors cursor-pointer"
            >
              {copied ? <Check size={13} className="text-[#a6e22e]" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving || loading || !!validationError}
              className="px-3.5 py-1.5 rounded-lg bg-[#a6e22e] hover:bg-[#a6e22e]/80 text-[#272822] text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-black/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Save changes and apply to cluster (Cmd+S)"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              <span>Save & Apply (⌘S)</span>
            </button>

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

        {/* Validation Error Alert */}
        {validationError && (
          <div className="px-4 py-2 bg-[#f92672]/20 text-[#f92672] border-b border-[#f92672]/40 text-xs flex items-center gap-2 font-mono">
            <AlertTriangle size={14} className="shrink-0 text-[#f92672]" />
            <span className="truncate">{validationError}</span>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs flex items-center gap-2 border-b font-mono ${
              statusMessage.type === 'error'
                ? 'bg-[#f92672]/20 text-[#f92672] border-[#f92672]/40'
                : 'bg-[#a6e22e]/20 text-[#a6e22e] border-[#a6e22e]/40'
            }`}
          >
            {statusMessage.type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* CodeMirror IDE Editor */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#272822]">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[#75715e] gap-2">
              <RefreshCw size={18} className="animate-spin text-[#66d9ef]" />
              <span className="text-xs">Loading resource YAML...</span>
            </div>
          ) : (
            <div className="flex-1 h-full overflow-auto">
              <CodeMirror
                value={yamlText}
                height="100%"
                theme={monokai}
                extensions={[yaml()]}
                onChange={handleTextChange}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightSpecialChars: true,
                  history: true,
                  foldGutter: true,
                  drawSelection: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: true,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  closeBracketsKeymap: true,
                  searchKeymap: true,
                  foldKeymap: true,
                  completionKeymap: true,
                  lintKeymap: true,
                }}
              />
            </div>
          )}
        </div>

        {/* Monokai Footer info */}
        <div className="p-2.5 bg-[#1e1f1c] border-t border-[#3e3d32] flex items-center justify-between text-[11px] text-[#75715e]">
          <div className="flex items-center gap-3">
            <span>
              Press <kbd className="px-1.5 py-0.5 rounded bg-[#272822] text-[#f8f8f2] font-mono text-[10px]">⌘S</kbd> to Save & Apply directly to <code className="text-[#66d9ef] bg-[#272822] px-1 rounded">{namespace}</code>.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 rounded bg-[#272822] hover:bg-[#3e3d32] text-[#f8f8f2] text-xs font-medium border border-[#49483e]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !!validationError}
              className="px-3 py-1 rounded bg-[#a6e22e] hover:bg-[#a6e22e]/80 text-[#272822] text-xs font-bold flex items-center gap-1 disabled:opacity-40"
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
