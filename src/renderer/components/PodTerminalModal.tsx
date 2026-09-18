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
  ExternalLink,
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

  const initialContainers: string[] = Array.from(
    new Set([
      ...(item.raw?.spec?.containers?.map((c: any) => c.name) || []),
      ...(item.raw?.spec?.initContainers?.map((c: any) => c.name) || []),
      ...(item.raw?.spec?.ephemeralContainers?.map((c: any) => c.name) || []),
      ...(item.raw?.spec?.template?.spec?.containers?.map((c: any) => c.name) || []),
      ...(item.extra?.containers?.map((c: any) => (typeof c === 'string' ? c : c.name)) || []),
      ...(container ? [container] : []),
    ])
  ).filter(Boolean);

  const [availableContainers, setAvailableContainers] = useState<string[]>(initialContainers);
  const [actualNamespace, setActualNamespace] = useState<string>(
    item.namespace || (namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : '') || 'default'
  );
  const [activeContainer, setActiveContainer] = useState<string>(
    container ||
    item.raw?.metadata?.annotations?.['kubectl.kubernetes.io/default-container'] ||
    initialContainers[0] ||
    ''
  );

  // Auto-fetch pod containers directly via backend discovery API
  useEffect(() => {
    let isMounted = true;
    const api = (window as any).electronAPI;

    if (api?.getPodContainers) {
      api.getPodContainers(item.name, namespace)
        .then((res: any) => {
          if (!isMounted || !res) return;
          if (res.resolvedNamespace) {
            setActualNamespace(res.resolvedNamespace);
          }
          const discovered: string[] = res.allContainers || res.containers || [];
          if (discovered.length > 0) {
            setAvailableContainers((prev) => Array.from(new Set([...prev, ...discovered])));
            setActiveContainer((curr) => {
              if (curr && discovered.includes(curr)) return curr;
              return container || res.defaultContainer || discovered[0] || '';
            });
          }
        })
        .catch(() => {});
    } else if (api?.getYaml) {
      api.getYaml('pods', item.name, namespace)
        .then((yamlStr: string) => {
          if (!isMounted || !yamlStr) return;
          const nameMatches = yamlStr.matchAll(/^\s*-\s+name:\s+([a-zA-Z0-9_-]+)/gm);
          const discovered: string[] = [];
          for (const m of nameMatches) {
            if (m[1] && !discovered.includes(m[1])) {
              discovered.push(m[1]);
            }
          }
          if (discovered.length > 0) {
            setAvailableContainers((prev) => Array.from(new Set([...prev, ...discovered])));
            setActiveContainer((curr) => curr || discovered[0]);
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [item.name, namespace, container]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Clean any prior children in the canvas container
    terminalRef.current.innerHTML = '';

    const currentTheme = getStoredTheme();
    setActiveTheme(currentTheme);
    setStatus('connecting');

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

    term.writeln('\x1b[36m⚡ Connecting to pod ' + item.name + (activeContainer ? ` [container: ${activeContainer}]` : '') + '...\x1b[0m\r\n');

    const sessionIdRef = { current: '' };
    const api = (window as any).electronAPI;

    // Stream input from xterm to electron
    const onDataDispose = term.onData((data) => {
      if (sessionIdRef.current && api?.writeTerminal) {
        api.writeTerminal(sessionIdRef.current, data);
      }
    });

    const onResizeDispose = term.onResize((size) => {
      if (sessionIdRef.current && api?.resizeTerminal) {
        api.resizeTerminal(sessionIdRef.current, size.cols, size.rows);
      }
    });

    // Receive data from electron to xterm
    const removeListener = api?.onTerminalData ? api.onTerminalData((data: { sessionId: string; data: string }) => {
      if (!sessionIdRef.current || data.sessionId === sessionIdRef.current) {
        term.write(data.data);

        // Discover container names dynamically if reported in terminal error/reconnect output
        const match = data.data.match(/choose one of:\s*\[([^\]]+)\]/i) || data.data.match(/Multiple containers detected:\s*\[([^\]]+)\]/i);
        if (match) {
          const parsedConts = match[1].trim().split(/[,\s]+/).filter(Boolean);
          if (parsedConts.length > 0) {
            setAvailableContainers((prev) => Array.from(new Set([...prev, ...parsedConts])));
            if (!activeContainer || !parsedConts.includes(activeContainer)) {
              setActiveContainer(parsedConts[0]);
            }
          }
        }
      }
    }) : () => {};

    const initSession = async () => {
      try {
        if (!api?.startTerminal) {
          throw new Error('Terminal IPC API not available');
        }
        const targetCont = activeContainer || container || undefined;
        const newSessionId = await api.startTerminal(item.name, actualNamespace, targetCont);
        sessionIdRef.current = newSessionId;
        setSessionId(newSessionId);
        setStatus('connected');
        term.focus();
        if (term.cols && term.rows && api?.resizeTerminal) {
          api.resizeTerminal(newSessionId, term.cols, term.rows);
        }
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
      onResizeDispose.dispose();
      removeListener();
      window.removeEventListener('resize', handleResize);
      if (sessionIdRef.current && api?.stopTerminal) {
        api.stopTerminal(sessionIdRef.current);
      }
      term.dispose();
    };
  }, [item.name, actualNamespace, activeContainer]);

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

  const handleOpenSystemTerminal = async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.openDefaultTerminal) {
        const res = await api.openDefaultTerminal(item.name, actualNamespace, activeContainer || container || undefined);
        if (!res.success) {
          alert(`Failed to open default terminal: ${res.message}`);
        }
      }
    } catch (err: any) {
      alert(`Error launching terminal: ${err.message}`);
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
                  Project: {actualNamespace}
                </span>
                {availableContainers.length > 1 ? (
                  <div
                    className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border shadow-sm"
                    style={{
                      backgroundColor: activeTheme.preview.bg,
                      borderColor: activeTheme.cssVars['--border-subtle'] || '#334155',
                    }}
                  >
                    <Box size={12} className="text-purple-400" />
                    <span className="text-[10px] opacity-70">Container:</span>
                    <select
                      value={activeContainer}
                      onChange={(e) => setActiveContainer(e.target.value)}
                      className="bg-transparent text-[11px] font-mono font-bold text-purple-300 outline-none cursor-pointer"
                    >
                      {availableContainers.map((c) => (
                        <option
                          key={c}
                          value={c}
                          style={{
                            backgroundColor: activeTheme.preview.bg,
                            color: activeTheme.preview.text,
                          }}
                        >
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : activeContainer ? (
                  <span className="px-2 py-0.2 rounded bg-purple-950/60 border border-purple-800 text-[10px] text-purple-300 font-mono">
                    Container: {activeContainer}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] font-mono opacity-60">
                Interactive shell session • Full VT100 / xterm color emulation • {activeTheme.name}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Open in Default External Terminal */}
            <button
              onClick={handleOpenSystemTerminal}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 hover:text-white border border-cyan-700/80 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Launch Pod Shell in System Default Terminal (macOS Terminal, Windows Terminal, Linux)"
            >
              <ExternalLink size={13} />
              <span>System Terminal</span>
            </button>

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
            {activeContainer ? (
              <>
                <span>•</span>
                <span>Container: <strong className="text-purple-300">{activeContainer}</strong></span>
              </>
            ) : null}
          </div>

          <div>
            <span>Press <strong>Esc</strong> or click <strong>✕</strong> to disconnect and close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
