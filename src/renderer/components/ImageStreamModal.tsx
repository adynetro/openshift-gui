import React, { useState, useMemo } from 'react';
import { X, Sparkles, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, Tag, Info, ArrowDownAZ } from 'lucide-react';
import { ImageStreamResource, ImageStreamTagInfo } from '../../types/k8s.js';
import { SemverSorter } from '../../services/semver-sorter.js';

interface ImageStreamModalProps {
  imageStream: ImageStreamResource;
  namespace: string;
  onClose: () => void;
  onRefresh: () => void;
}

export const ImageStreamModal: React.FC<ImageStreamModalProps> = ({
  imageStream,
  namespace,
  onClose,
  onRefresh,
}) => {
  const [keepSemverCount, setKeepSemverCount] = useState<number>(3);
  const [keepNonSemver, setKeepNonSemver] = useState<boolean>(true);
  const [protectCommon, setProtectCommon] = useState<boolean>(true);
  const [manualPruneOverrides, setManualPruneOverrides] = useState<Record<string, boolean>>({});
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Raw tags list
  const rawTags: ImageStreamTagInfo[] = useMemo(() => {
    return (imageStream.tags || imageStream.extra?.tags || []).map((t: any) => ({
      tag: t.tag || t.name || '',
      created: t.created || '',
      dockerImageReference: t.dockerImageReference || '',
      imageSize: t.imageSize || (100 * 1024 * 1024), // ~100MB approx
      isSemver: false,
    }));
  }, [imageStream]);

  // Sort and classify with SemverSorter
  const sortedTags = useMemo(() => {
    return SemverSorter.sortTags(rawTags);
  }, [rawTags]);

  // Automatic cleanup plan
  const autoPlan = useMemo(() => {
    const protectedNames = protectCommon ? ['latest', 'stable', 'main', 'master', 'prod'] : [];
    return SemverSorter.planCleanup(sortedTags, {
      keepSemverCount,
      keepNonSemver,
      keepTagsNamed: protectedNames,
    });
  }, [sortedTags, keepSemverCount, keepNonSemver, protectCommon]);

  // Merge with manual overrides
  const effectiveTags = useMemo(() => {
    return sortedTags.map((t) => {
      const isAutoPrune = autoPlan.tagsToPrune.some((p) => p.tag === t.tag);
      const isOverridden = manualPruneOverrides[t.tag] !== undefined;
      const isPruned = isOverridden ? manualPruneOverrides[t.tag] : isAutoPrune;

      return {
        ...t,
        isPruned,
      };
    });
  }, [sortedTags, autoPlan, manualPruneOverrides]);

  const tagsToKeep = effectiveTags.filter((t) => !t.isPruned);
  const tagsToPrune = effectiveTags.filter((t) => t.isPruned);

  // Delete individual tag
  const handleDeleteSingle = async (tagName: string) => {
    if (!window.confirm(`Are you sure you want to delete tag '${tagName}' from ${imageStream.name}?`)) {
      return;
    }

    try {
      setIsProcessing(true);
      const res = await (window as any).electronAPI.deleteImageStreamTag(imageStream.name, tagName, namespace);
      if (res.success) {
        setStatusMessage({ text: `Successfully deleted tag ${tagName}`, type: 'success' });
        onRefresh();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Failed to delete tag', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute batch cleanup
  const handleExecuteBatch = async () => {
    if (tagsToPrune.length === 0) {
      alert('No tags selected for cleanup.');
      return;
    }

    const confirmMsg = `Are you sure you want to PRUNE ${tagsToPrune.length} tags from ${imageStream.name}?\n\nTags to be deleted:\n${tagsToPrune
      .map((t) => `• ${t.tag}`)
      .join('\n')}`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsProcessing(true);
      let successCount = 0;
      let errorCount = 0;

      for (const t of tagsToPrune) {
        const res = await (window as any).electronAPI.deleteImageStreamTag(imageStream.name, t.tag, namespace);
        if (res.success) successCount++;
        else errorCount++;
      }

      setStatusMessage({
        text: `Batch Cleanup Completed: Deleted ${successCount} tags (${errorCount} failed).`,
        type: errorCount > 0 ? 'error' : 'success',
      });

      onRefresh();
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Failed during batch cleanup', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#0f172a] border border-purple-500/40 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                ImageStream & SemVer Tag Manager: <span className="text-purple-400 font-mono">{imageStream.name}</span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Project: {namespace} • Total Tags: {sortedTags.length}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

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

        {/* Cleanup Controls Configuration Card */}
        <div className="p-4 bg-slate-900/50 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Keep N SemVer Count */}
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                <span className="text-xs font-medium text-slate-300">Keep Latest SemVer Releases:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setKeepSemverCount((prev) => Math.max(1, prev - 1))}
                    className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center text-xs"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono font-bold text-cyan-300 text-sm">
                    {keepSemverCount}
                  </span>
                  <button
                    onClick={() => setKeepSemverCount((prev) => prev + 1)}
                    className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center text-xs"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Protect latest/stable toggle */}
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={protectCommon}
                  onChange={(e) => setProtectCommon(e.target.checked)}
                  className="rounded border-slate-700 text-purple-600 focus:ring-0"
                />
                <ShieldCheck size={14} className="text-purple-400" />
                <span>Protect common tags (latest, stable, main)</span>
              </label>

              {/* Keep Non-SemVer toggle */}
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepNonSemver}
                  onChange={(e) => setKeepNonSemver(e.target.checked)}
                  className="rounded border-slate-700 text-purple-600 focus:ring-0"
                />
                <Tag size={14} className="text-amber-400" />
                <span>Keep other Non-SemVer tags</span>
              </label>
            </div>

            {/* Execute Batch Cleanup Button */}
            <button
              onClick={handleExecuteBatch}
              disabled={isProcessing || tagsToPrune.length === 0}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-xs shadow-lg shadow-red-950/60 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              <Trash2 size={14} />
              <span>Prune {tagsToPrune.length} Selected Tags</span>
            </button>
          </div>

          {/* Live Cleanup Summary Badges */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              <span>{tagsToKeep.length} Tags to RETAIN</span>
            </span>
            <span className="px-2.5 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800 flex items-center gap-1.5">
              <Trash2 size={13} />
              <span>{tagsToPrune.length} Tags to PRUNE</span>
            </span>
            <span className="text-slate-400 flex items-center gap-1 text-[11px]">
              <ArrowDownAZ size={13} />
              Tags sorted by SemVer (newest first). Check/uncheck boxes below for custom pruning.
            </span>
          </div>
        </div>

        {/* Tags Table */}
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[#0f172a] border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Prune?</th>
                <th className="py-2.5 px-3">Tag Name</th>
                <th className="py-2.5 px-3">Classification</th>
                <th className="py-2.5 px-3">Clean SemVer</th>
                <th className="py-2.5 px-3">Docker Reference</th>
                <th className="py-2.5 px-3">Plan Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {effectiveTags.map((t) => {
                return (
                  <tr
                    key={t.tag}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      t.isPruned ? 'bg-rose-950/20 text-rose-200' : 'text-slate-200'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={t.isPruned}
                        onChange={(e) => {
                          setManualPruneOverrides((prev) => ({
                            ...prev,
                            [t.tag]: e.target.checked,
                          }));
                        }}
                        className="rounded border-slate-700 text-rose-600 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Tag Name */}
                    <td className="py-2 px-3 font-bold text-slate-100 flex items-center gap-1.5">
                      <span>{t.tag}</span>
                    </td>

                    {/* Classification */}
                    <td className="py-2 px-3">
                      {t.isSemver ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-semibold">
                          SemVer Release
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                          Non-SemVer Tag
                        </span>
                      )}
                    </td>

                    {/* Parsed Semver */}
                    <td className="py-2 px-3 text-cyan-300">{t.semverParsed || '-'}</td>

                    {/* Docker Reference */}
                    <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-[250px]" title={t.dockerImageReference}>
                      {t.dockerImageReference || '-'}
                    </td>

                    {/* Plan Status */}
                    <td className="py-2 px-3">
                      {t.isPruned ? (
                        <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold">
                          TO PRUNE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                          RETAIN
                        </span>
                      )}
                    </td>

                    {/* Delete Single */}
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => handleDeleteSingle(t.tag)}
                        disabled={isProcessing}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-900/80 text-rose-400 hover:text-rose-200 border border-slate-700 hover:border-rose-500 transition-colors"
                        title={`Delete tag ${t.tag}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Info size={13} className="text-slate-400" />
            <span>OpenShift executes tag deletion via <code className="text-slate-300 bg-slate-800 px-1 rounded">oc tag -d</code> command safely.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
