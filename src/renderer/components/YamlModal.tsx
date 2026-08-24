import React, { useState, useEffect } from 'react';
import { X, Code2, FileText, Copy, Check, Search, RefreshCw } from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';

interface YamlModalProps {
  mode: 'yaml' | 'describe';
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
}

export const YamlModal: React.FC<YamlModalProps> = ({ mode, item, namespace, onClose }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let text = '';
        let cmdKind: string = item.kind;
        if (cmdKind === 'imagestreams') cmdKind = 'is';
        if (cmdKind === 'statefulsets') cmdKind = 'sts';
        if (cmdKind === 'configmaps') cmdKind = 'cm';

        if (mode === 'yaml') {
          text = await (window as any).electronAPI.getYaml(cmdKind, item.name, namespace);
        } else {
          text = await (window as any).electronAPI.describeResource(cmdKind, item.name, namespace);
        }
        setContent(text);
      } catch (err: any) {
        setContent(`Error loading resource data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [mode, item, namespace]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = content.split('\n');
  const filteredLines = searchQuery
    ? lines.filter((l) => l.toLowerCase().includes(searchQuery.toLowerCase()))
    : lines;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#0b0f19] border border-cyan-500/40 rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              {mode === 'yaml' ? <Code2 size={16} /> : <FileText size={16} />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                {mode === 'yaml' ? 'YAML Definition' : 'Resource Description'}:{' '}
                <span className="text-cyan-400 font-mono">{item.name}</span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Kind: {item.kind} • Project: {namespace}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 border border-slate-700 transition-colors"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search within document */}
        <div className="px-4 py-2 bg-[#0f172a]/80 border-b border-slate-800 flex items-center gap-2">
          <Search size={14} className="text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search within YAML / describe output..."
            className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none"
          />
          {searchQuery && (
            <span className="text-[10px] text-slate-400 font-mono shrink-0">
              Matching lines: {filteredLines.length} / {lines.length}
            </span>
          )}
        </div>

        {/* Content Box */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-200 leading-relaxed bg-black/90">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
              <RefreshCw size={18} className="animate-spin text-cyan-400" />
              <span>Loading details...</span>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap">{filteredLines.join('\n')}</pre>
          )}
        </div>
      </div>
    </div>
  );
};
