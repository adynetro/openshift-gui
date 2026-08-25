import React, { useState, useEffect } from 'react';
import {
  X,
  Flame,
  Calendar,
  Layers,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Terminal,
  FileCode2,
  Clock,
  Send,
  Globe,
  RefreshCw,
} from 'lucide-react';

interface ImageRegistryPrunerModalProps {
  onClose: () => void;
  onRefresh: () => void;
}

export const ImageRegistryPrunerModal: React.FC<ImageRegistryPrunerModalProps> = ({
  onClose,
  onRefresh,
}) => {
  const [keepTagRevisions, setKeepTagRevisions] = useState<number>(3);
  const [keepYoungerThan, setKeepYoungerThan] = useState<string>('60m');
  const [includeAll, setIncludeAll] = useState<boolean>(true);
  const [ignoreInvalidRefs, setIgnoreInvalidRefs] = useState<boolean>(false);
  const [registryUrl, setRegistryUrl] = useState<string>('');
  const [isDetectingUrl, setIsDetectingUrl] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'run' | 'cronjob'>('run');
  const [cronSchedule, setCronSchedule] = useState<string>('0 0 * * 0'); // Weekly Sunday midnight
  const [cronJobYaml, setCronJobYaml] = useState<string>('');

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logOutput, setLogOutput] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Auto-detect OpenShift Registry External Route / URL
  const fetchRegistryUrl = async () => {
    try {
      setIsDetectingUrl(true);
      const url = await (window as any).electronAPI.getRegistryUrl();
      if (url) {
        setRegistryUrl(url);
      }
    } catch {
      // ignore
    } finally {
      setIsDetectingUrl(false);
    }
  };

  useEffect(() => {
    fetchRegistryUrl();
  }, []);

  // Execute Prune (Dry-run or Confirm)
  const handleExecutePrune = async (confirm: boolean) => {
    if (confirm) {
      const confirmText = `⚠️ WARNING: You are about to permanently DELETE unreferenced image objects and free storage blobs from the OpenShift registry.\n\nSettings:\n• Registry URL: ${registryUrl || 'auto-detect'}\n• Preserve latest ${keepTagRevisions} revisions per tag\n• Keep images younger than: ${keepYoungerThan}\n• Include imported images: ${includeAll ? 'YES' : 'NO'}\n\nProceed with confirmed blob deletion?`;
      if (!window.confirm(confirmText)) return;
    }

    try {
      setIsRunning(true);
      setStatusMessage({
        text: confirm ? 'Executing registry blob pruning (--confirm)...' : 'Running dry-run simulation...',
        type: 'info',
      });
      const regFlag = registryUrl ? `--registry-url="${registryUrl.trim()}"` : '';
      setLogOutput(`$ oc adm prune images --keep-tag-revisions=${keepTagRevisions} --keep-younger-than=${keepYoungerThan} ${includeAll ? '--all=true' : '--all=false'} ${ignoreInvalidRefs ? '--ignore-invalid-refs=true' : ''} ${regFlag} ${confirm ? '--confirm' : ''}\n\n[Connecting to registry at ${registryUrl || 'cluster endpoint'} & analyzing image storage blobs...]\n`);

      const res = await (window as any).electronAPI.pruneImages({
        keepTagRevisions,
        keepYoungerThan,
        confirm,
        all: includeAll,
        ignoreInvalidRefs,
        registryUrl: registryUrl.trim() || undefined,
      });

      const outputCombined = (res.stdout || '') + (res.stderr ? `\n${res.stderr}` : '');
      setLogOutput((prev) => `${prev}${outputCombined}\n\n${res.message}`);

      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        if (confirm) onRefresh();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (e: any) {
      setLogOutput((prev) => `${prev}\nError: ${e.message || 'Execution failed'}`);
      setStatusMessage({ text: e.message || 'Prune operation failed', type: 'error' });
    } finally {
      setIsRunning(false);
    }
  };

  // Generate CronJob YAML
  const handleGenerateCronJob = async () => {
    try {
      const yaml = await (window as any).electronAPI.getImagePrunerCronJobYaml({
        schedule: cronSchedule,
        keepTagRevisions,
        keepYoungerThan,
        namespace: 'openshift-image-registry',
        registryUrl: registryUrl.trim() || undefined,
      });
      setCronJobYaml(yaml);
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Failed to generate YAML', type: 'error' });
    }
  };

  // Apply CronJob YAML to Cluster
  const handleApplyCronJob = async () => {
    if (!cronJobYaml) return;
    try {
      setIsRunning(true);
      const res = await (window as any).electronAPI.applyYaml(cronJobYaml, 'openshift-image-registry');
      if (res.success) {
        setStatusMessage({ text: 'Image Pruner CronJob and RBAC successfully applied to cluster!', type: 'success' });
      } else {
        setStatusMessage({ text: res.message || 'Failed to apply CronJob', type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Failed to apply CronJob', type: 'error' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border transition-colors"
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
            <div className="w-10 h-10 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <Flame size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                OpenShift Image & Blob Pruner <span className="text-xs px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono">oc adm prune images</span>
              </h2>
              <p className="text-xs text-slate-400">
                Purge unreferenced image layers, orphaned storage blobs, and historical tag revisions from registry storage.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="flex items-center rounded-lg bg-slate-900 border border-slate-700 p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab('run')}
                className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                  activeTab === 'run'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Play size={12} />
                <span>Execute Prune</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('cronjob');
                  if (!cronJobYaml) handleGenerateCronJob();
                }}
                className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                  activeTab === 'cronjob'
                    ? 'bg-purple-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar size={12} />
                <span>Automated CronJob</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close window (Esc)"
              aria-label="Close window"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Alert */}
        {statusMessage && (
          <div
            className={`p-3 text-xs font-semibold flex items-center gap-2 border-b ${
              statusMessage.type === 'error'
                ? 'bg-rose-950/70 text-rose-200 border-rose-800'
                : statusMessage.type === 'success'
                ? 'bg-emerald-950/70 text-emerald-200 border-emerald-800'
                : 'bg-blue-950/70 text-blue-200 border-blue-800'
            }`}
          >
            {statusMessage.type === 'error' ? (
              <AlertTriangle size={15} />
            ) : statusMessage.type === 'success' ? (
              <CheckCircle2 size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Options Settings Banner */}
        <div
          className="p-4 border-b space-y-3"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
          }}
        >
          {/* Row 1: Registry External URL */}
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Globe size={15} className="text-cyan-400 shrink-0" />
              <div>
                <span className="font-semibold text-slate-200">Registry External Route / URL:</span>
                <span className="text-[10px] text-slate-400 block">
                  Required by OpenShift CLI to communicate with registry API and free storage blobs.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 w-full md:w-auto flex-1 max-w-md">
              <input
                type="text"
                value={registryUrl}
                onChange={(e) => setRegistryUrl(e.target.value)}
                placeholder="e.g. registry.apps.okd.example.com"
                className="flex-1 px-2.5 py-1 rounded bg-slate-800 border border-slate-600 text-xs font-mono text-cyan-300 outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={fetchRegistryUrl}
                disabled={isDetectingUrl}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs flex items-center gap-1 transition-colors"
                title="Auto-detect OpenShift registry route from cluster"
              >
                <RefreshCw size={12} className={isDetectingUrl ? 'animate-spin' : ''} />
                <span>Auto-Detect</span>
              </button>
            </div>
          </div>

          {/* Row 2: Parameters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Keep Tag Revisions */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">Keep Tag Revisions:</span>
                <span className="font-mono font-bold text-cyan-300 text-sm">--keep-tag-revisions={keepTagRevisions}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setKeepTagRevisions((p) => Math.max(1, p - 1))}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                >
                  -
                </button>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={keepTagRevisions}
                  onChange={(e) => setKeepTagRevisions(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setKeepTagRevisions((p) => Math.min(20, p + 1))}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                >
                  +
                </button>
              </div>
              <span className="text-[10px] text-slate-400">Preserves newest {keepTagRevisions} revisions per tag.</span>
            </div>

            {/* Keep Younger Than */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">Minimum Image Age:</span>
                <span className="font-mono font-bold text-purple-300 text-xs">--keep-younger-than={keepYoungerThan}</span>
              </div>
              <select
                value={keepYoungerThan}
                onChange={(e) => setKeepYoungerThan(e.target.value)}
                className="w-full py-1 px-2 rounded bg-slate-800 border border-slate-600 text-xs text-slate-200 outline-none font-mono"
              >
                <option value="60m">60 minutes (1 hour) [Recommended]</option>
                <option value="24h">24 hours (1 day)</option>
                <option value="7d">7 days (1 week)</option>
                <option value="30d">30 days (1 month)</option>
                <option value="0s">0 seconds (Prune all unreferenced immediately)</option>
              </select>
              <span className="text-[10px] text-slate-400">Images created within this window will be spared.</span>
            </div>

            {/* Toggles */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 flex flex-col justify-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeAll}
                  onChange={(e) => setIncludeAll(e.target.checked)}
                  className="rounded border-slate-700 text-rose-600 focus:ring-0"
                />
                <Layers size={13} className="text-cyan-400" />
                <span>Include External Imported Images</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ignoreInvalidRefs}
                  onChange={(e) => setIgnoreInvalidRefs(e.target.checked)}
                  className="rounded border-slate-700 text-rose-600 focus:ring-0"
                />
                <ShieldAlert size={13} className="text-amber-400" />
                <span>Ignore Invalid References</span>
              </label>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
          {activeTab === 'run' ? (
            <>
              {/* Action Bar */}
              <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-xs text-slate-300 flex items-center gap-2">
                  <Terminal size={15} className="text-emerald-400" />
                  <span>Choose execution mode: <strong>Dry Run</strong> to simulate or <strong>Confirm</strong> to delete blobs.</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Dry Run Button */}
                  <button
                    type="button"
                    onClick={() => handleExecutePrune(false)}
                    disabled={isRunning}
                    className="px-3.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Play size={13} />
                    <span>Run Dry Run (Simulation)</span>
                  </button>

                  {/* Confirm Delete Blobs Button */}
                  <button
                    type="button"
                    onClick={() => handleExecutePrune(true)}
                    disabled={isRunning}
                    className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white border border-rose-500 text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-rose-950/60 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Flame size={14} />
                    <span>Prune & Free Blobs (--confirm)</span>
                  </button>
                </div>
              </div>

              {/* Console Output */}
              <div className="flex-1 min-h-[280px] rounded-lg bg-black/90 border border-slate-800 p-3 font-mono text-xs text-slate-300 flex flex-col">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Registry Output Stream
                  </span>
                  {logOutput && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(logOutput);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                    >
                      <Copy size={11} />
                      <span>{copied ? 'Copied!' : 'Copy Log'}</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-auto whitespace-pre-wrap select-text leading-relaxed">
                  {logOutput ? (
                    logOutput.split('\n').map((line, idx) => {
                      const isDeletingBlob = line.includes('Deleting blob');
                      const isDeletingImage = line.includes('Deleting image');
                      const isSummary = line.includes('Summary:');
                      const isWarning = line.includes('Warning:') || line.includes('Dry run enabled');

                      return (
                        <div
                          key={idx}
                          className={
                            isSummary
                              ? 'text-emerald-400 font-bold bg-emerald-950/30 px-1 py-0.5 rounded'
                              : isDeletingBlob
                              ? 'text-purple-300'
                              : isDeletingImage
                              ? 'text-cyan-300 font-semibold'
                              : isWarning
                              ? 'text-amber-300'
                              : line.startsWith('$')
                              ? 'text-yellow-400 font-bold'
                              : 'text-slate-300'
                          }
                        >
                          {line}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-slate-600 italic flex items-center justify-center h-full">
                      Click "Run Dry Run (Simulation)" or "Prune & Free Blobs (--confirm)" to inspect candidate images and reclaimed storage.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* CronJob Generator View */
            <div className="flex-1 flex flex-col gap-3">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <Clock size={15} className="text-purple-400" />
                  <span className="font-semibold text-slate-200">Execution Cron Schedule:</span>
                  <input
                    type="text"
                    value={cronSchedule}
                    onChange={(e) => {
                      setCronSchedule(e.target.value);
                      handleGenerateCronJob();
                    }}
                    placeholder="0 0 * * 0"
                    className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-mono text-xs w-36 outline-none"
                  />
                  <span className="text-[11px] text-slate-400">(Default: Weekly Sunday at midnight)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(cronJobYaml);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Copy size={13} />
                    <span>{copied ? 'Copied YAML!' : 'Copy YAML'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyCronJob}
                    disabled={isRunning || !cronJobYaml}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-purple-950/60 disabled:opacity-40"
                  >
                    <Send size={13} />
                    <span>Apply CronJob to Cluster</span>
                  </button>
                </div>
              </div>

              {/* YAML Editor / Viewer */}
              <div className="flex-1 min-h-[300px] rounded-lg bg-black/90 border border-slate-800 p-3 font-mono text-xs text-slate-300 flex flex-col">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <FileCode2 size={13} className="text-purple-400" />
                    Generated OpenShift CronJob & RBAC Manifest (namespace: openshift-image-registry)
                  </span>
                </div>
                <textarea
                  value={cronJobYaml}
                  onChange={(e) => setCronJobYaml(e.target.value)}
                  className="flex-1 w-full bg-transparent resize-none outline-none font-mono text-xs text-emerald-300 leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-3 border-t flex items-center justify-between text-xs"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
            color: 'var(--text-muted, #94a3b8)',
          }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-amber-400" />
            <span>Requires cluster role <code className="font-mono text-cyan-300">system:image-pruner</code> or <code className="font-mono text-cyan-300">cluster-admin</code>.</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
