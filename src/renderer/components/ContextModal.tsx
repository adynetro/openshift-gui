import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Search,
  Layers,
  FolderGit2,
  CheckCircle2,
  Server,
  User,
  ArrowRight,
  Globe,
  Trash2,
  Flame,
  ShieldAlert,
  Sparkles,
  AlertTriangle,
  CheckSquare,
  Square,
  RefreshCw,
  Shield,
  Radio,
  ChevronDown,
  ChevronRight,
  LogIn,
  KeyRound,
  Lock,
  FileCode,
  Terminal,
  Eye,
  EyeOff,
  Plus,
} from 'lucide-react';
import { KubeContext, ProjectInfo, ServerInfo } from '../../types/k8s.js';
import { groupServersWithContexts, parseLoginInput } from '../../utils/kube-utils.js';
import { FuzzyMatcher } from '../../utils/fuzzy.js';

interface ContextModalProps {
  mode: 'context' | 'project';
  contexts: KubeContext[];
  servers?: ServerInfo[];
  projects: ProjectInfo[];
  currentContext: string | null;
  currentProject: string;
  onSelectContext: (name: string) => void;
  onSelectProject: (name: string) => void;
  onRefreshContexts?: () => void;
  onClose: () => void;
}

export const ContextModal: React.FC<ContextModalProps> = ({
  mode,
  contexts,
  servers: propServers,
  projects,
  currentContext,
  currentProject,
  onSelectContext,
  onSelectProject,
  onRefreshContexts,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'switch' | 'login' | 'clean'>('switch');
  const [query, setQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedToDelete, setSelectedToDelete] = useState<string[]>([]);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [pruneDangling, setPruneDangling] = useState<boolean>(true);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Login & Import States
  const [loginSubTab, setLoginSubTab] = useState<'command' | 'yaml'>('command');
  const [loginCommand, setLoginCommand] = useState<string>('');
  const [loginServer, setLoginServer] = useState<string>('');
  const [loginAuthType, setLoginAuthType] = useState<'token' | 'basic'>('token');
  const [loginToken, setLoginToken] = useState<string>('');
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginInsecure, setLoginInsecure] = useState<boolean>(true);
  const [loginNamespace, setLoginNamespace] = useState<string>('');
  const [loginClusterName, setLoginClusterName] = useState<string>('');
  const [loginCa, setLoginCa] = useState<string>('');
  const [loginShowToken, setLoginShowToken] = useState<boolean>(false);
  const [loginShowPassword, setLoginShowPassword] = useState<boolean>(false);
  const [showAdvancedLogin, setShowAdvancedLogin] = useState<boolean>(false);
  const [yamlConfig, setYamlConfig] = useState<string>('');
  const [yamlSetActive, setYamlSetActive] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const serverList = useMemo(() => {
    if (propServers && propServers.length > 0) return propServers;
    return groupServersWithContexts(contexts, currentContext);
  }, [propServers, contexts, currentContext]);

  const items = useMemo(() => {
    if (mode === 'context') {
      if (viewMode === 'clean') {
        if (!query.trim()) return contexts;
        const matcher = new FuzzyMatcher(contexts, ['name', 'cluster', 'user', 'server']);
        return matcher.search(query);
      } else {
        // Display only servers with active contexts
        if (!query.trim()) return serverList;
        const matcher = new FuzzyMatcher(serverList, [
          'server',
          'clusterName',
          'activeContextName',
          'user',
          'namespace',
        ]);
        return matcher.search(query);
      }
    } else {
      if (!query.trim()) return projects;
      const matcher = new FuzzyMatcher(projects, ['name', 'displayName']);
      return matcher.search(query);
    }
  }, [mode, viewMode, contexts, serverList, projects, query]);

  // Reset selected index when query or filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, viewMode]);

  // Scroll active item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  const toggleExpandServer = (e: React.MouseEvent, serverKey: string) => {
    e.stopPropagation();
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverKey)) next.delete(serverKey);
      else next.add(serverKey);
      return next;
    });
  };

  const selectItem = (item: any) => {
    if (!item) return;
    if (viewMode === 'clean' && mode === 'context') {
      // Toggle selection for deletion if not current context
      if (item.name !== currentContext) {
        toggleSelectContext(item.name);
      }
      return;
    }
    if (mode === 'context') {
      // If it's a ServerInfo object, select its activeContextName
      const targetCtx = item.activeContextName || item.name;
      onSelectContext(targetCtx);
    } else {
      onSelectProject(item.name);
    }
  };

  const toggleSelectContext = (name: string) => {
    if (name === currentContext) return;
    setSelectedToDelete((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const handleSelectAllInactive = () => {
    const inactiveNames = contexts.filter((c) => c.name !== currentContext).map((c) => c.name);
    if (selectedToDelete.length === inactiveNames.length) {
      setSelectedToDelete([]);
    } else {
      setSelectedToDelete(inactiveNames);
    }
  };

  // Keep Active Context Only (Prunes all other stale contexts & unused clusters/users)
  const handleKeepActiveOnly = async () => {
    if (!currentContext) {
      setStatusMessage({ text: 'No active context is currently set to retain.', type: 'error' });
      return;
    }

    const inactiveCount = contexts.length - 1;
    if (inactiveCount <= 0) {
      setStatusMessage({ text: 'Only the active context exists. No stale contexts to clean.', type: 'info' });
      return;
    }

    const confirmMsg = `⚠️ Clean Kubeconfig Contexts:\n\nThis will permanently delete ${inactiveCount} inactive context(s) and prune orphaned clusters & user credentials.\n\nOnly active context '${currentContext}' will be preserved.\n\nAn automatic backup will be created in ~/.kube/config.bak-*\n\nProceed with cleanup?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsCleaning(true);
      setStatusMessage({ text: 'Cleaning stale contexts and pruning orphaned clusters...', type: 'info' });

      const res = await (window as any).electronAPI.cleanContexts({
        keepActiveOnly: true,
        pruneDangling,
      });

      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setSelectedToDelete([]);
        if (onRefreshContexts) onRefreshContexts();
      } else {
        setStatusMessage({ text: res.message || 'Context cleanup failed.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error executing cleanup.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  // Delete Selected Contexts
  const handleDeleteSelected = async () => {
    if (selectedToDelete.length === 0) return;

    const confirmMsg = `⚠️ Delete ${selectedToDelete.length} selected context(s) from kubeconfig?\n\nContexts:\n• ${selectedToDelete.join('\n• ')}\n\nProceed with deletion?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsCleaning(true);
      setStatusMessage({ text: `Deleting ${selectedToDelete.length} context(s)...`, type: 'info' });

      const res = await (window as any).electronAPI.cleanContexts({
        contextNamesToDelete: selectedToDelete,
        pruneDangling,
      });

      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setSelectedToDelete([]);
        if (onRefreshContexts) onRefreshContexts();
      } else {
        setStatusMessage({ text: res.message || 'Context deletion failed.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error executing deletion.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  // Delete Single Context
  const handleDeleteSingle = async (e: React.MouseEvent, contextName: string) => {
    e.stopPropagation();
    if (contextName === currentContext) return;

    const confirmMsg = `Delete context '${contextName}' from kubeconfig?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsCleaning(true);
      const res = await (window as any).electronAPI.deleteContext(contextName, pruneDangling);
      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setSelectedToDelete((prev) => prev.filter((n) => n !== contextName));
        if (onRefreshContexts) onRefreshContexts();
      } else {
        setStatusMessage({ text: res.message || 'Failed to delete context.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error deleting context.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectItem(items[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleCommandChange = (val: string) => {
    setLoginCommand(val);
    const parsed = parseLoginInput(val);
    if (parsed.isYamlConfig) {
      setLoginSubTab('yaml');
      setYamlConfig(val);
      return;
    }
    if (parsed.server) setLoginServer(parsed.server);
    if (parsed.token) {
      setLoginToken(parsed.token);
      setLoginAuthType('token');
    }
    if (parsed.username) {
      setLoginUsername(parsed.username);
      if (parsed.password) setLoginAuthType('basic');
    }
    if (parsed.password) {
      setLoginPassword(parsed.password);
      setLoginAuthType('basic');
    }
    if (parsed.insecureSkipTlsVerify !== undefined) {
      setLoginInsecure(parsed.insecureSkipTlsVerify);
    }
    if (parsed.namespace) setLoginNamespace(parsed.namespace);
    if (parsed.certificateAuthority) setLoginCa(parsed.certificateAuthority);
  };

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loginSubTab === 'yaml') {
      handleImportYaml();
      return;
    }

    if (!loginServer.trim() && !loginCommand.trim()) {
      setStatusMessage({ text: 'Please enter a server URL or paste an oc login command.', type: 'error' });
      return;
    }

    try {
      setIsLoggingIn(true);
      setStatusMessage({ text: 'Connecting to cluster and configuring kubeconfig...', type: 'info' });

      const res = await (window as any).electronAPI.loginCluster({
        rawCommand: loginCommand.trim() || undefined,
        server: loginServer.trim() || undefined,
        token: loginAuthType === 'token' ? loginToken.trim() || undefined : undefined,
        username: loginAuthType === 'basic' ? loginUsername.trim() || undefined : undefined,
        password: loginAuthType === 'basic' ? loginPassword.trim() || undefined : undefined,
        insecureSkipTlsVerify: loginInsecure,
        namespace: loginNamespace.trim() || undefined,
        clusterName: loginClusterName.trim() || undefined,
        certificateAuthority: loginCa.trim() || undefined,
        setActive: true,
      });

      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        if (onRefreshContexts) onRefreshContexts();
        if (res.contextName) {
          onSelectContext(res.contextName);
        }
      } else {
        setStatusMessage({ text: res.message || 'Login failed.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error during cluster login.', type: 'error' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleImportYaml = async () => {
    if (!yamlConfig.trim()) {
      setStatusMessage({ text: 'Please paste valid Kubeconfig YAML or JSON.', type: 'error' });
      return;
    }

    try {
      setIsLoggingIn(true);
      setStatusMessage({ text: 'Importing and validating kubeconfig...', type: 'info' });

      const res = await (window as any).electronAPI.importKubeConfig(yamlConfig.trim(), yamlSetActive);

      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        if (onRefreshContexts) onRefreshContexts();
        if (res.activeContext) {
          onSelectContext(res.activeContext);
        }
      } else {
        setStatusMessage({ text: res.message || 'Import failed.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Error importing kubeconfig.', type: 'error' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const title =
    mode === 'context'
      ? viewMode === 'clean'
        ? 'Clean & Prune Kubernetes Contexts'
        : viewMode === 'login'
        ? 'Login & Add Cluster'
        : 'Switch Server & Active Context'
      : 'Switch Project / Namespace';
  const Icon =
    mode === 'context'
      ? viewMode === 'clean'
        ? Flame
        : viewMode === 'login'
        ? LogIn
        : Server
      : FolderGit2;

  const inactiveCount = contexts.filter((c) => c.name !== currentContext).length;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-color, #334155)',
          color: 'var(--text-main, #f8fafc)',
        }}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                viewMode === 'clean'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : viewMode === 'login'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
              }`}
            >
              <Icon size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{title}</span>
                {mode === 'context' && viewMode === 'clean' && (
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-mono">
                    Cleanup Mode
                  </span>
                )}
                {mode === 'context' && viewMode === 'login' && (
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono">
                    Auth / Import
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {mode === 'context'
                  ? viewMode === 'clean'
                    ? `Total Contexts: ${contexts.length} • Stale to Clean: ${inactiveCount}`
                    : viewMode === 'login'
                    ? 'Authenticate via oc login command, Bearer Token, or paste raw Kubeconfig YAML'
                    : `Active Servers: ${serverList.length} • Total Contexts: ${contexts.length} • Active: ${currentContext || 'None'}`
                  : `Available Projects: ${projects.length}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Switch / Login / Clean mode for Contexts */}
            {mode === 'context' && (
              <div className="flex items-center rounded-lg bg-slate-900 border border-slate-700 p-0.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setViewMode('switch')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'switch'
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Switch between active cluster servers and contexts"
                >
                  <Server size={12} />
                  <span>Servers ({serverList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('login')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'login'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Login to new cluster or import kubeconfig YAML"
                >
                  <LogIn size={12} />
                  <span>+ Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('clean')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'clean'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Clean and prune stale inactive contexts"
                >
                  <Trash2 size={12} />
                  <span>Clean ({inactiveCount})</span>
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close window (Esc)"
              aria-label="Close window"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Alert Message */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b shrink-0 ${
              statusMessage.type === 'error'
                ? 'bg-rose-950/80 text-rose-200 border-rose-800'
                : statusMessage.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-200 border-emerald-800'
                : 'bg-blue-950/80 text-blue-200 border-blue-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'error' ? (
                <AlertTriangle size={14} />
              ) : statusMessage.type === 'success' ? (
                <CheckCircle2 size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ×
            </button>
          </div>
        )}

        {/* LOGIN & IMPORT CLUSTER VIEW */}
        {mode === 'context' && viewMode === 'login' && (
          <div className="flex-1 overflow-auto p-5 space-y-4 font-sans">
            {/* Sub-Tabs: oc login command vs Paste Kubeconfig YAML */}
            <div className="flex items-center gap-2 p-1 bg-slate-900/90 rounded-lg border border-slate-700/80 text-xs font-mono">
              <button
                type="button"
                onClick={() => setLoginSubTab('command')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  loginSubTab === 'command'
                    ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-950/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal size={13} />
                <span>oc login / Token Auth</span>
              </button>
              <button
                type="button"
                onClick={() => setLoginSubTab('yaml')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  loginSubTab === 'yaml'
                    ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-950/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode size={13} />
                <span>Paste Kubeconfig YAML</span>
              </button>
            </div>

            {/* TAB 1: oc login / Token Auth */}
            {loginSubTab === 'command' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {/* Smart Paste Command Box */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Terminal size={14} className="text-cyan-400" />
                      <span>Smart Paste (oc login command or Server URL)</span>
                    </label>
                    <span className="text-[10px] text-cyan-400/80 font-mono">
                      Auto-extracts token, server, flags
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={loginCommand}
                    onChange={(e) => handleCommandChange(e.target.value)}
                    placeholder="Paste command here, e.g. oc login https://api.mycluster.domain.com:6443 --token=sha256~... --insecure-skip-tls-verify=true"
                    className="w-full p-2.5 rounded-lg border text-xs font-mono bg-slate-950/90 border-slate-700 text-cyan-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner"
                  />
                </div>

                {/* Server URL Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    Cluster API Server URL <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Globe size={14} className="absolute inset-y-0 left-3 my-auto text-slate-400" />
                    <input
                      type="text"
                      required
                      value={loginServer}
                      onChange={(e) => setLoginServer(e.target.value)}
                      placeholder="https://api.mycluster.domain.com:6443"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border text-xs font-mono bg-slate-950/80 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                    />
                  </div>
                </div>

                {/* Auth Type Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200">
                      Authentication Method
                    </label>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <button
                        type="button"
                        onClick={() => setLoginAuthType('token')}
                        className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer ${
                          loginAuthType === 'token'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Bearer Token (Recommended)
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoginAuthType('basic')}
                        className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer ${
                          loginAuthType === 'basic'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        User & Password
                      </button>
                    </div>
                  </div>

                  {loginAuthType === 'token' ? (
                    <div className="relative">
                      <KeyRound size={14} className="absolute inset-y-0 left-3 my-auto text-slate-400" />
                      <input
                        type={loginShowToken ? 'text' : 'password'}
                        value={loginToken}
                        onChange={(e) => setLoginToken(e.target.value)}
                        placeholder="sha256~... or Bearer JWT Token"
                        className="w-full pl-9 pr-10 py-2 rounded-lg border text-xs font-mono bg-slate-950/80 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setLoginShowToken(!loginShowToken)}
                        className="absolute inset-y-0 right-3 my-auto text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title={loginShowToken ? 'Hide token' : 'Show token'}
                      >
                        {loginShowToken ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <User size={14} className="absolute inset-y-0 left-3 my-auto text-slate-400" />
                        <input
                          type="text"
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value)}
                          placeholder="Username (e.g. admin)"
                          className="w-full pl-9 pr-3 py-2 rounded-lg border text-xs font-mono bg-slate-950/80 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                        />
                      </div>
                      <div className="relative">
                        <Lock size={14} className="absolute inset-y-0 left-3 my-auto text-slate-400" />
                        <input
                          type={loginShowPassword ? 'text' : 'password'}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Password"
                          className="w-full pl-9 pr-10 py-2 rounded-lg border text-xs font-mono bg-slate-950/80 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setLoginShowPassword(!loginShowPassword)}
                          className="absolute inset-y-0 right-3 my-auto text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title={loginShowPassword ? 'Hide password' : 'Show password'}
                        >
                          {loginShowPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Insecure TLS Checkbox */}
                <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={loginInsecure}
                      onChange={(e) => setLoginInsecure(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Skip TLS Certificate Verification (<code className="text-cyan-400 text-[11px]">--insecure-skip-tls-verify</code>)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Self-signed / dev certs</span>
                </div>

                {/* Advanced Options Accordion */}
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedLogin(!showAdvancedLogin)}
                    className="w-full p-2.5 bg-slate-900/60 hover:bg-slate-900 flex items-center justify-between text-xs text-slate-300 font-mono cursor-pointer transition-colors"
                  >
                    <span>Advanced Options (Namespace, Custom Cluster Alias, CA Cert)</span>
                    {showAdvancedLogin ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {showAdvancedLogin && (
                    <div className="p-3 space-y-3 bg-slate-950/40 border-t border-slate-800">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">
                          Default Namespace / Project (<code className="text-cyan-400">-n</code>)
                        </label>
                        <input
                          type="text"
                          value={loginNamespace}
                          onChange={(e) => setLoginNamespace(e.target.value)}
                          placeholder="default (optional)"
                          className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">
                          Custom Cluster Alias / Context Name
                        </label>
                        <input
                          type="text"
                          value={loginClusterName}
                          onChange={(e) => setLoginClusterName(e.target.value)}
                          placeholder="Auto-generated from URL hostname (optional)"
                          className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">
                          Certificate Authority Path (<code className="text-cyan-400">--certificate-authority</code>)
                        </label>
                        <input
                          type="text"
                          value={loginCa}
                          onChange={(e) => setLoginCa(e.target.value)}
                          placeholder="/path/to/ca.crt (optional)"
                          className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isLoggingIn ? <RefreshCw size={14} className="animate-spin" /> : <LogIn size={14} />}
                  <span>{isLoggingIn ? 'Connecting to Cluster & Updating Kubeconfig...' : 'Connect & Login to Cluster'}</span>
                </button>
              </form>
            )}

            {/* TAB 2: Paste Kubeconfig YAML */}
            {loginSubTab === 'yaml' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <FileCode size={14} className="text-cyan-400" />
                      <span>Paste Kubeconfig YAML or JSON</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Merges clusters, users & contexts safely
                    </span>
                  </div>
                  <textarea
                    rows={12}
                    value={yamlConfig}
                    onChange={(e) => setYamlConfig(e.target.value)}
                    placeholder={`apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://api.cluster.example.com:6443\n    insecure-skip-tls-verify: true\n  name: my-cluster\ncontexts:\n- context:\n    cluster: my-cluster\n    user: my-user\n    namespace: default\n  name: default/my-cluster/my-user\ncurrent-context: default/my-cluster/my-user\nusers:\n- name: my-user\n  user:\n    token: sha256~...`}
                    className="w-full p-3 rounded-lg border text-xs font-mono bg-slate-950/90 border-slate-700 text-cyan-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={yamlSetActive}
                      onChange={(e) => setYamlSetActive(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Set imported context as active immediately</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Auto-backup created in ~/.kube/config.bak-*
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setYamlConfig('')}
                    disabled={!yamlConfig || isLoggingIn}
                    className="px-4 py-2.5 rounded-lg text-xs font-semibold border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleImportYaml}
                    disabled={!yamlConfig.trim() || isLoggingIn}
                    className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/60 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isLoggingIn ? <RefreshCw size={14} className="animate-spin" /> : <FileCode size={14} />}
                    <span>{isLoggingIn ? 'Importing Kubeconfig...' : 'Import & Apply Kubeconfig'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clean Contexts Action Toolbar (Shown in 'clean' mode) */}
        {mode === 'context' && viewMode === 'clean' && (
          <div
            className="p-3 border-b space-y-2 shrink-0"
            style={{
              backgroundColor: 'rgba(244, 63, 94, 0.05)',
              borderColor: 'var(--border-color, #334155)',
            }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              {/* Option 1: Keep Active Context Only */}
              <button
                type="button"
                onClick={handleKeepActiveOnly}
                disabled={isCleaning || inactiveCount === 0}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer ${
                  inactiveCount > 0
                    ? 'bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
                title="Deletes all stale inactive contexts and keeps only current active context"
              >
                <Flame size={14} className="text-yellow-300" />
                <span>Keep Active Context Only ({inactiveCount} stale to remove)</span>
              </button>

              {/* Option 2: Delete Selected Button */}
              {selectedToDelete.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isCleaning}
                  className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete Selected ({selectedToDelete.length})</span>
                </button>
              )}
            </div>

            {/* Options Bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAllInactive}
                  className="hover:text-cyan-300 text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  {selectedToDelete.length === inactiveCount && inactiveCount > 0 ? (
                    <CheckSquare size={13} className="text-cyan-400" />
                  ) : (
                    <Square size={13} />
                  )}
                  <span>
                    {selectedToDelete.length === inactiveCount && inactiveCount > 0
                      ? 'Deselect All'
                      : 'Select All Inactive'}
                  </span>
                </button>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={pruneDangling}
                    onChange={(e) => setPruneDangling(e.target.checked)}
                    className="rounded border-slate-700 text-rose-500 focus:ring-0 cursor-pointer"
                  />
                  <span>Prune Orphaned Clusters & Users</span>
                </label>
              </div>

              <span className="text-[10px] text-slate-500">
                Safe: Auto-backup created in ~/.kube/config.bak-*
              </span>
            </div>
          </div>
        )}

        {/* Autocomplete Search Input with Keyboard Navigation (Shown for switch and clean modes) */}
        {viewMode !== 'login' && (
          <div
            className="p-3 border-b shrink-0"
            style={{
              backgroundColor: 'var(--bg-card-header, #0f172a)',
              borderColor: 'var(--border-color, #334155)',
            }}
          >
            <div className="relative">
              <Search size={16} className="absolute inset-y-0 left-3 my-auto text-slate-400 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === 'context'
                    ? viewMode === 'clean'
                      ? 'Filter contexts to clean...'
                      : 'Search and filter active servers & contexts... (use ↑ / ↓ arrows and ↵ Enter)'
                    : 'Search and filter projects... (use ↑ / ↓ arrows and ↵ Enter)'
                }
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-xs placeholder-slate-500 shadow-inner focus:outline-none font-mono"
                style={{
                  backgroundColor: 'var(--bg-input, #0f172a)',
                  borderColor: 'var(--border-subtle, #334155)',
                  color: 'var(--text-main, #f8fafc)',
                }}
              />
            </div>
          </div>
        )}

        {/* Items List (Shown for switch and clean modes) */}
        {viewMode !== 'login' && (
        <div className="flex-1 overflow-auto p-3 space-y-1.5 divide-y divide-slate-800/40 font-sans">

          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No matching {mode === 'context' ? (viewMode === 'clean' ? 'contexts' : 'servers with active contexts') : 'projects'} found.
            </div>
          ) : (
            items.map((item: any, idx: number) => {
              const isServerItem = mode === 'context' && viewMode === 'switch';
              const isCurrent = isServerItem
                ? item.isCurrent
                : mode === 'context'
                ? item.name === currentContext
                : item.name === currentProject ||
                  (item.name === 'all-projects' && (!currentProject || currentProject === 'all-projects'));
              const isAllProjects = mode === 'project' && item.name === 'all-projects';
              const isHighlighted = idx === selectedIndex && viewMode === 'switch';
              const isChecked = selectedToDelete.includes(item.name);
              const serverKey = item.server || item.clusterName || item.name;
              const isExpanded = expandedServers.has(serverKey);

              return (
                <div
                  key={isServerItem ? `${item.server}-${item.clusterName}-${idx}` : item.name}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex flex-col p-3 rounded-lg text-left transition-all cursor-pointer group ${
                    viewMode === 'clean' && isChecked
                      ? 'bg-rose-950/40 border border-rose-500/60 shadow-sm'
                      : isHighlighted
                      ? 'bg-cyan-950/70 border-2 border-cyan-400 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400'
                      : isCurrent
                      ? 'bg-cyan-950/40 border border-cyan-500/50 shadow-sm'
                      : isAllProjects
                      ? 'bg-purple-950/20 hover:bg-purple-950/40 border border-purple-900/40'
                      : 'hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Checkbox in clean mode */}
                      {mode === 'context' && viewMode === 'clean' && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectContext(item.name);
                          }}
                          className="p-1 cursor-pointer shrink-0"
                        >
                          {isCurrent ? (
                            <div title="Current active context is protected">
                              <Shield size={16} className="text-amber-400" />
                            </div>
                          ) : isChecked ? (
                            <CheckSquare size={16} className="text-rose-400" />
                          ) : (
                            <Square size={16} className="text-slate-500 hover:text-slate-300" />
                          )}
                        </div>
                      )}

                      {/* Left icon for server */}
                      {isServerItem && (
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            isCurrent
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          <Server size={16} />
                        </div>
                      )}

                      <div className="space-y-1 min-w-0">
                        {/* Server Switch View */}
                        {isServerItem ? (
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`font-mono text-sm font-semibold transition-colors truncate max-w-[340px] ${
                                  isCurrent
                                    ? 'text-cyan-300 font-bold'
                                    : isHighlighted
                                    ? 'text-cyan-300 font-bold'
                                    : 'text-white group-hover:text-cyan-300'
                                }`}
                                title={`Cluster: ${item.clusterName || item.server}\nServer API: ${item.server}`}
                              >
                                {item.clusterName || item.server}
                              </span>

                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold flex items-center gap-1 font-mono shrink-0">
                                  <CheckCircle2 size={10} /> Active Cluster
                                </span>
                              )}

                              <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px] font-mono shrink-0">
                                {item.contextCount} context{item.contextCount > 1 ? 's' : ''}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono flex-wrap">
                              <span className="flex items-center gap-1 text-slate-300">
                                <Layers size={11} className="text-cyan-400" />
                                <span className="font-semibold text-cyan-200 truncate max-w-[220px]" title={`Context: ${item.activeContextName}`}>
                                  {item.activeContextName}
                                </span>
                              </span>

                              {item.server && item.server !== item.clusterName && (
                                <span className="flex items-center gap-1 text-slate-400">
                                  <Server size={10} className="text-slate-500" />
                                  <span className="truncate max-w-[200px]" title={item.server}>{item.server}</span>
                                </span>
                              )}

                              {item.user && (
                                <span className="flex items-center gap-1">
                                  <User size={11} className="text-slate-500" />
                                  <span className="truncate max-w-[140px]">{item.user}</span>
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          /* Context Clean View or Project View */
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              {isAllProjects && <Globe size={15} className="text-purple-400 shrink-0" />}
                              <span
                                className={`font-mono text-sm font-semibold transition-colors ${
                                  isCurrent
                                    ? 'text-cyan-300 font-bold'
                                    : isHighlighted
                                    ? 'text-cyan-300 font-bold'
                                    : isAllProjects
                                    ? 'text-purple-300 group-hover:text-purple-200'
                                    : 'text-white group-hover:text-cyan-300'
                                }`}
                              >
                                {item.displayName || item.name}
                              </span>
                              {isAllProjects && (
                                <span className="px-2 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-mono">
                                  Cluster-Wide
                                </span>
                              )}
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold flex items-center gap-1 font-mono">
                                  <CheckCircle2 size={10} /> Active (Keep)
                                </span>
                              )}
                            </div>

                            {mode === 'context' ? (
                              <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono flex-wrap">
                                {item.server && (
                                  <span className="flex items-center gap-1 text-slate-300">
                                    <Server size={11} className="text-cyan-400" />
                                    <span className="truncate max-w-[200px]">{item.server}</span>
                                  </span>
                                )}
                                {item.cluster && (
                                  <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                    cluster: {item.cluster}
                                  </span>
                                )}
                                {item.user && (
                                  <span className="flex items-center gap-1">
                                    <User size={11} className="text-slate-500" />
                                    <span className="truncate max-w-[140px]">{item.user}</span>
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400 font-mono">
                                {isAllProjects ? (
                                  <span className="text-purple-400">View all resources across all namespaces</span>
                                ) : (
                                  <>
                                    Status: <span className="text-emerald-400">{item.status || 'Active'}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right side actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isServerItem && item.contextCount > 1 && (
                        <button
                          type="button"
                          onClick={(e) => toggleExpandServer(e, serverKey)}
                          className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] font-mono flex items-center gap-1"
                          title="View all contexts for this server"
                        >
                          <span>{isExpanded ? 'Hide' : 'All'} Contexts</span>
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      )}

                      {mode === 'context' && viewMode === 'clean' ? (
                        !isCurrent && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSingle(e, item.name)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title={`Delete context '${item.name}'`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )
                      ) : (
                        <>
                          {isHighlighted && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950 text-[10px] font-bold font-mono">
                              ↵ Enter
                            </span>
                          )}
                          <div
                            className={`transition-colors ${
                              isHighlighted ? 'text-cyan-300' : 'text-slate-500 group-hover:text-cyan-400'
                            }`}
                          >
                            <ArrowRight size={16} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded Sub-Contexts List for Server */}
                  {isServerItem && isExpanded && item.contexts && item.contexts.length > 0 && (
                    <div
                      className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1 pl-11"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mb-1">
                        Available Contexts for this Server:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.contexts.map((subCtx: KubeContext) => {
                          const isSubCurrent = subCtx.name === currentContext;
                          return (
                            <button
                              key={subCtx.name}
                              type="button"
                              onClick={() => onSelectContext(subCtx.name)}
                              className={`px-2 py-1 rounded text-xs font-mono flex items-center gap-1.5 border transition-all cursor-pointer ${
                                isSubCurrent
                                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500 shadow-sm'
                                  : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-cyan-400 hover:text-white'
                              }`}
                            >
                              <Layers size={11} className={isSubCurrent ? 'text-cyan-400' : 'text-slate-500'} />
                              <span>{subCtx.name}</span>
                              {subCtx.namespace && (
                                <span className="text-[10px] text-slate-500">({subCtx.namespace})</span>
                              )}
                              {isSubCurrent && <CheckCircle2 size={10} className="text-cyan-400" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}

        {/* Footer with keyboard hints */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono shrink-0">
          <div className="flex items-center gap-2">
            <span>
              Use <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">↑</kbd>{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">↓</kbd> to
              navigate
            </span>
            <span>•</span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">↵ Enter</kbd>{' '}
              to select
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
