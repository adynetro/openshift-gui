import React, { useState, useEffect } from 'react';
import { X, Anchor, FileText, Code2, History, RotateCcw, Trash2, CheckCircle2, AlertTriangle, RefreshCw, Copy, Check, Save, Edit3 } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#0f172a] border border-blue-500/40 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Anchor size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Helm Release: <span className="text-blue-400 font-mono">{release.name}</span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Namespace: {namespace} • Chart: {release.extra?.chart || '-'} • Rev: {release.extra?.revision || '1'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleUninstall}
              className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 size={13} />
              <span>Uninstall</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center justify-between px-4 bg-slate-900/50 border-b border-slate-800">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('values')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'values'
                  ? 'border-blue-500 text-blue-400 bg-slate-800/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText size={14} />
              <span>Values (Read-Only)</span>
            </button>

            <button
              onClick={() => setActiveTab('edit-values')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'edit-values'
                  ? 'border-emerald-500 text-emerald-400 bg-slate-800/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Edit3 size={14} />
              <span>Edit Values & Upgrade</span>
            </button>

            <button
              onClick={() => setActiveTab('manifest')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'manifest'
                  ? 'border-blue-500 text-blue-400 bg-slate-800/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 size={14} />
              <span>Manifest</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-400 bg-slate-800/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
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
                className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow disabled:opacity-40"
              >
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                <span>Save & Upgrade Release</span>
              </button>
            )}

            {(activeTab === 'values' || activeTab === 'manifest') && (
              <button
                onClick={() => handleCopy(activeTab === 'values' ? valuesContent : manifestContent)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 border border-slate-700"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Validation Warning */}
        {validationError && activeTab === 'edit-values' && (
          <div className="px-4 py-2 bg-rose-950/80 text-rose-300 border-b border-rose-800 text-xs flex items-center gap-2 font-mono">
            <AlertTriangle size={14} className="shrink-0 text-rose-400" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Status Alert */}
        {statusMessage && (
          <div
            className={`p-3 text-xs font-semibold flex items-center gap-2 border-b ${
              statusMessage.type === 'error'
                ? 'bg-rose-950/70 text-rose-200 border-rose-800'
                : 'bg-emerald-950/70 text-emerald-200 border-emerald-800'
            }`}
          >
            {statusMessage.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-4 flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
              <RefreshCw size={18} className="animate-spin text-blue-400" />
              <span className="text-xs">Loading Helm release details...</span>
            </div>
          ) : activeTab === 'edit-values' ? (
            <textarea
              value={editedValues}
              onChange={(e) => handleValuesChange(e.target.value)}
              placeholder="# Edit YAML values here..."
              spellCheck={false}
              className="flex-1 w-full min-h-[350px] p-4 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed outline-none rounded-lg border border-slate-800 focus:border-emerald-500 resize-none"
            />
          ) : activeTab === 'history' ? (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#0f172a] border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
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
              <tbody className="divide-y divide-slate-800 font-mono">
                {history.map((h) => {
                  const isCurrentRev = String(h.revision) === String(release.extra?.revision);

                  return (
                    <tr key={h.revision} className="hover:bg-slate-800/40 text-slate-200">
                      <td className="py-2 px-3 font-bold text-cyan-300">
                        {h.revision} {isCurrentRev && <span className="text-[10px] text-emerald-400 ml-1 font-sans">[Current]</span>}
                      </td>
                      <td className="py-2 px-3 text-slate-400">{h.updated || '-'}</td>
                      <td className="py-2 px-3 text-emerald-400">{h.status || '-'}</td>
                      <td className="py-2 px-3 text-blue-300">{h.chart || '-'}</td>
                      <td className="py-2 px-3 text-amber-300">{h.app_version || '-'}</td>
                      <td className="py-2 px-3 text-slate-300 text-[11px] truncate max-w-[200px]">{h.description || '-'}</td>
                      <td className="py-2 px-3 text-right">
                        {!isCurrentRev && (
                          <button
                            onClick={() => handleRollback(h.revision)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-cyan-950 text-cyan-400 border border-slate-700 hover:border-cyan-500 text-xs font-semibold flex items-center gap-1 ml-auto"
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
          ) : (
            <pre className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 overflow-auto whitespace-pre-wrap leading-relaxed">
              {activeTab === 'values' ? valuesContent || 'No values found.' : manifestContent || 'No manifest found.'}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <div>
            {activeTab === 'edit-values' ? (
              <span>Saving values runs <code className="text-slate-300 bg-slate-800 px-1 rounded">helm upgrade --reuse-values</code></span>
            ) : (
              <span>Helm Release Manager</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
