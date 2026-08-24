import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Terminal, Play, Pause, ArrowDown, Trash2, Copy, Search, Check, Sparkles, Layers, Box } from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';

interface LogViewerProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
}

interface LogEntry {
  id: number;
  pod?: string;
  container?: string;
  timestamp?: string;
  raw: string;
}

// Consistent Monokai color palette for different pod badges
const POD_COLORS = [
  'bg-[#66d9ef]/15 text-[#66d9ef] border-[#66d9ef]/40',
  'bg-[#a6e22e]/15 text-[#a6e22e] border-[#a6e22e]/40',
  'bg-[#fd971f]/15 text-[#fd971f] border-[#fd971f]/40',
  'bg-[#ae81ff]/15 text-[#ae81ff] border-[#ae81ff]/40',
  'bg-[#e6db74]/15 text-[#e6db74] border-[#e6db74]/40',
  'bg-[#f92672]/15 text-[#f92672] border-[#f92672]/40',
];

function getPodColor(podName: string): string {
  let hash = 0;
  for (let i = 0; i < podName.length; i++) {
    hash = (hash << 5) - hash + podName.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % POD_COLORS.length;
  return POD_COLORS[index];
}

export const LogViewer: React.FC<LogViewerProps> = ({ item, namespace, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedPod, setSelectedPod] = useState<string>('ALL');
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const streamIdRef = useRef<string | null>(null);

  const isWorkload =
    item.kind === 'deployments' ||
    item.kind === 'deploymentconfigs' ||
    item.kind === 'statefulsets' ||
    item.kind === 'daemonsets';

  const containers: string[] =
    item.raw?.spec?.template?.spec?.containers?.map((c: any) => c.name) ||
    item.raw?.spec?.containers?.map((c: any) => c.name) ||
    [];

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    async function startStream() {
      try {
        const streamId = await (window as any).electronAPI.startLogStream(
          item.name,
          namespace,
          item.kind,
          selectedContainer || undefined
        );
        streamIdRef.current = streamId;

        unlisten = (window as any).electronAPI.onLogLine((data: { streamId: string; line: LogEntry }) => {
          if (data.streamId === streamId && !isPaused) {
            setLogs((prev) => {
              const next = [...prev, data.line];
              if (next.length > 2500) next.shift();
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
  }, [item.name, item.kind, namespace, selectedContainer, isPaused]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Discover all unique active pods in this stream
  const activePods = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) {
      if (l.pod) set.add(l.pod);
    }
    return Array.from(set).sort();
  }, [logs]);

  // Filter logs by pod filter, container, and search query
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (selectedPod !== 'ALL' && l.pod && l.pod !== selectedPod) {
        return false;
      }
      if (!filterQuery.trim()) return true;
      return l.raw.toLowerCase().includes(filterQuery.toLowerCase()) || (l.pod && l.pod.toLowerCase().includes(filterQuery.toLowerCase()));
    });
  }, [logs, selectedPod, filterQuery]);

  const handleCopyAll = () => {
    const text = filteredLogs
      .map((l) => `${l.pod ? `[${l.pod}] ` : ''}${l.timestamp ? `[${l.timestamp}] ` : ''}${l.raw}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Monokai Syntax Colorizer for log lines
  const renderLogLine = (entry: LogEntry) => {
    const raw = entry.raw;
    const lower = raw.toLowerCase();

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

    const podColor = entry.pod ? getPodColor(entry.pod) : '';

    return (
      <div key={entry.id} className="flex items-start gap-2 leading-relaxed hover:bg-[#3e3d32]/30 px-1 py-0.5 rounded transition-colors font-mono">
        {/* Pod Badge (Multi-Pod Aggregated Stream) */}
        {entry.pod && (
          <span className={`px-1.5 py-0.2 rounded border text-[10px] font-mono shrink-0 select-none ${podColor}`} title={`Pod: ${entry.pod}`}>
            {entry.pod}
          </span>
        )}

        {/* Timestamp */}
        {entry.timestamp && (
          <span className="text-[#75715e] select-none shrink-0 font-mono text-[11px]">
            {entry.timestamp.slice(11, 19)}
          </span>
        )}

        {prefixTag}
        <span className={`${textColor} whitespace-pre-wrap break-all select-text flex-1`}>{raw}</span>
      </div>
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
              <Terminal size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#f8f8f2] flex items-center gap-2">
                Live Log Stream:{' '}
                <span className="text-[#66d9ef] font-mono">
                  {item.kind}/{item.name}
                </span>
                {isWorkload && (
                  <span className="px-2 py-0.2 rounded-full bg-[#ae81ff]/20 text-[#ae81ff] border border-[#ae81ff]/40 text-[10px] font-bold flex items-center gap-1 font-sans">
                    <Layers size={10} /> Multi-Pod Aggregated ({activePods.length > 0 ? `${activePods.length} Pods` : 'All Replicas'})
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-[#75715e] font-mono">
                Project: {namespace} • Buffer: {logs.length} lines • Monokai Theme
              </p>
            </div>
          </div>

          {/* Controls: Pod Filter & Container Selector */}
          <div className="flex items-center gap-2">
            {/* Pod Selector for Multi-Pod Workloads */}
            {activePods.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs bg-[#1e1f1c] px-2 py-1 rounded border border-[#49483e]">
                <Box size={12} className="text-[#ae81ff]" />
                <span className="text-[#75715e] text-[11px]">Pod:</span>
                <select
                  value={selectedPod}
                  onChange={(e) => setSelectedPod(e.target.value)}
                  className="bg-transparent text-xs text-[#f8f8f2] font-mono outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#272822] text-[#f8f8f2]">
                    All Pods ({activePods.length} Aggregated)
                  </option>
                  {activePods.map((p) => (
                    <option key={p} value={p} className="bg-[#272822] text-[#f8f8f2]">
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Container Selector */}
            {containers.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs bg-[#1e1f1c] px-2 py-1 rounded border border-[#49483e]">
                <span className="text-[#75715e] text-[11px]">Container:</span>
                <select
                  value={selectedContainer}
                  onChange={(e) => {
                    setLogs([]);
                    setSelectedContainer(e.target.value);
                  }}
                  className="bg-transparent text-xs text-[#f8f8f2] font-mono outline-none cursor-pointer"
                >
                  <option value="" className="bg-[#272822] text-[#f8f8f2]">
                    All Containers
                  </option>
                  {containers.map((c) => (
                    <option key={c} value={c} className="bg-[#272822] text-[#f8f8f2]">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Pause / Resume (Icon only with tooltip) */}
            <button
              onClick={() => setIsPaused((prev) => !prev)}
              className={`p-1.5 rounded-lg border flex items-center justify-center transition-colors ${
                isPaused
                  ? 'bg-[#fd971f]/20 border-[#fd971f]/60 text-[#fd971f]'
                  : 'bg-[#a6e22e]/20 border-[#a6e22e]/60 text-[#a6e22e]'
              }`}
              title={isPaused ? 'Resume Streaming' : 'Pause Streaming'}
              aria-label={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>

            {/* Auto-scroll (Icon only with tooltip) */}
            <button
              onClick={() => setAutoScroll((prev) => !prev)}
              className={`p-1.5 rounded-lg border flex items-center justify-center transition-colors ${
                autoScroll
                  ? 'bg-[#66d9ef]/20 border-[#66d9ef]/60 text-[#66d9ef]'
                  : 'bg-[#272822] border-[#49483e] text-[#75715e] hover:text-[#f8f8f2]'
              }`}
              title={autoScroll ? 'Auto-Scroll: Enabled (Click to disable)' : 'Auto-Scroll: Disabled (Click to enable)'}
              aria-label="Toggle Auto-Scroll"
            >
              <ArrowDown size={14} />
            </button>

            {/* Clear */}
            <button
              onClick={() => setLogs([])}
              className="p-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-[#75715e] hover:text-[#f8f8f2] border border-[#49483e] transition-colors"
              title="Clear Log Buffer"
              aria-label="Clear Buffer"
            >
              <Trash2 size={14} />
            </button>

            {/* Copy */}
            <button
              onClick={handleCopyAll}
              className="p-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-[#75715e] hover:text-[#f8f8f2] border border-[#49483e] transition-colors"
              title="Copy All Logs to Clipboard"
              aria-label="Copy Logs"
            >
              {copied ? <Check size={14} className="text-[#a6e22e]" /> : <Copy size={14} />}
            </button>

            {/* Close Button with generous action zone */}
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

        {/* Monokai Filter Input */}
        <div className="px-4 py-2 bg-[#272822]/90 border-b border-[#3e3d32] flex items-center gap-2">
          <Search size={14} className="text-[#75715e]" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder={`Filter live logs for ${item.kind}/${item.name}...`}
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
            <div className="text-[#75715e] italic p-4">
              Waiting for log stream output from {item.kind}/{item.name} across pods...
            </div>
          ) : (
            filteredLogs.map(renderLogLine)
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Monokai Footer */}
        <div className="p-2 bg-[#1e1f1c] border-t border-[#3e3d32] flex items-center justify-between text-[11px] text-[#75715e] font-mono">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-[#fd971f]" />
            <span>Multi-Pod Log Streamer • Monokai Theme</span>
          </div>
          <span>
            {isWorkload && activePods.length > 0 ? `${activePods.length} pods streaming • ` : ''}
            {logs.length} buffered lines
          </span>
        </div>
      </div>
    </div>
  );
};
