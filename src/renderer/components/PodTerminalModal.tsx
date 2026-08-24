import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  X,
  Terminal,
  RefreshCw,
  Copy,
  Trash2,
  Check,
  AlertTriangle,
  Server,
  Box,
} from 'lucide-react';
import { ResourceItem } from '../../types/k8s.js';
import { getStoredTheme, ThemeConfig } from '../utils/themes.js';

interface PodTerminalModalProps {
  item: ResourceItem;
  namespace: string;
  container?: string;
  onClose: () => void;
}

export const PodTerminalModal: React.FC<PodTerminalModalProps> = ({
  item,
  namespace,
  container,
  onClose,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [copied, setCopied] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeConfig>(getStoredTheme());

  useEffect(() => {
    if (!terminalRef.current) return;

    const currentTheme = getStoredTheme();
    setActiveTheme(currentTheme);

    // Initialize Xterm.js with consistent monospace font and active theme palette
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      fontWeight: '400',
      fontWeightBold: '700',
      convertEol: true,
      allowTransparency: false,
      scrollback: 10000,
      theme: currentTheme.xtermTheme,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    const fitTerminal = () => {
      if (!terminalRef.current || !fitAddon) return;
      try {
        fitAddon.fit();
      } catch {}
    };

    // Use ResizeObserver for accurate sizing on layout changes
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(fitTerminal);
    });
    resizeObserver.observe(terminalRef.current);

    // Initial fits to handle modal transitions cleanly
    requestAnimationFrame(fitTerminal);
    const fitTimer1 = setTimeout(fitTerminal, 60);
    const fitTimer2 = setTimeout(fitTerminal, 200);

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[36m⚡ Connecting to pod ' + item.name + '...\x1b[0m\r\n');

    const sessionIdRef = { current: '' };
    const api = (window as any).electronAPI;

    // Stream input from xterm to electron
    const onDataDispose = term.onData((data) => {
      if (sessionIdRef.current && api?.writeTerminal) {
        api.writeTerminal(sessionIdRef.current, data);
      }
    });

    // Receive data from electron to xterm
    const removeListener = api?.onTerminalData ? api.onTerminalData((data: { sessionId: string; data: string }) => {
      if (!sessionIdRef.current || data.sessionId === sessionIdRef.current) {
        term.write(data.data);
      }
    }) : () => {};

    const initSession = async () => {
      try {
        if (!api?.startTerminal) {
          throw new Error('Terminal IPC API not available');
        }
        const newSessionId = await api.startTerminal(item.name, namespace, container);
        sessionIdRef.current = newSessionId;
        setSessionId(newSessionId);
        setStatus('connected');
        term.focus();
      } catch (err: any) {
        setStatus('error');
        term.writeln(`\r\n\x1b[31m[Connection error: ${err.message || 'Failed to start terminal'}]\x1b[0m\r\n`);
      }
    };

    initSession();

    // Listen for live theme changes
    const onThemeChange = (e: any) => {
      if (e.detail) {
        setActiveTheme(e.detail);
        if (term && e.detail.xtermTheme) {
          term.options.theme = e.detail.xtermTheme;
        }
      }
    };
    window.addEventListener('app-theme-changed', onThemeChange);

    // Window resize handler
    const handleResize = () => {
      fitTerminal();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(fitTimer1);
      clearTimeout(fitTimer2);
      resizeObserver.disconnect();
      window.removeEventListener('app-theme-changed', onThemeChange);
      onDataDispose.dispose();
      removeListener();
      window.removeEventListener('resize', handleResize);
      if (sessionIdRef.current && api?.stopTerminal) {
        api.stopTerminal(sessionIdRef.current);
      }
      term.dispose();
    };
  }, [item.name, namespace, container]);

  const handleClear = () => {
    if (xtermInstance.current) {
      xtermInstance.current.clear();
      xtermInstance.current.focus();
    }
  };

  const handleCopySelection = () => {
    if (xtermInstance.current) {
      const sel = xtermInstance.current.getSelection();
      if (sel) {
        navigator.clipboard.writeText(sel);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div
        className="rounded-xl shadow-2xl w-[94vw] max-w-[1350px] h-[88vh] flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: activeTheme.preview.bg,
          borderColor: activeTheme.cssVars['--border-subtle'] || '#334155',
          color: activeTheme.preview.text,
        }}
      >
        {/* Header */}
        <div
          className="p-3.5 border-b flex items-center justify-between shrink-0 transition-colors"
          style={{
            backgroundColor: activeTheme.preview.sidebar,
            borderColor: activeTheme.cssVars['--border-color'] || '#1e293b',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center border shadow-sm"
              style={{
                backgroundColor: `${activeTheme.preview.accent}20`,
                borderColor: `${activeTheme.preview.accent}40`,
                color: activeTheme.preview.accent,
              }}
            >
              <Terminal size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold font-mono flex items-center gap-2">
                  <span>Pod Terminal:</span>
                  <span style={{ color: activeTheme.preview.accent }}>{item.name}</span>
                </h2>
                <span
                  className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold border ${
                    status === 'connected'
                      ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800'
                      : status === 'connecting'
                      ? 'bg-amber-950/70 text-amber-400 border-amber-800'
                      : 'bg-rose-950/70 text-rose-300 border-rose-800'
                  }`}
                >
                  {status === 'connected' ? '● Live Session' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </span>
                <span className="px-2 py-0.2 rounded bg-slate-800/80 border border-slate-700 text-[10px] text-slate-300 font-mono">
                  Project: {namespace}
                </span>
                {container && (
                  <span className="px-2 py-0.2 rounded bg-purple-950/60 border border-purple-800 text-[10px] text-purple-300 font-mono">
                    Container: {container}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono opacity-60">
                Interactive shell session • Full VT100 / xterm color emulation • {activeTheme.name}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySelection}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Copy selected terminal text"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy Selection'}</span>
            </button>

            <button
              onClick={handleClear}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Clear screen buffer"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors ml-1"
              title="Close terminal (Esc)"
              aria-label="Close terminal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Terminal Canvas Container */}
        <div
          className="flex-1 p-3 overflow-hidden transition-colors"
          style={{ backgroundColor: activeTheme.preview.bg }}
        >
          <div ref={terminalRef} className="w-full h-full rounded-lg overflow-hidden" />
        </div>

        {/* Footer */}
        <div
          className="p-2.5 border-t flex items-center justify-between text-xs font-mono shrink-0 opacity-70 transition-colors"
          style={{
            backgroundColor: activeTheme.preview.sidebar,
            borderColor: activeTheme.cssVars['--border-color'] || '#1e293b',
          }}
        >
          <div className="flex items-center gap-3">
            <span>Terminal: <strong>xterm-256color</strong></span>
            <span>•</span>
            <span>Theme: <strong>{activeTheme.name}</strong></span>
            <span>•</span>
            <span>Target: <strong>{item.name}</strong></span>
          </div>

          <div>
            <span>Press <strong>Esc</strong> or click <strong>✕</strong> to disconnect and close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
