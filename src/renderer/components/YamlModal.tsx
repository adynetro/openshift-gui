import React, { useState, useEffect } from 'react';
import { X, Code2, FileText, Copy, Check, RefreshCw } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { monokai } from '@uiw/codemirror-theme-monokai';
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
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let text = '';
        let cmdKind: string = item.kind;
        if (cmdKind === 'deploymentconfigs') cmdKind = 'dc';
        if (cmdKind === 'imagestreams') cmdKind = 'is';
        if (cmdKind === 'statefulsets') cmdKind = 'sts';
        if (cmdKind === 'daemonsets') cmdKind = 'ds';
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

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Monokai Header */}
        <div className="p-3 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#66d9ef]/10 text-[#66d9ef] flex items-center justify-center border border-[#66d9ef]/30">
              {mode === 'yaml' ? <Code2 size={16} /> : <FileText size={16} />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#f8f8f2] flex items-center gap-2">
                {mode === 'yaml' ? 'YAML Definition' : 'Resource Description'}:{' '}
                <span className="text-[#66d9ef] font-mono">{item.name}</span>
              </h2>
              <p className="text-[11px] text-[#75715e] font-mono">
                Kind: {item.kind} • Project: {namespace} • Monokai Theme
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-[#272822] hover:bg-[#3e3d32] text-[#f8f8f2] text-xs font-medium flex items-center gap-1 border border-[#49483e] transition-colors"
            >
              {copied ? <Check size={13} className="text-[#a6e22e]" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#75715e] hover:text-[#f8f8f2] hover:bg-[#3e3d32] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Monokai Syntax Highlighted Content Box */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#272822]">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[#75715e] gap-2">
              <RefreshCw size={18} className="animate-spin text-[#66d9ef]" />
              <span className="text-xs">Loading details...</span>
            </div>
          ) : (
            <div className="flex-1 h-full overflow-auto">
              <CodeMirror
                value={content}
                height="100%"
                theme={monokai}
                extensions={mode === 'yaml' ? [yaml()] : []}
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
      </div>
    </div>
  );
};
