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

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize Xterm.js with Monokai theme
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#1e1f1c',
        foreground: '#f8f8f2',
        cursor: '#a6e22e',
        selectionBackground: '#49483e',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#fd971f',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2',
        brightBlack: '#75715e',
        brightRed: '#f92672',
        brightGreen: '#a6e22e',
        brightYellow: '#e6db74',
        brightBlue: '#66d9ef',
        brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4',
        brightWhite: '#f8f8f2',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[36m⚡ Opening interactive pod terminal for ' + item.name + '...\x1b[0m\r\n');

    let currentSessionId = '';
    const api = (window as any).electronAPI;

    const initSession = async () => {
      try {
        currentSessionId = await api.startTerminal(item.name, namespace, container);
        setSessionId(currentSessionId);
        setStatus('connected');
        term.focus();
      } catch (err: any) {
        setStatus('error');
        term.writeln(`\r\n\x1b[31m[Connection error: ${err.message || 'Failed to start terminal'}]\x1b[0m\r\n`);
      }
    };

    initSession();

    // Stream input from xterm to electron
    const onDataDispose = term.onData((data) => {
      if (currentSessionId && api.writeTerminal) {
        api.writeTerminal(currentSessionId, data);
      }
    });

    // Receive data from electron to xterm
    const removeListener = api.onTerminalData((data: { sessionId: string; data: string }) => {
      if (data.sessionId === currentSessionId) {
        term.write(data.data);
      }
    });

    // Window resize handler
    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch {}
    };
    window.addEventListener('resize', handleResize);

    return () => {
      onDataDispose.dispose();
      removeListener();
      window.removeEventListener('resize', handleResize);
      if (currentSessionId && api.stopTerminal) {
        api.stopTerminal(currentSessionId);
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
      <div className="bg-[#1e1f1c] border border-[#49483e] rounded-xl shadow-2xl w-[94vw] max-w-[1350px] h-[88vh] flex flex-col overflow-hidden text-[#f8f8f2]">
        {/* Header */}
        <div className="p-3.5 bg-[#272822] border-b border-[#3e3d32] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#3e3d32] flex items-center justify-center border border-[#49483e] text-[#a6e22e]">
              <Terminal size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#f8f8f2] font-mono flex items-center gap-2">
                  <span>Pod Terminal:</span>
                  <span className="text-[#66d9ef]">{item.name}</span>
                </h2>
                <span
                  className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold border ${
                    status === 'connected'
                      ? 'bg-emerald-950/70 text-[#a6e22e] border-emerald-800'
                      : status === 'connecting'
                      ? 'bg-amber-950/70 text-[#fd971f] border-amber-800'
                      : 'bg-rose-950/70 text-rose-300 border-rose-800'
                  }`}
                >
                  {status === 'connected' ? '● Live Session' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </span>
                <span className="px-2 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                  Project: {namespace}
                </span>
                {container && (
                  <span className="px-2 py-0.2 rounded bg-purple-950/60 border border-purple-800 text-[10px] text-purple-300 font-mono">
                    Container: {container}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#75715e] font-mono">
                Interactive shell session • Full VT100 / xterm color emulation
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySelection}
              className="px-2.5 py-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-slate-300 hover:text-white border border-[#49483e] text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Copy selected terminal text"
            >
              {copied ? <Check size={13} className="text-[#a6e22e]" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy Selection'}</span>
            </button>

            <button
              onClick={handleClear}
              className="px-2.5 py-1.5 rounded-lg bg-[#272822] hover:bg-[#3e3d32] text-slate-300 hover:text-white border border-[#49483e] text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Clear screen buffer"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#75715e] hover:text-[#f8f8f2] hover:bg-[#3e3d32] transition-colors ml-1"
              title="Close terminal (Esc)"
              aria-label="Close terminal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Terminal Canvas Container */}
        <div className="flex-1 p-3 bg-[#1e1f1c] overflow-hidden">
          <div ref={terminalRef} className="w-full h-full rounded-lg overflow-hidden" />
        </div>

        {/* Footer */}
        <div className="p-2.5 bg-[#272822] border-t border-[#3e3d32] flex items-center justify-between text-xs text-[#75715e] font-mono shrink-0">
          <div className="flex items-center gap-3">
            <span>Terminal: <strong>xterm-256color</strong></span>
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
