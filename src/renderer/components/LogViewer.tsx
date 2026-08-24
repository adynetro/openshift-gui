import React, { useState, useEffect, useRef } from 'react';
import { X, Terminal, Play, Pause, ArrowDown, Trash2, Copy, Search, Check, Sparkles } from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';

interface LogViewerProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
}

interface LogEntry {
  id: number;
  timestamp?: string;
  raw: string;
}

export const LogViewer: React.FC<LogViewerProps> = ({ item, namespace, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const streamIdRef = useRef<string | null>(null);

  const containers: string[] =
    item.raw?.spec?.containers?.map((c: any) => c.name) ||
    item.raw?.spec?.template?.spec?.containers?.map((c: any) => c.name) ||
    [];

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    async function startStream() {
      try {
        const streamId = await (window as any).electronAPI.startLogStream(
          item.name,
          namespace,
          selectedContainer || undefined
        );
        streamIdRef.current = streamId;

        unlisten = (window as any).electronAPI.onLogLine((data: { streamId: string; line: LogEntry }) => {
          if (data.streamId === streamId && !isPaused) {
            setLogs((prev) => {
              const next = [...prev, data.line];
              if (next.length > 2000) next.shift();
              return next;
            });
          }
        });
      } catch (err) {
        console.error('Failed to start log stream:', err);
      }
    }

    startStream();

    return () => {
      if (unlisten) unlisten();
      if (streamIdRef.current) {
        (window as any).electronAPI.stopLogStream(streamIdRef.current);
      }
    };
  }, [item.name, namespace, selectedContainer, isPaused]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((l) => {
    if (!filterQuery.trim()) return true;
    return l.raw.toLowerCase().includes(filterQuery.toLowerCase());
  });

  const handleCopyAll = () => {
    const text = filteredLogs.map((l) => `${l.timestamp ? `[${l.timestamp}] ` : ''}${l.raw}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Monokai Syntax Colorizer for log lines
  const renderLogLine = (entry: LogEntry) => {
    const raw = entry.raw;
    const lower = raw.toLowerCase();

    // Monokai Colors:
    // Red/Pink: #f92672
    // Green: #a6e22e
    // Yellow/Orange: #e6db74 / #fd971f
    // Cyan: #66d9ef
    // Purple: #ae81ff
    // Dim: #75715e
    // Default text: #f8f8f2

    let textColor = 'text-[#f8f8f2]';
    let prefixTag = null;

    if (lower.includes('error') || lower.includes('fatal') || lower.includes('panic') || lower.includes('exception') || lower.includes('failed')) {
      textColor = 'text-[#f92672] font-semibold';
      prefixTag = <span className="px-1 py-0.2 rounded bg-[#f92672]/20 text-[#f92672] text-[10px] font-bold">ERR</span>;
    } else if (lower.includes('warn') || lower.includes('warning')) {
      textColor = 'text-[#fd971f]';
      prefixTag = <span className="px-1 py-0.2 rounded bg-[#fd971f]/20 text-[#fd971f] text-[10px] font-bold">WARN</span>;
    } else if (lower.includes('info') || lower.includes('starting') || lower.includes('connected')) {
      textColor = 'text-[#66d9ef]';
    } else if (lower.includes('success') || lower.includes('ready') || lower.includes('listening')) {
      textColor = 'text-[#a6e22e]';
    } else if (lower.includes('debug') || lower.includes('trace')) {
      textColor = 'text-[#75715e]';
    }

    return (
      <div key={entry.id} className="flex items-start gap-2 leading-relaxed hover:bg-[#3e3d32]/30 px-1 py-0.5 rounded transition-colors font-mono">
        {entry.timestamp && (
          <span className="text-[#75715e] select-none shrink-0 font-mono text-[11px]">
            {entry.timestamp.slice(11, 19)}
          </span>
        )}
        {prefixTag}
        <span className={`${textColor} whitespace-pre-wrap break-all select-text`}>{raw}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        {/* Monokai Header */}
        <div className="p-3 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#a6e22e]/10 text-[#a6e22e] flex items-center justify-center border border-[#a6e22e]/30">
              <Terminal size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#f8f8f2] flex items-center gap-2">
                Monokai Log Terminal: <span className="text-[#66d9ef] font-mono">{item.name}</span>
              </h2>
              <p className="text-[11px] text-[#75715e] font-mono">
                Project: {namespace} • Buffer: {logs.length} lines • JetBrains Mono
              </p>
            </div>
          </div>

          {/* Container Selector if multi-container */}
          {containers.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#75715e]">Container:</span>
              <select
                value={selectedContainer}
                onChange={(e) => {
                  setLogs([]);
                  setSelectedContainer(e.target.value);
                }}
                className="bg-[#272822] border border-[#49483e] text-[#f8f8f2] rounded px-2 py-1 text-xs outline-none"
              >
                <option value="">All Containers</option>
                {containers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Pause / Resume */}
            <button
              onClick={() => setIsPaused((prev) => !prev)}
              className={`px-2.5 py-1 rounded text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                isPaused
                  ? 'bg-[#fd971f]/20 border-[#fd971f]/60 text-[#fd971f]'
                  : 'bg-[#a6e22e]/20 border-[#a6e22e]/60 text-[#a6e22e]'
              }`}
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            {/* Auto-scroll */}
            <button
              onClick={() => setAutoScroll((prev) => !prev)}
              className={`px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                autoScroll
                  ? 'bg-[#66d9ef]/20 border-[#66d9ef]/60 text-[#66d9ef]'
                  : 'bg-[#272822] border-[#49483e] text-[#75715e]'
              }`}
            >
              <ArrowDown size={12} />
              <span>Auto-Scroll</span>
            </button>

            {/* Clear */}
            <button
              onClick={() => setLogs([])}
              className="p-1.5 rounded bg-[#272822] hover:bg-[#3e3d32] text-[#75715e] hover:text-[#f8f8f2] border border-[#49483e]"
              title="Clear Log Buffer"
            >
              <Trash2 size={14} />
            </button>

            {/* Copy */}
            <button
              onClick={handleCopyAll}
              className="p-1.5 rounded bg-[#272822] hover:bg-[#3e3d32] text-[#75715e] hover:text-[#f8f8f2] border border-[#49483e]"
              title="Copy all logs to clipboard"
            >
              {copied ? <Check size={14} className="text-[#a6e22e]" /> : <Copy size={14} />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#75715e] hover:text-[#f8f8f2] hover:bg-[#3e3d32] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Monokai Filter Input */}
        <div className="px-4 py-2 bg-[#272822]/90 border-b border-[#3e3d32] flex items-center gap-2">
          <Search size={14} className="text-[#75715e]" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter within live logs..."
            className="w-full bg-transparent text-xs text-[#f8f8f2] placeholder-[#75715e] outline-none font-mono"
          />
          {filterQuery && (
            <span className="text-[10px] text-[#66d9ef] font-mono shrink-0">
              Matching: {filteredLogs.length} / {logs.length}
            </span>
          )}
        </div>

        {/* Monokai Terminal Screen */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-0.5 bg-[#272822] selection:bg-[#49483e]">
          {filteredLogs.length === 0 ? (
            <div className="text-[#75715e] italic p-4">Waiting for log stream output from container...</div>
          ) : (
            filteredLogs.map(renderLogLine)
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Monokai Footer */}
        <div className="p-2 bg-[#1e1f1c] border-t border-[#3e3d32] flex items-center justify-between text-[11px] text-[#75715e] font-mono">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-[#fd971f]" />
            <span>Monokai Terminal Theme</span>
          </div>
          <span>{logs.length} buffered lines</span>
        </div>
      </div>
    </div>
  );
};
