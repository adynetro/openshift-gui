import React, { useState, useEffect, useRef } from 'react';
import { X, Terminal, Play, Pause, ArrowDown, Trash2, Copy, Search, Check } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#0b0f19] border border-emerald-500/40 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Terminal size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Live Pod Logs: <span className="text-emerald-400 font-mono">{item.name}</span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Project: {namespace} • Buffer: {logs.length} lines
              </p>
            </div>
          </div>

          {/* Container Selector if multi-container */}
          {containers.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Container:</span>
              <select
                value={selectedContainer}
                onChange={(e) => {
                  setLogs([]);
                  setSelectedContainer(e.target.value);
                }}
                className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs"
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
                  ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                  : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
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
                  ? 'bg-cyan-950/60 border-cyan-800 text-cyan-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <ArrowDown size={12} />
              <span>Auto-Scroll</span>
            </button>

            {/* Clear */}
            <button
              onClick={() => setLogs([])}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700"
              title="Clear Log Buffer"
            >
              <Trash2 size={14} />
            </button>

            {/* Copy */}
            <button
              onClick={handleCopyAll}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700"
              title="Copy all logs to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter Input */}
        <div className="px-4 py-2 bg-[#0f172a]/80 border-b border-slate-800 flex items-center gap-2">
          <Search size={14} className="text-slate-500" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search within live logs..."
            className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none"
          />
          {filterQuery && (
            <span className="text-[10px] text-slate-400 font-mono shrink-0">
              Matching: {filteredLogs.length} / {logs.length}
            </span>
          )}
        </div>

        {/* Terminal Screen */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-200 space-y-1 bg-black/90">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-500 italic p-4">Waiting for log stream output from container...</div>
          ) : (
            filteredLogs.map((entry) => {
              const hasErr = entry.raw.toLowerCase().includes('error') || entry.raw.toLowerCase().includes('exception') || entry.raw.toLowerCase().includes('fatal');
              const hasWarn = entry.raw.toLowerCase().includes('warn');
              const textCol = hasErr ? 'text-rose-400' : hasWarn ? 'text-amber-300' : 'text-slate-300';

              return (
                <div key={entry.id} className="flex items-start gap-2 leading-relaxed hover:bg-slate-900/50">
                  {entry.timestamp && (
                    <span className="text-slate-600 select-none shrink-0 font-mono text-[10px]">
                      {entry.timestamp.slice(11, 19)}
                    </span>
                  )}
                  <span className={`${textCol} whitespace-pre-wrap break-all`}>{entry.raw}</span>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};
