import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Save,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Network,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  Plus,
  Trash2,
  Edit2,
  Code2,
  Sparkles,
  Check,
  Copy,
  RefreshCw,
  Box,
  Layers,
  Globe,
  Filter,
  Radio,
  ChevronRight,
  Split,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Workflow,
  Server,
  Zap,
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { parse as parseYaml, parseAllDocuments, stringify as stringifyYaml } from 'yaml';
import { ResourceItem } from '../../types/k8s.js';
import { useCurrentTheme } from '../utils/themes.js';

interface NetworkPolicyDesignerModalProps {
  item?: ResourceItem | null;
  namespace: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export interface PortRule {
  id: string;
  protocol: 'TCP' | 'UDP' | 'SCTP';
  port: string;
}

export interface PeerRule {
  id: string;
  type: 'pod' | 'namespace' | 'namespace-and-pod' | 'ipBlock';
  podSelector?: Record<string, string>;
  namespaceSelector?: Record<string, string>;
  ipBlock?: {
    cidr: string;
    except?: string[];
  };
}

export interface IngressRule {
  id: string;
  from: PeerRule[];
  ports: PortRule[];
}

export interface EgressRule {
  id: string;
  to: PeerRule[];
  ports: PortRule[];
}

export interface NetworkPolicyModel {
  name: string;
  namespace: string;
  targetAllPods: boolean;
  targetPodLabels: Record<string, string>;
  policyTypes: {
    ingress: boolean;
    egress: boolean;
  };
  ingressRules: IngressRule[];
  egressRules: EgressRule[];
}

const TEMPLATES: Array<{
  name: string;
  description: string;
  icon: any;
  build: (name: string, namespace: string) => NetworkPolicyModel;
}> = [
  {
    name: 'Default Deny All Ingress',
    description: 'Isolates all pods in namespace by dropping all inbound traffic.',
    icon: ShieldAlert,
    build: (name, ns) => ({
      name: name || 'default-deny-ingress',
      namespace: ns,
      targetAllPods: true,
      targetPodLabels: {},
      policyTypes: { ingress: true, egress: false },
      ingressRules: [],
      egressRules: [],
    }),
  },
  {
    name: 'Default Deny All (Ingress & Egress)',
    description: 'Complete traffic blackout: drops all incoming and outgoing connections.',
    icon: ShieldAlert,
    build: (name, ns) => ({
      name: name || 'default-deny-all',
      namespace: ns,
      targetAllPods: true,
      targetPodLabels: {},
      policyTypes: { ingress: true, egress: true },
      ingressRules: [],
      egressRules: [],
    }),
  },
  {
    name: 'Allow Ingress from Same Namespace Only',
    description: 'Allows pods in the current namespace to communicate freely while blocking external project traffic.',
    icon: ShieldCheck,
    build: (name, ns) => ({
      name: name || 'allow-same-namespace',
      namespace: ns,
      targetAllPods: true,
      targetPodLabels: {},
      policyTypes: { ingress: true, egress: false },
      ingressRules: [
        {
          id: `in-${Date.now()}-1`,
          from: [
            {
              id: `peer-${Date.now()}-1`,
              type: 'pod',
              podSelector: {},
            },
          ],
          ports: [],
        },
      ],
      egressRules: [],
    }),
  },
  {
    name: 'Allow HTTP/HTTPS Ingress',
    description: 'Allows incoming web traffic on ports 80 and 443 TCP from any source.',
    icon: Globe,
    build: (name, ns) => ({
      name: name || 'allow-http-ingress',
      namespace: ns,
      targetAllPods: false,
      targetPodLabels: { app: 'web' },
      policyTypes: { ingress: true, egress: false },
      ingressRules: [
        {
          id: `in-${Date.now()}-1`,
          from: [
            {
              id: `peer-${Date.now()}-1`,
              type: 'ipBlock',
              ipBlock: { cidr: '0.0.0.0/0' },
            },
          ],
          ports: [
            { id: 'p1', protocol: 'TCP', port: '80' },
            { id: 'p2', protocol: 'TCP', port: '443' },
          ],
        },
      ],
      egressRules: [],
    }),
  },
  {
    name: 'Frontend to Backend Tier',
    description: 'Allows only pods with app=frontend to access backend pods on port 8080.',
    icon: Layers,
    build: (name, ns) => ({
      name: name || 'backend-allow-frontend',
      namespace: ns,
      targetAllPods: false,
      targetPodLabels: { app: 'backend' },
      policyTypes: { ingress: true, egress: false },
      ingressRules: [
        {
          id: `in-${Date.now()}-1`,
          from: [
            {
              id: `peer-${Date.now()}-1`,
              type: 'pod',
              podSelector: { app: 'frontend' },
            },
          ],
          ports: [{ id: 'p1', protocol: 'TCP', port: '8080' }],
        },
      ],
      egressRules: [],
    }),
  },
  {
    name: 'Allow CoreDNS Egress',
    description: 'Allows outbound DNS queries (UDP/TCP 53) to kube-system or OpenShift DNS.',
    icon: Network,
    build: (name, ns) => ({
      name: name || 'allow-dns-egress',
      namespace: ns,
      targetAllPods: true,
      targetPodLabels: {},
      policyTypes: { ingress: false, egress: true },
      ingressRules: [],
      egressRules: [
        {
          id: `eg-${Date.now()}-1`,
          to: [
            {
              id: `peer-${Date.now()}-1`,
              type: 'namespace',
              namespaceSelector: { 'kubernetes.io/metadata.name': 'openshift-dns' },
            },
          ],
          ports: [
            { id: 'p1', protocol: 'UDP', port: '53' },
            { id: 'p2', protocol: 'TCP', port: '53' },
          ],
        },
      ],
    }),
  },
];

function modelToYaml(model: NetworkPolicyModel): string {
  const types: string[] = [];
  if (model.policyTypes.ingress) types.push('Ingress');
  if (model.policyTypes.egress) types.push('Egress');

  const podSelector: any = {};
  if (!model.targetAllPods && Object.keys(model.targetPodLabels).length > 0) {
    podSelector.matchLabels = { ...model.targetPodLabels };
  }

  const ingress: any[] = model.ingressRules.map((rule) => {
    const entry: any = {};
    if (rule.from.length > 0) {
      entry.from = rule.from.map((f) => {
        const peer: any = {};
        if (f.type === 'ipBlock' && f.ipBlock) {
          peer.ipBlock = { cidr: f.ipBlock.cidr };
          if (f.ipBlock.except && f.ipBlock.except.length > 0) {
            peer.ipBlock.except = f.ipBlock.except;
          }
        }
        if ((f.type === 'pod' || f.type === 'namespace-and-pod') && f.podSelector) {
          peer.podSelector = { matchLabels: f.podSelector };
        }
        if ((f.type === 'namespace' || f.type === 'namespace-and-pod') && f.namespaceSelector) {
          peer.namespaceSelector = { matchLabels: f.namespaceSelector };
        }
        return peer;
      });
    }
    if (rule.ports.length > 0) {
      entry.ports = rule.ports.map((p) => ({
        protocol: p.protocol,
        port: isNaN(Number(p.port)) ? p.port : Number(p.port),
      }));
    }
    return entry;
  });

  const egress: any[] = model.egressRules.map((rule) => {
    const entry: any = {};
    if (rule.to.length > 0) {
      entry.to = rule.to.map((t) => {
        const peer: any = {};
        if (t.type === 'ipBlock' && t.ipBlock) {
          peer.ipBlock = { cidr: t.ipBlock.cidr };
          if (t.ipBlock.except && t.ipBlock.except.length > 0) {
            peer.ipBlock.except = t.ipBlock.except;
          }
        }
        if ((t.type === 'pod' || t.type === 'namespace-and-pod') && t.podSelector) {
          peer.podSelector = { matchLabels: t.podSelector };
        }
        if ((t.type === 'namespace' || t.type === 'namespace-and-pod') && t.namespaceSelector) {
          peer.namespaceSelector = { matchLabels: t.namespaceSelector };
        }
        return peer;
      });
    }
    if (rule.ports.length > 0) {
      entry.ports = rule.ports.map((p) => ({
        protocol: p.protocol,
        port: isNaN(Number(p.port)) ? p.port : Number(p.port),
      }));
    }
    return entry;
  });

  const k8sObj: any = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: model.name || 'custom-network-policy',
      namespace: model.namespace || 'default',
    },
    spec: {
      podSelector,
      policyTypes: types.length > 0 ? types : ['Ingress'],
    },
  };

  if (model.policyTypes.ingress) {
    k8sObj.spec.ingress = ingress;
  }
  if (model.policyTypes.egress) {
    k8sObj.spec.egress = egress;
  }

  return stringifyYaml(k8sObj);
}

