import React, { useState, useEffect } from 'react';
import { X, Anchor, FileText, Code2, History, RotateCcw, Trash2, CheckCircle2, AlertTriangle, RefreshCw, Copy, Check, Save, Edit3 } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { monokai } from '@uiw/codemirror-theme-monokai';
import { parse as parseYaml } from 'yaml';
import { ResourceItem } from '../../types/k8s.js';

interface HelmModalProps {
  release: ResourceItem;
  namespace: string;
  onClose: () => void;
  onRefresh: () => void;
}

export const HelmModal: React.FC<HelmModalProps> = ({
  release,
  namespace,
  onClose,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'values' | 'edit-values' | 'manifest' | 'history'>('values');
  const [valuesContent, setValuesContent] = useState<string>('');
  const [editedValues, setEditedValues] = useState<string>('');
  const [manifestContent, setManifestContent] = useState<string>('');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        if (activeTab === 'values' || activeTab === 'edit-values') {
          const val = await (window as any).electronAPI.getHelmValues(release.name, namespace);
          setValuesContent(val);
          if (!editedValues) {
            setEditedValues(val);
          }
        } else if (activeTab === 'manifest') {
          const man = await (window as any).electronAPI.getHelmManifest(release.name, namespace);
          setManifestContent(man);
        } else if (activeTab === 'history') {
          const hist = await (window as any).electronAPI.getHelmHistory(release.name, namespace);
          setHistory(hist);
        }
      } catch (e: any) {
        setStatusMessage({ text: e.message || 'Failed to load Helm data', type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [activeTab, release.name, namespace]);

  const handleValuesChange = (val: string) => {
    setEditedValues(val);
    try {
      if (val.trim()) {
        parseYaml(val);
      }
      setValidationError(null);
    } catch (err: any) {
      setValidationError(err.message || 'Invalid YAML format');
    }
  };

  const handleUpgradeValues = async () => {
    if (validationError) return;

    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await (window as any).electronAPI.upgradeHelmValues(release.name, editedValues, namespace);
      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setValuesContent(editedValues);
        setActiveTab('values');
        onRefresh();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to upgrade Helm values', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (revision: number | string) => {
    if (!window.confirm(`Roll back ${release.name} to revision ${revision}?`)) return;

    try {
      setLoading(true);
      const res = await (window as any).electronAPI.rollbackHelm(release.name, revision, namespace);
      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        onRefresh();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Rollback failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async () => {
    if (!window.confirm(`Are you sure you want to UNINSTALL Helm release '${release.name}'?`)) return;

    try {
      setLoading(true);
      const res = await (window as any).electronAPI.uninstallHelm(release.name, namespace);
      if (res.success) {
        alert(res.message);
        onClose();
        onRefresh();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Uninstall failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-in fade-in duration-150"
    >
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-[96vw] max-w-[1750px] h-[94vh] flex flex-col overflow-hidden">
        {/* Monokai Header */}
        <div className="p-4 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#66d9ef]/10 text-[#66d9ef] flex items-center justify-center border border-[#66d9ef]/30">
              <Anchor size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#f8f8f2] flex items-center gap-2">
                Helm Release: <span className="text-[#66d9ef] font-mono">{release.name}</span>
              </h2>
              <p className="text-xs text-[#75715e] font-mono">
                Namespace: {namespace} • Chart: {release.extra?.chart || '-'} • Rev: {release.extra?.revision || '1'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleUninstall}
              className="px-3 py-1.5 rounded-lg bg-[#f92672]/20 hover:bg-[#f92672]/40 text-[#f92672] border border-[#f92672]/50 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Uninstall</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-[#272822] hover:bg-rose-950/80 text-[#75715e] hover:text-rose-300 border border-[#49483e] hover:border-rose-700/80 flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0 ml-1"
              title="Close window (Esc or click backdrop)"
              aria-label="Close window"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center justify-between px-4 bg-[#272822]/60 border-b border-[#3e3d32]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('values')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'values'
                  ? 'border-[#66d9ef] text-[#66d9ef] bg-[#3e3d32]/40'
                  : 'border-transparent text-[#75715e] hover:text-[#f8f8f2]'
              }`}
            >
              <FileText size={14} />
              <span>Values (Clean)</span>
            </button>

            <button
              onClick={() => setActiveTab('edit-values')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'edit-values'
                  ? 'border-[#a6e22e] text-[#a6e22e] bg-[#3e3d32]/40'
                  : 'border-transparent text-[#75715e] hover:text-[#f8f8f2]'
              }`}
            >
              <Edit3 size={14} />
              <span>Edit Values & Upgrade</span>
            </button>

            <button
              onClick={() => setActiveTab('manifest')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'manifest'
                  ? 'border-[#66d9ef] text-[#66d9ef] bg-[#3e3d32]/40'
                  : 'border-transparent text-[#75715e] hover:text-[#f8f8f2]'
              }`}
            >
              <Code2 size={14} />
              <span>Manifest</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-[#fd971f] text-[#fd971f] bg-[#3e3d32]/40'
                  : 'border-transparent text-[#75715e] hover:text-[#f8f8f2]'
              }`}
            >
              <History size={14} />
              <span>History & Rollback</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'edit-values' && (
              <button
                onClick={handleUpgradeValues}
                disabled={saving || loading || !!validationError}
                className="px-3 py-1 rounded bg-[#a6e22e] hover:bg-[#a6e22e]/80 text-[#272822] text-xs font-bold flex items-center gap-1 shadow disabled:opacity-40"
              >
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                <span>Save & Upgrade Release</span>
              </button>
            )}

            {(activeTab === 'values' || activeTab === 'manifest') && (
              <button
                onClick={() => handleCopy(activeTab === 'values' ? valuesContent : manifestContent)}
                className="px-2.5 py-1 rounded bg-[#272822] hover:bg-[#3e3d32] text-[#f8f8f2] text-xs font-medium flex items-center gap-1 border border-[#49483e]"
              >
                {copied ? <Check size={13} className="text-[#a6e22e]" /> : <Copy size={13} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Validation Warning */}
        {validationError && activeTab === 'edit-values' && (
          <div className="px-4 py-2 bg-[#f92672]/20 text-[#f92672] border-b border-[#f92672]/40 text-xs flex items-center gap-2 font-mono">
            <AlertTriangle size={14} className="shrink-0 text-[#f92672]" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Status Alert */}
        {statusMessage && (
          <div
            className={`p-3 text-xs font-semibold flex items-center gap-2 border-b ${
              statusMessage.type === 'error'
                ? 'bg-[#f92672]/20 text-[#f92672] border-[#f92672]/40'
                : 'bg-[#a6e22e]/20 text-[#a6e22e] border-[#a6e22e]/40'
            }`}
          >
            {statusMessage.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Monokai Tab Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-3 bg-[#1e1f1c]">
          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12 text-[#75715e] gap-2">
              <RefreshCw size={18} className="animate-spin text-[#66d9ef]" />
              <span className="text-xs">Loading Helm release details...</span>
            </div>
          ) : activeTab === 'edit-values' ? (
            <div className="flex-1 h-full overflow-auto rounded-lg border border-[#49483e] bg-[#272822]">
              <CodeMirror
                value={editedValues}
                height="100%"
                theme={monokai}
                extensions={[yaml()]}
                onChange={handleValuesChange}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  foldGutter: true,
                  autocompletion: true,
                }}
              />
            </div>
          ) : activeTab === 'history' ? (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#272822] border-b border-[#3e3d32] text-[11px] font-bold text-[#75715e] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Revision</th>
                    <th className="py-2.5 px-3">Updated</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Chart</th>
                    <th className="py-2.5 px-3">App Version</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3e3d32] font-mono">
                  {history.map((h) => {
                    const isCurrentRev = String(h.revision) === String(release.extra?.revision);

                    return (
                      <tr key={h.revision} className="hover:bg-[#272822] text-[#f8f8f2]">
                        <td className="py-2 px-3 font-bold text-[#66d9ef]">
                          {h.revision} {isCurrentRev && <span className="text-[10px] text-[#a6e22e] ml-1 font-sans">[Current]</span>}
                        </td>
                        <td className="py-2 px-3 text-[#75715e]">{h.updated || '-'}</td>
                        <td className="py-2 px-3 text-[#a6e22e]">{h.status || '-'}</td>
                        <td className="py-2 px-3 text-[#66d9ef]">{h.chart || '-'}</td>
                        <td className="py-2 px-3 text-[#e6db74]">{h.app_version || '-'}</td>
                        <td className="py-2 px-3 text-[#f8f8f2] text-[11px] truncate max-w-[200px]">{h.description || '-'}</td>
                        <td className="py-2 px-3 text-right">
                          {!isCurrentRev && (
                            <button
                              onClick={() => handleRollback(h.revision)}
                              className="px-2 py-1 rounded bg-[#272822] hover:bg-[#3e3d32] text-[#66d9ef] border border-[#49483e] text-xs font-semibold flex items-center gap-1 ml-auto"
                              title={`Roll back release to revision ${h.revision}`}
                            >
                              <RotateCcw size={12} />
                              <span>Rollback</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex-1 h-full overflow-auto rounded-lg border border-[#49483e] bg-[#272822]">
              <CodeMirror
                value={activeTab === 'values' ? valuesContent || '# No values found.' : manifestContent || '# No manifest found.'}
                height="100%"
                theme={monokai}
                extensions={[yaml()]}
                editable={false}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  foldGutter: true,
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#272822] border-t border-[#3e3d32] flex justify-between items-center text-xs text-[#75715e]">
          <div>
            {activeTab === 'edit-values' ? (
              <span>Saving values runs <code className="text-[#66d9ef] bg-[#1e1f1c] px-1 rounded">helm upgrade --reuse-values</code></span>
            ) : (
              <span>Helm Release Manager • Monokai Theme</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1e1f1c] hover:bg-[#3e3d32] text-[#f8f8f2] text-xs font-medium border border-[#49483e]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
