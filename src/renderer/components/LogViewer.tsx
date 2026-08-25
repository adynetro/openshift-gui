import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Terminal, Play, Pause, ArrowDown, Trash2, Copy, Search, Check, Sparkles, Layers, Box } from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';
import { useCurrentTheme, ThemeConfig } from '../utils/themes.js';

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

const POD_COLOR_PALETTES = [
  { textVar: '--accent-cyan', defaultColor: '#06b6d4' },
  { textVar: '--accent-green', defaultColor: '#10b981' },
  { textVar: '--accent-yellow', defaultColor: '#f59e0b' },
  { textVar: '--accent-purple', defaultColor: '#a855f7' },
  { textVar: '--accent-blue', defaultColor: '#3b82f6' },
  { textVar: '--accent-red', defaultColor: '#ef4444' },
];

function getPodColorStyle(podName: string, theme: ThemeConfig) {
  let hash = 0;
  for (let i = 0; i < podName.length; i++) {
    hash = (hash << 5) - hash + podName.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % POD_COLOR_PALETTES.length;
  const { textVar, defaultColor } = POD_COLOR_PALETTES[index];
  const color = theme.cssVars[textVar] || defaultColor;

  return {
    color,
    backgroundColor: `${color}20`,
    borderColor: `${color}50`,
  };
}

export const LogViewer: React.FC<LogViewerProps> = ({ item, namespace, onClose }) => {
  const { theme } = useCurrentTheme();
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

  // Syntax Colorizer for log lines matching active theme
  const renderLogLine = (entry: LogEntry) => {
    const raw = entry.raw;
    const lower = raw.toLowerCase();

    const isLight = theme.category === 'light';
    let textColor = theme.cssVars['--text-main'] || (isLight ? '#1e2227' : '#f8fafc');
    let textWeight = 'font-normal';
    let prefixTag = null;

    if (lower.includes('error') || lower.includes('fatal') || lower.includes('panic') || lower.includes('exception') || lower.includes('failed')) {
      const red = theme.cssVars['--accent-red'] || '#ef4444';
      textColor = red;
      textWeight = 'font-semibold';
      prefixTag = (
        <span
          className="px-1 py-0.2 rounded text-[10px] font-bold shrink-0 border"
          style={{
            backgroundColor: `${red}25`,
            color: red,
            borderColor: `${red}40`,
          }}
        >
          ERR
        </span>
      );
    } else if (lower.includes('warn') || lower.includes('warning')) {
      const yellow = theme.cssVars['--accent-yellow'] || '#f59e0b';
      textColor = yellow;
      prefixTag = (
        <span
          className="px-1 py-0.2 rounded text-[10px] font-bold shrink-0 border"
          style={{
            backgroundColor: `${yellow}25`,
            color: yellow,
            borderColor: `${yellow}40`,
          }}
        >
          WARN
        </span>
      );
    } else if (lower.includes('info') || lower.includes('starting') || lower.includes('connected')) {
      textColor = theme.cssVars['--accent-cyan'] || '#06b6d4';
    } else if (lower.includes('success') || lower.includes('ready') || lower.includes('listening')) {
      textColor = theme.cssVars['--accent-green'] || '#10b981';
    } else if (lower.includes('debug') || lower.includes('trace')) {
      textColor = theme.cssVars['--text-muted'] || '#94a3b8';
    }

    const podStyle = entry.pod ? getPodColorStyle(entry.pod, theme) : undefined;

    return (
      <div
        key={entry.id}
        className="flex items-start gap-2 leading-relaxed px-1 py-0.5 rounded transition-colors font-mono hover:brightness-110"
        style={{
          backgroundColor: 'transparent',
        }}
      >
        {/* Pod Badge (Multi-Pod Aggregated Stream) */}
        {entry.pod && (
          <span
            className="px-1.5 py-0.2 rounded border text-[10px] font-mono shrink-0 select-none"
            style={podStyle}
            title={`Pod: ${entry.pod}`}
          >
            {entry.pod}
          </span>
        )}

        {/* Timestamp */}
        {entry.timestamp && (
          <span
            className="select-none shrink-0 font-mono text-[11px]"
            style={{ color: theme.cssVars['--text-muted'] || '#94a3b8' }}
          >
            {entry.timestamp.slice(11, 19)}
          </span>
        )}

        {prefixTag}
        <span className={`${textWeight} whitespace-pre-wrap break-all select-text flex-1`} style={{ color: textColor }}>
          {raw}
        </span>
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
      <div
        className="rounded-xl shadow-2xl w-[96vw] max-w-[1750px] h-[94vh] flex flex-col overflow-hidden border"
        style={{
          backgroundColor: "var(--bg-card, #1e293b)",
          borderColor: "var(--border-subtle, #334155)",
          color: "var(--text-main, #f8fafc)",
        }}
      >
        {/* Themed Header */}
        <div
          className="p-3 border-b flex items-center justify-between"
          style={{
            backgroundColor: "var(--bg-card-header, #0f172a)",
            borderColor: "var(--border-color, #1e293b)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{
                backgroundColor: `${theme.cssVars['--accent-green'] || '#10b981'}20`,
                color: "var(--accent-green, #10b981)",
                borderColor: `${theme.cssVars['--accent-green'] || '#10b981'}40`,
              }}
            >
              <Terminal size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text-main, #f8fafc)" }}>
                Live Log Stream:{' '}
                <span className="font-mono" style={{ color: "var(--accent-cyan, #06b6d4)" }}>
                  {item.kind}/{item.name}
                </span>
                {isWorkload && (
                  <span
                    className="px-2 py-0.2 rounded-full text-[10px] font-bold flex items-center gap-1 font-sans border"
                    style={{
                      backgroundColor: `${theme.cssVars['--accent-purple'] || '#a855f7'}20`,
                      color: "var(--accent-purple, #a855f7)",
                      borderColor: `${theme.cssVars['--accent-purple'] || '#a855f7'}40`,
                    }}
                  >
                    <Layers size={10} /> Multi-Pod Aggregated ({activePods.length > 0 ? `${activePods.length} Pods` : 'All Replicas'})
                  </span>
                )}
              </h2>
              <p className="text-[11px] font-mono" style={{ color: "var(--text-muted, #94a3b8)" }}>
                Project: {namespace} • Buffer: {logs.length} lines • {theme.name} Theme
              </p>
            </div>
          </div>

          {/* Controls: Pod Filter & Container Selector */}
          <div className="flex items-center gap-2">
            {/* Pod Selector for Multi-Pod Workloads */}
            {activePods.length > 1 && (
              <div
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border"
                style={{
                  backgroundColor: "var(--bg-input, #0f172a)",
                  borderColor: "var(--border-subtle, #334155)",
                  color: "var(--text-main, #f8fafc)",
                }}
              >
                <Box size={12} style={{ color: "var(--accent-purple, #a855f7)" }} />
                <span className="text-[11px]" style={{ color: "var(--text-muted, #94a3b8)" }}>Pod:</span>
                <select
                  value={selectedPod}
                  onChange={(e) => setSelectedPod(e.target.value)}
                  className="bg-transparent text-xs font-mono outline-none cursor-pointer"
                  style={{ color: "var(--text-main, #f8fafc)" }}
                >
                  <option value="ALL" style={{ backgroundColor: "var(--bg-input, #0f172a)", color: "var(--text-main, #f8fafc)" }}>
                    All Pods ({activePods.length} Aggregated)
                  </option>
                  {activePods.map((p) => (
                    <option key={p} value={p} style={{ backgroundColor: "var(--bg-input, #0f172a)", color: "var(--text-main, #f8fafc)" }}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Container Selector */}
            {containers.length > 1 && (
              <div
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border"
                style={{
                  backgroundColor: "var(--bg-input, #0f172a)",
                  borderColor: "var(--border-subtle, #334155)",
                  color: "var(--text-main, #f8fafc)",
                }}
              >
                <span className="text-[11px]" style={{ color: "var(--text-muted, #94a3b8)" }}>Container:</span>
                <select
                  value={selectedContainer}
                  onChange={(e) => {
                    setLogs([]);
                    setSelectedContainer(e.target.value);
                  }}
                  className="bg-transparent text-xs font-mono outline-none cursor-pointer"
                  style={{ color: "var(--text-main, #f8fafc)" }}
                >
                  <option value="" style={{ backgroundColor: "var(--bg-input, #0f172a)", color: "var(--text-main, #f8fafc)" }}>
                    All Containers
                  </option>
                  {containers.map((c) => (
                    <option key={c} value={c} style={{ backgroundColor: "var(--bg-input, #0f172a)", color: "var(--text-main, #f8fafc)" }}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Pause / Resume */}
            <button
              onClick={() => setIsPaused((prev) => !prev)}
              className="p-1.5 rounded-lg border flex items-center justify-center transition-colors"
              style={{
                backgroundColor: isPaused
                  ? `${theme.cssVars['--accent-yellow'] || '#f59e0b'}25`
                  : `${theme.cssVars['--accent-green'] || '#10b981'}25`,
                borderColor: isPaused
                  ? `${theme.cssVars['--accent-yellow'] || '#f59e0b'}50`
                  : `${theme.cssVars['--accent-green'] || '#10b981'}50`,
                color: isPaused
                  ? "var(--accent-yellow, #f59e0b)"
                  : "var(--accent-green, #10b981)",
              }}
              title={isPaused ? 'Resume Streaming' : 'Pause Streaming'}
              aria-label={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>

            {/* Auto-scroll */}
            <button
              onClick={() => setAutoScroll((prev) => !prev)}
              className="p-1.5 rounded-lg border flex items-center justify-center transition-colors"
              style={{
                backgroundColor: autoScroll
                  ? `${theme.cssVars['--accent-cyan'] || '#06b6d4'}25`
                  : "var(--bg-input, #0f172a)",
                borderColor: autoScroll
                  ? `${theme.cssVars['--accent-cyan'] || '#06b6d4'}50`
                  : "var(--border-subtle, #334155)",
                color: autoScroll
                  ? "var(--accent-cyan, #06b6d4)"
                  : "var(--text-muted, #94a3b8)",
              }}
              title={autoScroll ? 'Auto-Scroll: Enabled (Click to disable)' : 'Auto-Scroll: Disabled (Click to enable)'}
              aria-label="Toggle Auto-Scroll"
            >
              <ArrowDown size={14} />
            </button>

            {/* Clear */}
            <button
              onClick={() => setLogs([])}
              className="p-1.5 rounded-lg border transition-colors hover:brightness-110"
              style={{
                backgroundColor: "var(--bg-input, #0f172a)",
                borderColor: "var(--border-subtle, #334155)",
                color: "var(--text-muted, #94a3b8)",
              }}
              title="Clear Log Buffer"
              aria-label="Clear Buffer"
            >
              <Trash2 size={14} />
            </button>

            {/* Copy */}
            <button
              onClick={handleCopyAll}
              className="p-1.5 rounded-lg border transition-colors hover:brightness-110"
              style={{
                backgroundColor: "var(--bg-input, #0f172a)",
                borderColor: "var(--border-subtle, #334155)",
                color: copied ? "var(--accent-green, #10b981)" : "var(--text-muted, #94a3b8)",
              }}
              title="Copy All Logs to Clipboard"
              aria-label="Copy Logs"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border transition-colors hover:brightness-110"
              style={{
                backgroundColor: "var(--bg-input, #0f172a)",
                borderColor: "var(--border-subtle, #334155)",
                color: "var(--text-muted, #94a3b8)",
              }}
              title="Close window (Esc)"
              aria-label="Close window"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter Input */}
        <div
          className="px-4 py-2 border-b flex items-center gap-2"
          style={{
            backgroundColor: "var(--bg-input, #0f172a)",
            borderColor: "var(--border-color, #1e293b)",
          }}
        >
          <Search size={14} style={{ color: "var(--text-muted, #94a3b8)" }} />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder={`Filter live logs for ${item.kind}/${item.name}...`}
            className="w-full bg-transparent text-xs outline-none font-mono placeholder:opacity-50"
            style={{
              color: "var(--text-main, #f8fafc)",
            }}
          />
          {filterQuery && (
            <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--accent-cyan, #06b6d4)" }}>
              Matching: {filteredLogs.length} / {logs.length}
            </span>
          )}
        </div>

        {/* Terminal Screen */}
        <div
          className="flex-1 overflow-auto p-4 font-mono text-xs space-y-0.5"
          style={{
            backgroundColor: "var(--bg-main, #0b0f19)",
            color: "var(--text-main, #f8fafc)",
          }}
        >
          {filteredLogs.length === 0 ? (
            <div className="italic p-4" style={{ color: "var(--text-muted, #94a3b8)" }}>
              Waiting for log stream output from {item.kind}/{item.name} across pods...
            </div>
          ) : (
            filteredLogs.map(renderLogLine)
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Footer */}
        <div
          className="p-2 border-t flex items-center justify-between text-[11px] font-mono"
          style={{
            backgroundColor: "var(--bg-card-header, #0f172a)",
            borderColor: "var(--border-color, #1e293b)",
            color: "var(--text-muted, #94a3b8)",
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={12} style={{ color: "var(--accent-yellow, #f59e0b)" }} />
            <span>Multi-Pod Log Streamer • {theme.name} Theme</span>
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