function yamlToModel(yamlStr: string, defaultNs: string): NetworkPolicyModel {
  try {
    const parsed = parseYaml(yamlStr);
    const spec = parsed?.spec || {};
    const metadata = parsed?.metadata || {};

    const policyTypes = spec.policyTypes || [];
    const hasIngress = policyTypes.includes('Ingress') || !!spec.ingress;
    const hasEgress = policyTypes.includes('Egress') || !!spec.egress;

    const podLabels = spec.podSelector?.matchLabels || {};
    const targetAllPods = Object.keys(podLabels).length === 0 && !spec.podSelector?.matchExpressions;

    const ingressRules: IngressRule[] = (spec.ingress || []).map((rule: any, i: number) => {
      const fromList: PeerRule[] = (rule.from || []).map((f: any, fi: number) => {
        let type: PeerRule['type'] = 'pod';
        if (f.ipBlock) type = 'ipBlock';
        else if (f.namespaceSelector && f.podSelector) type = 'namespace-and-pod';
        else if (f.namespaceSelector) type = 'namespace';

        return {
          id: `from-${i}-${fi}`,
          type,
          podSelector: f.podSelector?.matchLabels || {},
          namespaceSelector: f.namespaceSelector?.matchLabels || {},
          ipBlock: f.ipBlock ? { cidr: f.ipBlock.cidr, except: f.ipBlock.except } : undefined,
        };
      });

      const portList: PortRule[] = (rule.ports || []).map((p: any, pi: number) => ({
        id: `port-${i}-${pi}`,
        protocol: p.protocol || 'TCP',
        port: String(p.port || ''),
      }));

      return {
        id: `in-rule-${i}`,
        from: fromList,
        ports: portList,
      };
    });

    const egressRules: EgressRule[] = (spec.egress || []).map((rule: any, i: number) => {
      const toList: PeerRule[] = (rule.to || []).map((t: any, ti: number) => {
        let type: PeerRule['type'] = 'pod';
        if (t.ipBlock) type = 'ipBlock';
        else if (t.namespaceSelector && t.podSelector) type = 'namespace-and-pod';
        else if (t.namespaceSelector) type = 'namespace';

        return {
          id: `to-${i}-${ti}`,
          type,
          podSelector: t.podSelector?.matchLabels || {},
          namespaceSelector: t.namespaceSelector?.matchLabels || {},
          ipBlock: t.ipBlock ? { cidr: t.ipBlock.cidr, except: t.ipBlock.except } : undefined,
        };
      });

      const portList: PortRule[] = (rule.ports || []).map((p: any, pi: number) => ({
        id: `port-${i}-${pi}`,
        protocol: p.protocol || 'TCP',
        port: String(p.port || ''),
      }));

      return {
        id: `eg-rule-${i}`,
        to: toList,
        ports: portList,
      };
    });

    return {
      name: metadata.name || 'custom-network-policy',
      namespace: metadata.namespace || defaultNs,
      targetAllPods,
      targetPodLabels: podLabels,
      policyTypes: {
        ingress: hasIngress,
        egress: hasEgress,
      },
      ingressRules,
      egressRules,
    };
  } catch {
    return {
      name: 'network-policy',
      namespace: defaultNs,
      targetAllPods: true,
      targetPodLabels: {},
      policyTypes: { ingress: true, egress: false },
      ingressRules: [],
      egressRules: [],
    };
  }
}

export const NetworkPolicyDesignerModal: React.FC<NetworkPolicyDesignerModalProps> = ({
  item,
  namespace,
  onClose,
  onSuccess,
}) => {
  const { theme, cmTheme } = useCurrentTheme();
  const [viewMode, setViewMode] = useState<'designer' | 'split' | 'yaml'>('split');
  const [model, setModel] = useState<NetworkPolicyModel>(() => {
    const defaultNs = namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : 'default';
    return {
      name: item?.name || 'new-network-policy',
      namespace: item?.namespace || defaultNs,
      targetAllPods: false,
      targetPodLabels: { app: 'backend' },
      policyTypes: { ingress: true, egress: true },
      ingressRules: [
        {
          id: 'in-1',
          from: [
            {
              id: 'peer-in-1',
              type: 'pod',
              podSelector: { app: 'frontend' },
            },
          ],
          ports: [{ id: 'port-1', protocol: 'TCP', port: '8080' }],
        },
      ],
      egressRules: [
        {
          id: 'eg-1',
          to: [
            {
              id: 'peer-eg-1',
              type: 'pod',
              podSelector: { role: 'db' },
            },
          ],
          ports: [{ id: 'port-2', protocol: 'TCP', port: '5432' }],
        },
      ],
    };
  });

  const [yamlCode, setYamlCode] = useState<string>(() => modelToYaml(model));
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [newLabelKey, setNewLabelKey] = useState<string>('');
  const [newLabelVal, setNewLabelVal] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // If opening existing NetworkPolicy, fetch and parse its YAML
  useEffect(() => {
    if (!item?.name) return;
    async function loadItem() {
      try {
        const text = await (window as any).electronAPI.getYaml('netpol', item?.name, item?.namespace || namespace);
        if (text) {
          const parsed = yamlToModel(text, item?.namespace || namespace);
          setModel(parsed);
          setYamlCode(text);
        }
      } catch (err: any) {
        console.error('Failed to load networkpolicy yaml', err);
      }
    }
    loadItem();
  }, [item?.name, item?.namespace, namespace]);

  // Sync Model -> YAML
  const updateModel = useCallback((updater: (prev: NetworkPolicyModel) => NetworkPolicyModel) => {
    setModel((prev) => {
      const next = updater(prev);
      const nextYaml = modelToYaml(next);
      setYamlCode(nextYaml);
      return next;
    });
  }, []);

  // Handle YAML Direct Edit
  const handleYamlChange = useCallback((val: string) => {
    setYamlCode(val);
    try {
      const nextModel = yamlToModel(val, namespace);
      setModel(nextModel);
    } catch {}
  }, [namespace]);

  const handleApplyTemplate = (tmpl: typeof TEMPLATES[0]) => {
    const nextModel = tmpl.build(model.name, model.namespace);
    setModel(nextModel);
    setYamlCode(modelToYaml(nextModel));
    setStatusMessage({ text: `Applied template: ${tmpl.name}`, type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      if (yamlCode.trim()) {
        const docs = parseAllDocuments(yamlCode);
        for (const doc of docs) {
          if (doc.errors && doc.errors.length > 0) {
            throw doc.errors[0];
          }
        }
      }
      const res = await (window as any).electronAPI.applyYaml(yamlCode, model.namespace);
      if (res.success) {
        onSuccess(res.message);
        onClose();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to apply NetworkPolicy', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyYaml = () => {
    navigator.clipboard.writeText(yamlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Add Target Pod Label
  const handleAddTargetLabel = () => {
    if (!newLabelKey.trim()) return;
    updateModel((m) => ({
      ...m,
      targetAllPods: false,
      targetPodLabels: {
        ...m.targetPodLabels,
        [newLabelKey.trim()]: newLabelVal.trim(),
      },
    }));
    setNewLabelKey('');
    setNewLabelVal('');
  };

  const handleRemoveTargetLabel = (k: string) => {
    updateModel((m) => {
      const nextLabels = { ...m.targetPodLabels };
      delete nextLabels[k];
      return {
        ...m,
        targetPodLabels: nextLabels,
      };
    });
  };

  // Ingress Rule Actions
  const handleAddIngressRule = () => {
    updateModel((m) => ({
      ...m,
      policyTypes: { ...m.policyTypes, ingress: true },
      ingressRules: [
        ...m.ingressRules,
        {
          id: `in-${Date.now()}`,
          from: [
            {
              id: `peer-${Date.now()}`,
              type: 'pod',
              podSelector: { app: 'frontend' },
            },
          ],
          ports: [{ id: `port-${Date.now()}`, protocol: 'TCP', port: '80' }],
        },
      ],
    }));
  };

  const handleRemoveIngressRule = (id: string) => {
    updateModel((m) => ({
      ...m,
      ingressRules: m.ingressRules.filter((r) => r.id !== id),
    }));
  };

  // Egress Rule Actions
  const handleAddEgressRule = () => {
    updateModel((m) => ({
      ...m,
      policyTypes: { ...m.policyTypes, egress: true },
      egressRules: [
        ...m.egressRules,
        {
          id: `eg-${Date.now()}`,
          to: [
            {
              id: `peer-${Date.now()}`,
              type: 'pod',
              podSelector: { role: 'db' },
            },
          ],
          ports: [{ id: `port-${Date.now()}`, protocol: 'TCP', port: '5432' }],
        },
      ],
    }));
  };

  const handleRemoveEgressRule = (id: string) => {
    updateModel((m) => ({
      ...m,
      egressRules: m.egressRules.filter((r) => r.id !== id),
    }));
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-in fade-in duration-150"
    >
      <div
        className="rounded-xl shadow-2xl w-[98vw] max-w-[1850px] h-[95vh] flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-color, #334155)',
          color: 'var(--text-main, #f8fafc)',
        }}
      >
        {/* Top Header */}
        <div
          className="p-3 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center border shadow-sm"
              style={{
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                color: 'var(--accent-cyan, #06b6d4)',
                borderColor: 'rgba(6, 182, 212, 0.3)',
              }}
            >
              <Workflow size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span>NetworkPolicy Graphic Designer:</span>
                  <input
                    type="text"
                    value={model.name}
                    onChange={(e) => updateModel((m) => ({ ...m, name: e.target.value }))}
                    className="font-mono text-sm px-2 py-0.5 rounded border bg-transparent font-bold"
                    style={{
                      borderColor: 'var(--border-subtle, #334155)',
                      color: 'var(--accent-cyan, #06b6d4)',
                    }}
                    placeholder="policy-name"
                  />
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono opacity-70">Project:</span>
                  <input
                    type="text"
                    value={model.namespace}
                    onChange={(e) => updateModel((m) => ({ ...m, namespace: e.target.value }))}
                    className="font-mono text-xs px-2 py-0.5 rounded border bg-transparent text-purple-300 font-bold"
                    style={{
                      borderColor: 'var(--border-subtle, #334155)',
                    }}
                    placeholder="project-name"
                  />
                </div>
              </div>
              <p className="text-[11px] font-mono opacity-60">
                Visual interactive ingress/egress policy builder • Real-time synchronized YAML • Kubernetes & OpenShift
              </p>
            </div>
          </div>

          {/* Center / Right Toolbar: View Switchers & Template Presets */}
          <div className="flex items-center gap-2">
            {/* Template Presets Selector */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400 font-mono">Template:</span>
              <select
                onChange={(e) => {
                  const tmpl = TEMPLATES.find((t) => t.name === e.target.value);
                  if (tmpl) handleApplyTemplate(tmpl);
                }}
                defaultValue=""
                className="px-2 py-1 rounded text-xs font-mono border outline-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-input, #0f172a)',
                  borderColor: 'var(--border-subtle, #334155)',
                  color: 'var(--text-main, #f8fafc)',
                }}
              >
                <option value="" disabled>
                  Choose Policy Preset...
                </option>
                {TEMPLATES.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div
              className="flex items-center p-1 rounded-lg border ml-2"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
              }}
            >
              <button
                onClick={() => setViewMode('designer')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === 'designer' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Graphic Visual Designer Canvas"
              >
                <Workflow size={13} />
                <span>Visual</span>
              </button>

              <button
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === 'split' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Split View: Visual Canvas + Live CodeMirror YAML"
              >
                <Split size={13} />
                <span>Split View</span>
              </button>

              <button
                onClick={() => setViewMode('yaml')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === 'yaml' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="YAML Code Editor"
              >
                <Code2 size={13} />
                <span>YAML</span>
              </button>
            </div>

            <button
              onClick={handleCopyYaml}
              className="p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
                color: 'var(--text-main, #f8fafc)',
              }}
              title="Copy YAML to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-white/10 transition-colors ml-1"
              title="Close window (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs flex items-center gap-2 border-b font-mono shrink-0 ${
              statusMessage.type === 'error'
                ? 'bg-rose-950/70 text-rose-300 border-rose-800'
                : 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
            }`}
          >
            {statusMessage.type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Modal Main Body */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* LEFT / MAIN: VISUAL GRAPHIC DESIGNER CANVAS */}
          {(viewMode === 'designer' || viewMode === 'split') && (
            <div
              className={`flex-1 overflow-y-auto p-4 flex flex-col gap-4 ${
                viewMode === 'split' ? 'border-r' : ''
              }`}
              style={{
                backgroundColor: 'var(--bg-main, #0b0f19)',
                borderColor: 'var(--border-color, #1e293b)',
              }}
            >
              {/* 3-Column Interactive Flow Diagram */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
                {/* COLUMN 1: INGRESS (Inbound Traffic) */}
                <div
                  className="rounded-xl border flex flex-col overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-card, #1e293b)',
                    borderColor: 'var(--border-subtle, #334155)',
                  }}
                >
                  <div
                    className="p-3 border-b flex items-center justify-between"
                    style={{
                      backgroundColor: 'rgba(6, 182, 212, 0.1)',
                      borderColor: 'var(--border-color, #1e293b)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center bg-cyan-600/20 text-cyan-400">
                        <ArrowRight size={14} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-cyan-400">Ingress (Inbound)</h3>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {model.policyTypes.ingress
                            ? `${model.ingressRules.length} allowed rule(s)`
                            : 'Policy Disabled (Allow All)'}
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={model.policyTypes.ingress}
                        onChange={(e) =>
                          updateModel((m) => ({
                            ...m,
                            policyTypes: { ...m.policyTypes, ingress: e.target.checked },
                          }))
                        }
                        className="accent-cyan-500"
                      />
                      <span className="text-[11px] text-slate-300">Isolate Ingress</span>
                    </label>
                  </div>

                  <div className="p-3 flex-1 overflow-y-auto space-y-3">
                    {model.policyTypes.ingress && model.ingressRules.length === 0 ? (
                      <div className="p-6 rounded-lg border border-dashed border-rose-800/80 bg-rose-950/20 text-center space-y-2">
                        <ShieldAlert size={24} className="mx-auto text-rose-400" />
                        <div className="text-xs font-bold text-rose-300">Drop All Inbound Traffic</div>
                        <p className="text-[11px] text-slate-400">
                          Ingress isolation is active with 0 rules. All inbound connections to target pods will be rejected.
                        </p>
                      </div>
                    ) : (
                      model.ingressRules.map((rule, idx) => (
                        <div
                          key={rule.id}
                          className="p-3 rounded-lg border space-y-2 text-xs font-mono shadow-sm"
                          style={{
                            backgroundColor: 'var(--bg-input, #0f172a)',
                            borderColor: 'var(--border-subtle, #334155)',
                          }}
                        >
                          <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: 'var(--border-subtle, #334155)' }}>
                            <span className="font-bold text-cyan-300 text-[11px]">Rule #{idx + 1}</span>
                            <button
                              onClick={() => handleRemoveIngressRule(rule.id)}
                              className="text-rose-400 hover:text-rose-300 p-0.5 rounded"
                              title="Delete Ingress Rule"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {/* Sources */}
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 uppercase font-bold">From Sources:</span>
                            {rule.from.map((f) => (
                              <div key={f.id} className="p-1.5 rounded bg-slate-900/60 border border-slate-800 text-[11px]">
                                {f.type === 'ipBlock' && f.ipBlock && (
                                  <div className="flex items-center gap-1.5 text-amber-300">
                                    <Globe size={11} />
                                    <span>IPBlock: {f.ipBlock.cidr}</span>
                                  </div>
                                )}
                                {f.type === 'pod' && (
                                  <div className="flex items-center gap-1.5 text-cyan-300">
                                    <Box size={11} />
                                    <span>
                                      PodSelector:{' '}
                                      {Object.entries(f.podSelector || {})
                                        .map(([k, v]) => `${k}=${v}`)
                                        .join(', ') || 'All pods in project'}
                                    </span>
                                  </div>
                                )}
                                {f.type === 'namespace' && (
                                  <div className="flex items-center gap-1.5 text-purple-300">
                                    <Layers size={11} />
                                    <span>
                                      NamespaceSelector:{' '}
                                      {Object.entries(f.namespaceSelector || {})
                                        .map(([k, v]) => `${k}=${v}`)
                                        .join(', ') || 'All namespaces'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Allowed Ports */}
                          {rule.ports.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] text-slate-400 uppercase font-bold">Allowed Ports:</span>
                              <div className="flex flex-wrap gap-1">
                                {rule.ports.map((p) => (
                                  <span key={p.id} className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px]">
                                    {p.protocol} / {p.port}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}

                    <button
                      onClick={handleAddIngressRule}
                      className="w-full py-2 rounded-lg border border-dashed text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-white/5 transition-all text-cyan-400 border-cyan-800/80 cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add Ingress Rule</span>
                    </button>
                  </div>
                </div>

                {/* COLUMN 2: CENTER TARGET WORKLOAD (podSelector) */}
                <div
                  className="rounded-xl border flex flex-col overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-card, #1e293b)',
                    borderColor: 'var(--border-subtle, #334155)',
                  }}
                >
                  <div
                    className="p-3 border-b flex items-center justify-between"
                    style={{
                      backgroundColor: 'rgba(168, 85, 247, 0.1)',
                      borderColor: 'var(--border-color, #1e293b)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center bg-purple-600/20 text-purple-400">
                        <Box size={14} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-purple-400">Target Workload</h3>
                        <p className="text-[10px] text-slate-400 font-mono">podSelector in {model.namespace}</p>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
                      {model.targetAllPods ? 'All Pods' : 'Filtered Pods'}
                    </span>
                  </div>

                  <div className="p-3 flex-1 overflow-y-auto space-y-4">
                    {/* Target Scope Selection */}
                    <div
                      className="p-3 rounded-lg border space-y-2 font-mono text-xs"
                      style={{
                        backgroundColor: 'var(--bg-input, #0f172a)',
                        borderColor: 'var(--border-subtle, #334155)',
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="targetType"
                            checked={!model.targetAllPods}
                            onChange={() => updateModel((m) => ({ ...m, targetAllPods: false }))}
                            className="accent-purple-500"
                          />
                          <span>Specific Pod Labels</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="targetType"
                            checked={model.targetAllPods}
                            onChange={() => updateModel((m) => ({ ...m, targetAllPods: true }))}
                            className="accent-purple-500"
                          />
                          <span>All Pods in Namespace</span>
                        </label>
                      </div>

                      {/* Label Tags */}
                      {!model.targetAllPods && (
                        <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle, #334155)' }}>
                          <span className="text-[10px] text-slate-400 uppercase font-bold">Target Match Labels:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(model.targetPodLabels).map(([k, v]) => (
                              <span
                                key={k}
                                className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[11px] flex items-center gap-1.5"
                              >
                                <span>{k}={v}</span>
                                <button
                                  onClick={() => handleRemoveTargetLabel(k)}
                                  className="text-purple-400 hover:text-rose-400"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>

                          {/* Add Label Row */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <input
                              type="text"
                              value={newLabelKey}
                              onChange={(e) => setNewLabelKey(e.target.value)}
                              placeholder="key (e.g. app)"
                              className="px-2 py-1 rounded text-[11px] font-mono border bg-transparent flex-1"
                              style={{ borderColor: 'var(--border-subtle, #334155)' }}
                            />
                            <span className="text-slate-400">=</span>
                            <input
                              type="text"
                              value={newLabelVal}
                              onChange={(e) => setNewLabelVal(e.target.value)}
                              placeholder="value (e.g. backend)"
                              className="px-2 py-1 rounded text-[11px] font-mono border bg-transparent flex-1"
                              style={{ borderColor: 'var(--border-subtle, #334155)' }}
                            />
                            <button
                              onClick={handleAddTargetLabel}
                              className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Visual Target Pod Centerpiece Representation */}
                    <div
                      className="p-5 rounded-xl border text-center space-y-2 shadow-inner"
                      style={{
                        backgroundColor: 'rgba(168, 85, 247, 0.06)',
                        borderColor: 'rgba(168, 85, 247, 0.3)',
                      }}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto border border-purple-500/40 shadow-lg">
                        <Shield size={24} />
                      </div>
                      <h4 className="text-sm font-bold text-purple-300 font-mono">
                        {model.targetAllPods
                          ? `All Pods in [${model.namespace}]`
                          : Object.entries(model.targetPodLabels)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(', ') || 'Select Target Labels'}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {model.policyTypes.ingress && model.policyTypes.egress
                          ? '🔒 Isolated for Inbound & Outbound'
                          : model.policyTypes.ingress
                          ? '🛡️ Isolated for Inbound (Ingress)'
                          : model.policyTypes.egress
                          ? '📡 Isolated for Outbound (Egress)'
                          : '🔓 No Isolation (Pass-through)'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* COLUMN 3: EGRESS (Outbound Traffic) */}
                <div
                  className="rounded-xl border flex flex-col overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-card, #1e293b)',
                    borderColor: 'var(--border-subtle, #334155)',
                  }}
                >
                  <div
                    className="p-3 border-b flex items-center justify-between"
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      borderColor: 'var(--border-color, #1e293b)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center bg-emerald-600/20 text-emerald-400">
                        <ArrowRight size={14} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-emerald-400">Egress (Outbound)</h3>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {model.policyTypes.egress
                            ? `${model.egressRules.length} allowed rule(s)`
                            : 'Policy Disabled (Allow All)'}
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={model.policyTypes.egress}
                        onChange={(e) =>
                          updateModel((m) => ({
                            ...m,
                            policyTypes: { ...m.policyTypes, egress: e.target.checked },
                          }))
                        }
                        className="accent-emerald-500"
                      />
                      <span className="text-[11px] text-slate-300">Isolate Egress</span>
                    </label>
                  </div>

                  <div className="p-3 flex-1 overflow-y-auto space-y-3">
                    {model.policyTypes.egress && model.egressRules.length === 0 ? (
                      <div className="p-6 rounded-lg border border-dashed border-rose-800/80 bg-rose-950/20 text-center space-y-2">
                        <ShieldAlert size={24} className="mx-auto text-rose-400" />
                        <div className="text-xs font-bold text-rose-300">Drop All Outbound Traffic</div>
                        <p className="text-[11px] text-slate-400">
                          Egress isolation is active with 0 rules. All outbound connections will be rejected.
                        </p>
                      </div>
                    ) : (
                      model.egressRules.map((rule, idx) => (
                        <div
                          key={rule.id}
                          className="p-3 rounded-lg border space-y-2 text-xs font-mono shadow-sm"
                          style={{
                            backgroundColor: 'var(--bg-input, #0f172a)',
                            borderColor: 'var(--border-subtle, #334155)',
                          }}
                        >
                          <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: 'var(--border-subtle, #334155)' }}>
                            <span className="font-bold text-emerald-300 text-[11px]">Rule #{idx + 1}</span>
                            <button
                              onClick={() => handleRemoveEgressRule(rule.id)}
                              className="text-rose-400 hover:text-rose-300 p-0.5 rounded"
                              title="Delete Egress Rule"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {/* Destinations */}
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 uppercase font-bold">To Destinations:</span>
                            {rule.to.map((t) => (
                              <div key={t.id} className="p-1.5 rounded bg-slate-900/60 border border-slate-800 text-[11px]">
                                {t.type === 'ipBlock' && t.ipBlock && (
                                  <div className="flex items-center gap-1.5 text-amber-300">
                                    <Globe size={11} />
                                    <span>IPBlock: {t.ipBlock.cidr}</span>
                                  </div>
                                )}
                                {t.type === 'pod' && (
                                  <div className="flex items-center gap-1.5 text-emerald-300">
                                    <Box size={11} />
                                    <span>
                                      PodSelector:{' '}
                                      {Object.entries(t.podSelector || {})
                                        .map(([k, v]) => `${k}=${v}`)
                                        .join(', ') || 'All pods in project'}
                                    </span>
                                  </div>
                                )}
                                {t.type === 'namespace' && (
                                  <div className="flex items-center gap-1.5 text-purple-300">
                                    <Layers size={11} />
                                    <span>
                                      NamespaceSelector:{' '}
                                      {Object.entries(t.namespaceSelector || {})
                                        .map(([k, v]) => `${k}=${v}`)
                                        .join(', ') || 'All namespaces'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Allowed Ports */}
                          {rule.ports.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] text-slate-400 uppercase font-bold">Allowed Ports:</span>
                              <div className="flex flex-wrap gap-1">
                                {rule.ports.map((p) => (
                                  <span key={p.id} className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">
                                    {p.protocol} / {p.port}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}

                    <button
                      onClick={handleAddEgressRule}
                      className="w-full py-2 rounded-lg border border-dashed text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-white/5 transition-all text-emerald-400 border-emerald-800/80 cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add Egress Rule</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT / SECONDARY: CODEMIRROR LIVE SYNCHRONIZED YAML EDITOR */}
          {(viewMode === 'yaml' || viewMode === 'split') && (
            <div
              className={`flex flex-col min-h-0 ${
                viewMode === 'split' ? 'w-[480px] xl:w-[580px]' : 'flex-1'
              }`}
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
              }}
            >
              <div
                className="p-2.5 border-b flex items-center justify-between text-xs font-mono"
                style={{
                  backgroundColor: 'var(--bg-card-header, #0f172a)',
                  borderColor: 'var(--border-color, #1e293b)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Code2 size={14} className="text-cyan-400" />
                  <span className="font-bold">Live Synchronized NetworkPolicy YAML</span>
                </div>
                <span className="text-[10px] text-emerald-400">● Valid</span>
              </div>

              <div className="flex-1 min-h-0 h-full w-full overflow-hidden flex flex-col">
                <CodeMirror
                  value={yamlCode}
                  height="100%"
                  className="h-full flex-1 w-full"
                  theme={cmTheme}
                  extensions={[yaml()]}
                  onChange={handleYamlChange}
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    syntaxHighlighting: true,
                    bracketMatching: true,
                    foldGutter: true,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Single Bottom Save & Apply Button */}
        <div
          className="p-3 border-t flex items-center justify-between text-[11px] shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
            color: 'var(--text-muted, #94a3b8)',
          }}
        >
          <div className="flex items-center gap-3">
            <span>
              Targeting Project: <strong className="font-mono text-cyan-300">{model.namespace}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
                color: 'var(--text-main, #f8fafc)',
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950/60 disabled:opacity-40 cursor-pointer transition-all"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              <span>Save & Apply NetworkPolicy</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
