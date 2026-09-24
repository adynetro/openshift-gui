import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X,
  Search,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Layers,
  Box,
  Database,
  Globe,
  Braces,
  List,
  Hash,
  Type,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Check,
  XCircle,
  Save,
  ArrowLeft,
  Copy,
  FileCode2,
  Server,
  FolderOpen,
  Minus,
  Plus,
  Trash2,
  Maximize2,
  Minimize2,
  Filter,
  Sparkles,
  Boxes,
  Sliders,
  ExternalLink,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ApiGroup {
  name: string;
  preferredVersion: string;
  versions: string[];
}

export interface ApiResourceType {
  name: string; // plural name
  singularName: string;
  kind: string;
  namespaced: boolean;
  verbs: string[];
  shortNames?: string[];
  group: string;
  version: string;
  isCrd?: boolean;
}

export interface ApiExplorerModalProps {
  namespace: string;
  onClose: () => void;
  onEditYaml?: (item: any) => void;
  initialGroup?: string;
  initialKind?: string;
  initialName?: string;
}

type GroupFilterMode = 'all' | 'crd' | 'builtin';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getValueType(val: any): 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' {
  if (val === null || val === undefined) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val as any;
}

function getValueAtPath(obj: any, path: string): any {
  if (!path) return obj;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = parseInt(part, 10);
      current = current[idx];
    } else {
      current = current[part];
    }
  }
  return current;
}

function setValueAtPath(obj: any, path: string, value: any): any {
  const clone = JSON.parse(JSON.stringify(obj));
  const parts = path.split('.');
  let current = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (Array.isArray(current)) {
      current = current[parseInt(part, 10)];
    } else {
      current = current[part];
    }
  }
  const lastPart = parts[parts.length - 1];
  if (Array.isArray(current)) {
    current[parseInt(lastPart, 10)] = value;
  } else {
    current[lastPart] = value;
  }
  return clone;
}

function deleteValueAtPath(obj: any, path: string): any {
  const clone = JSON.parse(JSON.stringify(obj));
  const parts = path.split('.');
  let current = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (Array.isArray(current)) {
      current = current[parseInt(part, 10)];
    } else {
      current = current[part];
    }
  }
  const lastPart = parts[parts.length - 1];
  if (Array.isArray(current)) {
    const idx = parseInt(lastPart, 10);
    current.splice(idx, 1);
  } else {
    delete current[lastPart];
  }
  return clone;
}

function formatAge(timestamp: string): string {
  if (!timestamp) return '-';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 0) return 'future';
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
}

function getStatusInfo(obj: any): { status: string; color: string } {
  const phase = obj?.status?.phase || obj?.status?.state;
  const condReady = obj?.status?.conditions?.find?.((c: any) => c.type === 'Ready' && c.status === 'True');
  const condAvail = obj?.status?.conditions?.find?.((c: any) => c.type === 'Available' && c.status === 'True');
  const anyTrue = obj?.status?.conditions?.find?.((c: any) => c.status === 'True');
  const status = phase || condReady?.type || condAvail?.type || anyTrue?.type || 'Active';
  const st = String(status).toLowerCase();
  let color = 'emerald';
  if (st.includes('fail') || st.includes('err') || st.includes('crash') || st.includes('degraded')) {
    color = 'rose';
  } else if (st.includes('pending') || st.includes('progress') || st.includes('warn') || st.includes('creating')) {
    color = 'amber';
  } else if (st.includes('terminat') || st.includes('delet') || st.includes('unknown')) {
    color = 'slate';
  }
  return { status, color };
}

/**
 * Extracts a helpful label for an item in a list (e.g. containers[0] -> "frontend")
 */
function getArrayItemLabel(item: any, index: number): string {
  if (item === null || item === undefined) return `[${index}]`;
  if (typeof item !== 'object') return `[${index}] ${String(item).slice(0, 24)}`;
  if (item.name) return `[${index}] ${item.name}`;
  if (item.key) return `[${index}] ${item.key}`;
  if (item.type) return `[${index}] ${item.type}`;
  if (item.containerPort) return `[${index}] port ${item.containerPort}`;
  if (item.mountPath) return `[${index}] ${item.mountPath}`;
  if (item.fieldPath) return `[${index}] ${item.fieldPath}`;
  if (item.ip) return `[${index}] ${item.ip}`;
  if (item.host) return `[${index}] ${item.host}`;
  return `[${index}]`;
}

// ─── Component: ObjectTreeNode ───────────────────────────────────────────────

interface ObjectTreeProps {
  data: any;
  path: string;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  editingPath: string | null;
  editingValue: string;
  onStartEdit: (path: string, value: any) => void;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteNode: (path: string) => void;
  onAddArrayItem: (arrayPath: string) => void;
  onAddObjectField: (objectPath: string) => void;
  onFocusPath: (path: string) => void;
  depth?: number;
  parentKey?: string;
  filterText?: string;
}

const ObjectTreeNode: React.FC<ObjectTreeProps> = ({
  data,
  path,
  expandedPaths,
  toggleExpand,
  editingPath,
  editingValue,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onDeleteNode,
  onAddArrayItem,
  onAddObjectField,
  onFocusPath,
  depth = 0,
  parentKey,
  filterText = '',
}) => {
  const type = getValueType(data);
  const isExpanded = expandedPaths.has(path);
  const isEditing = editingPath === path;
  const indent = depth * 14;

  // Filter check: If user typed in filter, match against path or primitive value
  const matchesFilter = useMemo(() => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    if (parentKey && parentKey.toLowerCase().includes(q)) return true;
    if (path.toLowerCase().includes(q)) return true;
    if (type !== 'object' && type !== 'array' && String(data).toLowerCase().includes(q)) return true;
    return false;
  }, [filterText, parentKey, path, type, data]);

  if (!matchesFilter && type !== 'object' && type !== 'array') {
    return null;
  }

  // ── Null Value ──
  if (type === 'null') {
    return (
      <div className="flex items-center gap-1.5 py-0.5 group hover:bg-[#3e3d32]/30 rounded px-1 transition-colors" style={{ paddingLeft: indent }}>
        {parentKey && <span className="text-[#66d9ef] text-xs font-mono select-text">{parentKey}:</span>}
        <span className="text-[var(--text-muted,#94a3b8)] text-xs font-mono italic">null</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all ml-1">
          <button
            onClick={() => onStartEdit(path, 'null')}
            className="p-0.5 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[#66d9ef]"
            title="Edit value"
          >
            <Pencil size={10} />
          </button>
          {path && (
            <button
              onClick={() => onDeleteNode(path)}
              className="p-0.5 rounded hover:bg-rose-900/40 text-[var(--text-muted,#94a3b8)] hover:text-rose-400"
              title="Delete field"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Object Node ──
  if (type === 'object') {
    const keys = Object.keys(data);
    return (
      <div>
        <div
          className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-[#3e3d32]/40 rounded px-1 group transition-colors"
          style={{ paddingLeft: indent }}
          onClick={() => toggleExpand(path)}
        >
          {isExpanded ? (
            <ChevronDown size={12} className="text-[var(--text-muted,#94a3b8)] shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-[var(--text-muted,#94a3b8)] shrink-0" />
          )}
          {parentKey && <span className="text-[#66d9ef] text-xs font-mono select-text font-bold">{parentKey}:</span>}
          <Braces size={11} className="text-[#fd971f] shrink-0" />
          <span className="text-[var(--text-muted,#94a3b8)] text-[10px] font-mono">
            {keys.length} {keys.length === 1 ? 'field' : 'fields'}
          </span>

          {/* Quick action buttons on object */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2 transition-all" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onFocusPath(path)}
              className="p-0.5 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[#66d9ef]"
              title="Focus / Zoom into this object"
            >
              <Maximize2 size={10} />
            </button>
            <button
              onClick={() => onAddObjectField(path)}
              className="p-0.5 rounded hover:bg-emerald-950/60 text-[var(--text-muted,#94a3b8)] hover:text-emerald-400"
              title="Add field to object"
            >
              <Plus size={11} />
            </button>
            {path && (
              <button
                onClick={() => onDeleteNode(path)}
                className="p-0.5 rounded hover:bg-rose-900/40 text-[var(--text-muted,#94a3b8)] hover:text-rose-400"
                title="Delete object"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>

        {isExpanded &&
          keys.map((key) => (
            <ObjectTreeNode
              key={key}
              data={data[key]}
              path={path ? `${path}.${key}` : key}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              editingPath={editingPath}
              editingValue={editingValue}
              onStartEdit={onStartEdit}
              onEditChange={onEditChange}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDeleteNode={onDeleteNode}
              onAddArrayItem={onAddArrayItem}
              onAddObjectField={onAddObjectField}
              onFocusPath={onFocusPath}
              depth={depth + 1}
              parentKey={key}
              filterText={filterText}
            />
          ))}
      </div>
    );
  }

  // ── Array / List Node (Deep List Explorer) ──
  if (type === 'array') {
    const arr = data as any[];
    return (
      <div>
        <div
          className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-[#3e3d32]/40 rounded px-1 group transition-colors"
          style={{ paddingLeft: indent }}
          onClick={() => toggleExpand(path)}
        >
          {isExpanded ? (
            <ChevronDown size={12} className="text-[var(--text-muted,#94a3b8)] shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-[var(--text-muted,#94a3b8)] shrink-0" />
          )}
          {parentKey && <span className="text-[#66d9ef] text-xs font-mono select-text font-bold">{parentKey}:</span>}
          <List size={11} className="text-[#ae81ff] shrink-0" />
          <span className="text-[#ae81ff] text-[10px] font-mono font-semibold">
            [{arr.length} {arr.length === 1 ? 'item' : 'items'}]
          </span>

          {/* Quick list action buttons */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2 transition-all" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onFocusPath(path)}
              className="p-0.5 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[#66d9ef]"
              title="Focus / Zoom into this list"
            >
              <Maximize2 size={10} />
            </button>
            <button
              onClick={() => onAddArrayItem(path)}
              className="p-0.5 rounded hover:bg-emerald-950/60 text-[var(--text-muted,#94a3b8)] hover:text-emerald-400"
              title="Add item to list"
            >
              <Plus size={11} />
            </button>
            {path && (
              <button
                onClick={() => onDeleteNode(path)}
                className="p-0.5 rounded hover:bg-rose-900/40 text-[var(--text-muted,#94a3b8)] hover:text-rose-400"
                title="Delete list"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>

        {isExpanded &&
          arr.map((item, idx) => {
            const itemKey = getArrayItemLabel(item, idx);
            const itemPath = `${path}.${idx}`;
            return (
              <div key={idx} className="relative group/item">
                <ObjectTreeNode
                  data={item}
                  path={itemPath}
                  expandedPaths={expandedPaths}
                  toggleExpand={toggleExpand}
                  editingPath={editingPath}
                  editingValue={editingValue}
                  onStartEdit={onStartEdit}
                  onEditChange={onEditChange}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  onDeleteNode={onDeleteNode}
                  onAddArrayItem={onAddArrayItem}
                  onAddObjectField={onAddObjectField}
                  onFocusPath={onFocusPath}
                  depth={depth + 1}
                  parentKey={itemKey}
                  filterText={filterText}
                />
              </div>
            );
          })}
      </div>
    );
  }

  // ── Primitive Node (String, Number, Boolean) ──
  const valueColorClass =
    type === 'string'
      ? 'text-[#a6e22e]'
      : type === 'number'
      ? 'text-[#ae81ff]'
      : 'text-[#fd971f]';

  const typeIcon =
    type === 'string' ? (
      <Type size={10} className="text-[#a6e22e] shrink-0" />
    ) : type === 'number' ? (
      <Hash size={10} className="text-[#ae81ff] shrink-0" />
    ) : (
      <ToggleLeft size={10} className="text-[#fd971f] shrink-0" />
    );

  const displayValue = type === 'string' ? `"${data}"` : String(data);

  return (
    <div
      className="flex items-center gap-1.5 py-0.5 group hover:bg-[#3e3d32]/30 rounded px-1 transition-colors"
      style={{ paddingLeft: indent }}
      onDoubleClick={() => onStartEdit(path, data)}
    >
      {typeIcon}
      {parentKey && <span className="text-[#66d9ef] text-xs font-mono select-text">{parentKey}:</span>}

      {isEditing ? (
        <div className="flex items-center gap-1 flex-1">
          <input
            type="text"
            value={editingValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="flex-1 bg-[var(--bg-input,#0f172a)] border border-[#66d9ef] rounded px-1.5 py-0.5 text-xs font-mono text-[var(--text-main,#f8fafc)] focus:outline-none max-w-[450px]"
            autoFocus
          />
          <button onClick={onSaveEdit} className="p-0.5 rounded hover:bg-emerald-900/40 text-emerald-400" title="Save (Enter)">
            <Check size={12} />
          </button>
          <button onClick={onCancelEdit} className="p-0.5 rounded hover:bg-rose-900/40 text-rose-400" title="Cancel (Esc)">
            <XCircle size={12} />
          </button>
        </div>
      ) : (
        <>
          <span
            className={`text-xs font-mono ${valueColorClass} truncate max-w-[550px] select-text cursor-pointer`}
            title={`${String(data)} (Double-click to edit)`}
            onClick={() => {
              if (type === 'boolean') {
                // Quick toggle for booleans on single click
                onStartEdit(path, !data);
              }
            }}
          >
            {displayValue}
          </span>

          {type === 'boolean' && (
            <button
              onClick={() => onStartEdit(path, !data)}
              className="p-0.5 text-[var(--text-muted,#94a3b8)] hover:text-[#fd971f]"
              title="Toggle boolean"
            >
              {data ? <ToggleRight size={13} className="text-[#a6e22e]" /> : <ToggleLeft size={13} className="text-[var(--text-muted,#94a3b8)]" />}
            </button>
          )}

          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all ml-1">
            <button
              onClick={() => onStartEdit(path, data)}
              className="p-0.5 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[#66d9ef]"
              title="Edit value"
            >
              <Pencil size={10} />
            </button>
            {path && (
              <button
                onClick={() => onDeleteNode(path)}
                className="p-0.5 rounded hover:bg-rose-900/40 text-[var(--text-muted,#94a3b8)] hover:text-rose-400"
                title="Delete field"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const ApiExplorerModal: React.FC<ApiExplorerModalProps> = ({
  namespace,
  onClose,
  onEditYaml,
  initialGroup,
  initialKind,
  initialName,
}) => {
  // ── API Groups & Resources State ──
  const [apiGroups, setApiGroups] = useState<ApiGroup[]>([]);
  const [groupResources, setGroupResources] = useState<Map<string, ApiResourceType[]>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingResources, setLoadingResources] = useState<string | null>(null);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupFilterMode, setGroupFilterMode] = useState<GroupFilterMode>('all');

  // ── Selected Resource Type ──
  const [selectedResource, setSelectedResource] = useState<ApiResourceType | null>(null);

  // ── Instance List State ──
  const [instances, setInstances] = useState<any[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [instanceSearchQuery, setInstanceSearchQuery] = useState('');

  // ── Object Drilldown State ──
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['metadata', 'spec', 'status']));
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingPatches, setPendingPatches] = useState<Map<string, any>>(new Map());
  const [treeFilterText, setTreeFilterText] = useState('');
  const [focusPath, setFocusPath] = useState<string>(''); // For zooming into lists or nested objects

  // ── Notifications ──
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const instanceListRef = useRef<HTMLDivElement>(null);

  // ── Toast Helper ──
  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast((c) => (c?.text === text ? null : c)), 3500);
  }, []);

  // ── Load API Groups ──
  const loadApiGroups = useCallback(async () => {
    setLoadingGroups(true);
    setError(null);
    try {
      const res = await (window as any).electronAPI.getApiGroups();
      if (res.error) {
        setError(res.error);
      } else {
        setApiGroups(res.groups || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load API groups');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    loadApiGroups();
  }, [loadApiGroups]);

  // ── Load Resources for a Group ──
  const loadGroupResources = useCallback(
    async (group: ApiGroup): Promise<ApiResourceType[]> => {
      const key = group.name || 'core';
      if (groupResources.has(key)) return groupResources.get(key)!;
      setLoadingResources(key);
      try {
        const res = await (window as any).electronAPI.getApiGroupResources(group.name, group.preferredVersion);
        if (res.resources) {
          setGroupResources((prev) => new Map(prev).set(key, res.resources));
          return res.resources;
        }
      } catch {
        // Silently fail for inaccessible groups
      } finally {
        setLoadingResources(null);
      }
      return [];
    },
    [groupResources]
  );

  // ── Toggle Group Expand ──
  const toggleGroup = useCallback(
    (group: ApiGroup) => {
      const key = group.name || 'core';
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
          loadGroupResources(group);
        }
        return next;
      });
    },
    [loadGroupResources]
  );

  // ── Select Resource Type → Load Instances ──
  const selectResourceType = useCallback(
    async (rt: ApiResourceType) => {
      setSelectedResource(rt);
      setSelectedInstance(null);
      setInstances([]);
      setInstanceSearchQuery('');
      setFocusPath('');
      setLoadingInstances(true);
      setError(null);
      try {
        const res = await (window as any).electronAPI.listApiExplorerInstances(
          rt.group,
          rt.version,
          rt.name,
          rt.namespaced,
          namespace
        );
        if (res.error) {
          setError(res.error);
        } else {
          setInstances(res.items || []);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load instances');
      } finally {
        setLoadingInstances(false);
      }
    },
    [namespace]
  );

  // ── Refresh Instances ──
  const refreshInstances = useCallback(async () => {
    if (!selectedResource) return;
    await selectResourceType(selectedResource);
  }, [selectedResource, selectResourceType]);

  // ── Select an Instance for Drilldown ──
  const selectInstance = useCallback(
    async (item: any) => {
      const name = item.metadata?.name;
      const ns = item.metadata?.namespace;
      if (!selectedResource || !name) return;
      setLoadingInstances(true);
      setFocusPath('');
      try {
        const res = await (window as any).electronAPI.getApiExplorerResource(
          selectedResource.group,
          selectedResource.version,
          selectedResource.name,
          name,
          selectedResource.namespaced,
          ns || namespace
        );
        if (res.data) {
          setSelectedInstance(res.data);
          
          // Auto-expand all infos when opening as requested by user
          const allPaths = new Set<string>();
          const walk = (obj: any, prefix: string) => {
            if (obj && typeof obj === 'object') {
              if (prefix) allPaths.add(prefix);
              if (Array.isArray(obj)) {
                obj.forEach((child, idx) => walk(child, prefix ? `${prefix}.${idx}` : `${idx}`));
              } else {
                Object.keys(obj).forEach((k) => walk(obj[k], prefix ? `${prefix}.${k}` : k));
              }
            }
          };
          walk(res.data, '');
          setExpandedPaths(allPaths);
          setPendingPatches(new Map());
        } else if (res.error) {
          setError(res.error);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load resource');
      } finally {
        setLoadingInstances(false);
      }
    },
    [selectedResource, namespace]
  );

  // ── Delete Resource (CRDs and any API resources) ──
  const handleDeleteResource = useCallback(
    async (item: any) => {
      const name = item?.metadata?.name;
      const rawNs = item?.metadata?.namespace;
      const targetNs = rawNs && rawNs !== 'all-projects' && rawNs !== 'cluster'
        ? rawNs
        : (selectedResource?.namespaced && namespace && namespace !== 'all-projects' ? namespace : '');

      if (!selectedResource || !name) return;

      const confirmed = window.confirm(
        `Are you sure you want to delete ${selectedResource.kind} '${name}'${targetNs ? ` in namespace '${targetNs}'` : ''}?`
      );
      if (!confirmed) return;

      try {
        const res = await (window as any).electronAPI.deleteApiExplorerResource(
          selectedResource.group,
          selectedResource.version,
          selectedResource.name,
          name,
          selectedResource.namespaced,
          targetNs
        );

        if (res.success) {
          showToast(`Deleted ${selectedResource.kind}/${name}`);
          if (selectedInstance?.metadata?.name === name) {
            setSelectedInstance(null);
            setPendingPatches(new Map());
          }
          refreshInstances();
        } else {
          showToast(res.message || 'Failed to delete resource', 'error');
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to delete resource', 'error');
      }
    },
    [selectedResource, namespace, selectedInstance, refreshInstances, showToast]
  );

  // ── Handle Initial Selection (e.g. from CRD view or query) ──
  useEffect(() => {
    if (!initialKind && !initialGroup) return;
    async function selectInitial() {
      if (apiGroups.length === 0) return;
      for (const g of apiGroups) {
        if (!initialGroup || g.name === initialGroup || (initialGroup === 'core' && !g.name)) {
          const resList = await loadGroupResources(g);
          const found = resList.find(
            (r) =>
              r.kind.toLowerCase() === (initialKind || '').toLowerCase() ||
              r.name.toLowerCase() === (initialKind || '').toLowerCase()
          );
          if (found) {
            setExpandedGroups((prev) => new Set(prev).add(g.name || 'core'));
            selectResourceType(found);
            break;
          }
        }
      }
    }
    selectInitial();
  }, [apiGroups, initialGroup, initialKind, loadGroupResources, selectResourceType]);

  // ── Object Tree: Toggle Expand ──
  const toggleExpandPath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // ── Inline Edit: Start/Change/Save/Cancel ──
  const handleStartEdit = useCallback((path: string, value: any) => {
    setEditingPath(path);
    setEditingValue(value === null ? 'null' : String(value));
  }, []);

  const handleEditChange = useCallback((value: string) => {
    setEditingValue(value);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingPath === null || !selectedInstance) return;
    const oldVal = getValueAtPath(selectedInstance, editingPath);
    let newVal: any = editingValue;

    // Type coercion based on original type
    if (editingValue === 'null') {
      newVal = null;
    } else if (editingValue === 'true') {
      newVal = true;
    } else if (editingValue === 'false') {
      newVal = false;
    } else if (typeof oldVal === 'number' && !isNaN(Number(editingValue))) {
      newVal = Number(editingValue);
    }

    const updated = setValueAtPath(selectedInstance, editingPath, newVal);
    setSelectedInstance(updated);
    setPendingPatches((prev) => {
      const next = new Map(prev);
      next.set(editingPath, newVal);
      return next;
    });
    setEditingPath(null);
    setEditingValue('');
  }, [editingPath, editingValue, selectedInstance]);

  const handleCancelEdit = useCallback(() => {
    setEditingPath(null);
    setEditingValue('');
  }, []);

  // ── Delete Node / Array Element ──
  const handleDeleteNode = useCallback(
    (path: string) => {
      if (!selectedInstance || !path) return;
      const updated = deleteValueAtPath(selectedInstance, path);
      setSelectedInstance(updated);
      setPendingPatches((prev) => {
        const next = new Map(prev);
        next.set(path, '__DELETED__');
        return next;
      });
      showToast(`Removed field ${path}`);
    },
    [selectedInstance, showToast]
  );

  // ── Add Item to Array (Deep List Management) ──
  const handleAddArrayItem = useCallback(
    (arrayPath: string) => {
      if (!selectedInstance) return;
      const currentArray = getValueAtPath(selectedInstance, arrayPath);
      if (!Array.isArray(currentArray)) return;

      let newItem: any = '';
      if (currentArray.length > 0) {
        const first = currentArray[0];
        if (first && typeof first === 'object') {
          // Clone structure with empty strings
          newItem = {};
          for (const k of Object.keys(first)) {
            newItem[k] = '';
          }
        }
      }

      const nextIdx = currentArray.length;
      const newArray = [...currentArray, newItem];
      const updated = setValueAtPath(selectedInstance, arrayPath, newArray);
      setSelectedInstance(updated);

      // Auto-expand new item
      setExpandedPaths((prev) => new Set(prev).add(arrayPath).add(`${arrayPath}.${nextIdx}`));
      setPendingPatches((prev) => new Map(prev).set(arrayPath, newArray));
      showToast(`Added item to ${arrayPath}[${nextIdx}]`);
    },
    [selectedInstance, showToast]
  );

  // ── Add Field to Object ──
  const handleAddObjectField = useCallback(
    (objectPath: string) => {
      if (!selectedInstance) return;
      const fieldName = prompt('Enter new field name:');
      if (!fieldName || !fieldName.trim()) return;
      const cleanKey = fieldName.trim();
      const targetPath = objectPath ? `${objectPath}.${cleanKey}` : cleanKey;

      const updated = setValueAtPath(selectedInstance, targetPath, '');
      setSelectedInstance(updated);
      setExpandedPaths((prev) => new Set(prev).add(objectPath));
      setEditingPath(targetPath);
      setEditingValue('');
    },
    [selectedInstance]
  );

  // ── Apply Pending Patches ──
  const applyPatches = useCallback(async () => {
    if (!selectedResource || !selectedInstance || pendingPatches.size === 0) return;

    setSaving(true);
    try {
      // Build a merge-patch object from the pending changes
      const patchObj: any = {};
      for (const [path] of pendingPatches) {
        const parts = path.split('.');
        const topField = parts[0];

        // Send top-level section from selectedInstance to ensure clean array/object merge
        if (topField && selectedInstance[topField] !== undefined) {
          patchObj[topField] = selectedInstance[topField];
        }
      }

      const name = selectedInstance.metadata?.name;
      const ns = selectedInstance.metadata?.namespace;

      const res = await (window as any).electronAPI.patchApiExplorerResource(
        selectedResource.group,
        selectedResource.version,
        selectedResource.name,
        name,
        selectedResource.namespaced,
        ns || namespace,
        patchObj
      );

      if (res.success) {
        showToast(`Successfully patched ${selectedResource.kind}/${name}`);
        setPendingPatches(new Map());
        if (res.data) {
          setSelectedInstance(res.data);
        }
      } else {
        showToast(res.error || 'Patch failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to apply patch', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedResource, selectedInstance, pendingPatches, namespace, showToast]);

  // ── Expand All / Collapse All in drilldown ──
  const expandAll = useCallback(() => {
    if (!selectedInstance) return;
    const paths = new Set<string>();
    const walk = (obj: any, prefix: string) => {
      if (obj && typeof obj === 'object') {
        if (prefix) paths.add(prefix);
        if (Array.isArray(obj)) {
          obj.forEach((item, idx) => walk(item, prefix ? `${prefix}.${idx}` : `${idx}`));
        } else {
          Object.keys(obj).forEach((key) => walk(obj[key], prefix ? `${prefix}.${key}` : key));
        }
      }
    };
    walk(selectedInstance, '');
    setExpandedPaths(paths);
  }, [selectedInstance]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  // ── Copy JSON of selected instance ──
  const copyJson = useCallback(() => {
    if (selectedInstance) {
      navigator.clipboard.writeText(JSON.stringify(selectedInstance, null, 2));
      showToast('JSON copied to clipboard');
    }
  }, [selectedInstance, showToast]);

  // ── Filtered Groups (with CRD vs Builtin toggle) ──
  const filteredGroups = useMemo(() => {
    return apiGroups.filter((g) => {
      const gName = g.name || 'core (v1)';
      const isCrdGroup = g.name.includes('.') || g.name === 'apiextensions.k8s.io';

      // Mode filter
      if (groupFilterMode === 'crd' && !isCrdGroup && g.name !== '') return false;
      if (groupFilterMode === 'builtin' && isCrdGroup) return false;

      // Search query filter
      if (!groupSearchQuery.trim()) return true;
      const q = groupSearchQuery.toLowerCase();
      if (gName.toLowerCase().includes(q)) return true;

      const key = g.name || 'core';
      const resources = groupResources.get(key);
      if (resources) {
        return resources.some(
          (r) =>
            r.kind.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            (r.shortNames && r.shortNames.some((s) => s.toLowerCase().includes(q)))
        );
      }
      return false;
    });
  }, [apiGroups, groupSearchQuery, groupFilterMode, groupResources]);

  // ── Filtered Instances ──
  const filteredInstances = useMemo(() => {
    if (!instanceSearchQuery.trim()) return instances;
    const q = instanceSearchQuery.toLowerCase();
    return instances.filter((item) => {
      const name = item.metadata?.name || '';
      const ns = item.metadata?.namespace || '';
      return name.toLowerCase().includes(q) || ns.toLowerCase().includes(q);
    });
  }, [instances, instanceSearchQuery]);

  // ── Breadcrumbs computation ──
  const breadcrumbs = useMemo(() => {
    if (!focusPath) return [{ label: 'root', path: '' }];
    const parts = focusPath.split('.');
    const trail = [{ label: 'root', path: '' }];
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}.${part}` : part;
      trail.push({ label: part, path: acc });
    }
    return trail;
  }, [focusPath]);

  // ── Active Node to Display in Drilldown ──
  const activeDrilldownData = useMemo(() => {
    if (!selectedInstance) return null;
    if (!focusPath) return selectedInstance;
    return getValueAtPath(selectedInstance, focusPath);
  }, [selectedInstance, focusPath]);

  // ── Keyboard: Esc to close / go back ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (editingPath) {
          handleCancelEdit();
        } else if (focusPath) {
          // Go up one level in focus
          const parts = focusPath.split('.');
          parts.pop();
          setFocusPath(parts.join('.'));
        } else if (selectedInstance) {
          setSelectedInstance(null);
          setPendingPatches(new Map());
        } else if (selectedResource) {
          setSelectedResource(null);
          setInstances([]);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedInstance, selectedResource, editingPath, focusPath, handleCancelEdit]);

  // ── Render: Left Panel (API Groups Tree) ──
  const renderGroupTree = () => (
    <div className="w-[300px] shrink-0 border-r border-[var(--border-subtle,#334155)] flex flex-col overflow-hidden bg-[var(--bg-card-header,#0f172a)]">
      {/* Top Filter Tabs: All, CRDs, Builtin */}
      <div className="p-2 border-b border-[var(--border-subtle,#334155)] flex items-center gap-1">
        <button
          onClick={() => setGroupFilterMode('all')}
          className={`flex-1 py-1 text-[10px] font-mono rounded font-semibold transition-colors ${
            groupFilterMode === 'all'
              ? 'bg-[#3e3d32] text-white border border-[#49483e]'
              : 'text-[var(--text-muted,#94a3b8)] hover:text-white'
          }`}
        >
          All ({apiGroups.length})
        </button>
        <button
          onClick={() => setGroupFilterMode('crd')}
          className={`flex-1 py-1 text-[10px] font-mono rounded font-semibold transition-colors flex items-center justify-center gap-1 ${
            groupFilterMode === 'crd'
              ? 'bg-purple-950 text-purple-200 border border-purple-800'
              : 'text-[var(--text-muted,#94a3b8)] hover:text-purple-300'
          }`}
        >
          <Boxes size={10} />
          CRDs
        </button>
        <button
          onClick={() => setGroupFilterMode('builtin')}
          className={`flex-1 py-1 text-[10px] font-mono rounded font-semibold transition-colors ${
            groupFilterMode === 'builtin'
              ? 'bg-cyan-950 text-cyan-200 border border-cyan-800'
              : 'text-[var(--text-muted,#94a3b8)] hover:text-cyan-300'
          }`}
        >
          Core K8s
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-2 border-b border-[var(--border-subtle,#334155)]">
        <div className="relative">
          <Search className="absolute left-2 top-1.5 text-[var(--text-muted,#94a3b8)]" size={13} />
          <input
            type="text"
            value={groupSearchQuery}
            onChange={(e) => setGroupSearchQuery(e.target.value)}
            placeholder="Search API groups, kinds..."
            className="w-full border rounded-lg pl-7 pr-3 py-1 text-[11px] focus:outline-none font-mono"
            style={{
              backgroundColor: 'var(--bg-input, #0f172a)',
              borderColor: 'var(--border-subtle, #334155)',
              color: 'var(--text-main, #f8fafc)',
            }}
          />
        </div>
      </div>

      {/* Group & Resource Tree */}
      <div className="flex-1 overflow-y-auto">
        {loadingGroups && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <RefreshCw className="animate-spin text-[#66d9ef]" size={20} />
            <span className="text-[10px] font-mono text-[var(--text-muted,#94a3b8)]">Discovering API groups...</span>
          </div>
        )}

        {!loadingGroups &&
          filteredGroups.map((group) => {
            const key = group.name || 'core';
            const isExpanded = expandedGroups.has(key);
            const resources = groupResources.get(key) || [];
            const isLoading = loadingResources === key;
            const displayName = group.name || 'core (v1)';
            const isCore = !group.name;
            const isCrd = group.name.includes('.') || group.name === 'apiextensions.k8s.io';

            const filteredResources = groupSearchQuery.trim()
              ? resources.filter(
                  (r) =>
                    r.kind.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                    r.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                    displayName.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                    (r.shortNames && r.shortNames.some((s) => s.toLowerCase().includes(groupSearchQuery.toLowerCase())))
                )
              : resources;

            return (
              <div key={key}>
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-[#3e3d32]/40 transition-colors border-b border-[#3e3d32]/20"
                  onClick={() => toggleGroup(group)}
                >
                  {isExpanded ? (
                    <ChevronDown size={12} className="text-[var(--text-muted,#94a3b8)] shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="text-[var(--text-muted,#94a3b8)] shrink-0" />
                  )}
                  {isCore ? (
                    <Server size={12} className="text-[#a6e22e] shrink-0" />
                  ) : isCrd ? (
                    <Boxes size={12} className="text-[#ae81ff] shrink-0" />
                  ) : (
                    <FolderOpen size={12} className="text-[#fd971f] shrink-0" />
                  )}
                  <span className="text-[11px] font-mono text-[var(--text-main,#f8fafc)] truncate flex-1" title={displayName}>
                    {displayName}
                  </span>
                  {isCrd && (
                    <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-purple-950/80 border border-purple-800 text-purple-300">
                      CRD
                    </span>
                  )}
                  <span className="text-[9px] font-mono text-[var(--text-muted,#94a3b8)] px-1 py-0.5 rounded bg-[#3e3d32]/40">
                    {group.preferredVersion}
                  </span>
                </div>

                {isExpanded && (
                  <div className="bg-[#1a1a2e]/30">
                    {isLoading && (
                      <div className="flex items-center gap-2 px-6 py-2">
                        <RefreshCw className="animate-spin text-[#66d9ef]" size={11} />
                        <span className="text-[10px] font-mono text-[var(--text-muted,#94a3b8)]">Loading resources...</span>
                      </div>
                    )}
                    {!isLoading && filteredResources.length === 0 && resources.length === 0 && (
                      <div className="px-6 py-2 text-[10px] font-mono text-[var(--text-muted,#94a3b8)] italic">
                        No listable resources
                      </div>
                    )}
                    {filteredResources.map((rt) => {
                      const isSelected = selectedResource?.name === rt.name && selectedResource?.group === rt.group;
                      return (
                        <div
                          key={`${rt.group}/${rt.name}`}
                          className={`flex items-center gap-1.5 px-3 pl-6 py-1 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#66d9ef]/15 border-l-2 border-[#66d9ef]'
                              : 'hover:bg-[#3e3d32]/30 border-l-2 border-transparent'
                          }`}
                          onClick={() => selectResourceType(rt)}
                        >
                          <Box size={10} className={isSelected ? 'text-[#66d9ef]' : 'text-[var(--text-muted,#94a3b8)]'} />
                          <span
                            className={`text-[11px] font-mono truncate flex-1 ${
                              isSelected ? 'text-[#66d9ef] font-bold' : 'text-[var(--text-main,#f8fafc)]'
                            }`}
                            title={`${rt.kind} (${rt.name})`}
                          >
                            {rt.kind}
                          </span>
                          {rt.shortNames && rt.shortNames.length > 0 && (
                            <span className="text-[8px] font-mono text-[var(--text-muted,#94a3b8)] opacity-60">
                              {rt.shortNames[0]}
                            </span>
                          )}
                          <span title={rt.namespaced ? 'Namespaced resource' : 'Cluster-scoped resource'}>
                            {rt.namespaced ? (
                              <Globe size={9} className="text-cyan-500 shrink-0" />
                            ) : (
                              <Database size={9} className="text-amber-500 shrink-0" />
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Footer info */}
      <div className="p-2 border-t border-[var(--border-subtle,#334155)] text-[10px] font-mono text-[var(--text-muted,#94a3b8)] flex items-center justify-between">
        <span>{filteredGroups.length} groups</span>
        <span className="text-purple-400">CRDs included</span>
      </div>
    </div>
  );

  // ── Render: Center Panel (Instance List) ──
  const renderInstanceList = () => {
    if (!selectedResource) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-8">
          <div className="w-14 h-14 rounded-2xl bg-[#3e3d32] border border-[#49483e] flex items-center justify-center text-[#66d9ef] shadow-lg">
            <Layers size={28} />
          </div>
          <div>
            <p className="text-base font-bold text-[var(--text-main,#f8fafc)] font-mono">API Object & CRD Explorer</p>
            <p className="text-xs text-[var(--text-muted,#94a3b8)] font-mono mt-1 max-w-[420px]">
              Select any API group or Custom Resource on the left to inspect its live instances, deep-drill into lists, and inline-edit fields.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-left mt-2 max-w-[460px]">
            <div className="p-2.5 rounded-lg border border-[var(--border-subtle,#334155)] bg-[var(--bg-card-header,#0f172a)] text-[11px] font-mono">
              <span className="text-[#66d9ef] font-bold block mb-1">Explore All APIs & CRDs</span>
              <span className="text-[var(--text-muted,#94a3b8)] text-[10px]">
                Both built-in Kubernetes types (Deployments, Pods, ConfigMaps) and third-party CRDs appear side-by-side.
              </span>
            </div>
            <div className="p-2.5 rounded-lg border border-[var(--border-subtle,#334155)] bg-[var(--bg-card-header,#0f172a)] text-[11px] font-mono">
              <span className="text-[#a6e22e] font-bold block mb-1">Deep List Drilldown</span>
              <span className="text-[var(--text-muted,#94a3b8)] text-[10px]">
                Zoom into nested lists like <code>containers</code> or <code>env</code>, add/remove items, and edit inline.
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`flex flex-col overflow-hidden ${
          selectedInstance ? 'w-[330px] shrink-0 border-r border-[var(--border-subtle,#334155)]' : 'flex-1'
        }`}
      >
        {/* Resource type header */}
        <div className="p-2.5 border-b border-[var(--border-subtle,#334155)] bg-[var(--bg-card-header,#0f172a)] shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Box size={14} className="text-[#66d9ef]" />
            <span className="text-xs font-bold font-mono text-[var(--text-main,#f8fafc)]">{selectedResource.kind}</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#3e3d32] border border-[#49483e] text-[var(--text-muted,#94a3b8)] truncate max-w-[130px]" title={`${selectedResource.group || 'core'}/${selectedResource.version}`}>
              {selectedResource.group || 'core'}/{selectedResource.version}
            </span>
            {selectedResource.namespaced ? (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-950/60 border border-cyan-800 text-cyan-300">
                Namespaced
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-950/60 border border-amber-800 text-amber-300">
                Cluster
              </span>
            )}
            <button
              onClick={refreshInstances}
              className="ml-auto p-1 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[#66d9ef] transition-colors"
              title="Refresh instances"
            >
              <RefreshCw size={13} className={loadingInstances ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1.5 text-[var(--text-muted,#94a3b8)]" size={12} />
            <input
              type="text"
              value={instanceSearchQuery}
              onChange={(e) => setInstanceSearchQuery(e.target.value)}
              placeholder="Filter instances by name..."
              className="w-full border rounded pl-7 pr-3 py-1 text-[11px] focus:outline-none font-mono"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
                color: 'var(--text-main, #f8fafc)',
              }}
            />
          </div>
        </div>

        {/* Instance list */}
        <div className="flex-1 overflow-y-auto" ref={instanceListRef}>
          {loadingInstances && instances.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <RefreshCw className="animate-spin text-[#66d9ef]" size={18} />
              <span className="text-[10px] font-mono text-[var(--text-muted,#94a3b8)]">Loading instances...</span>
            </div>
          )}

          {!loadingInstances && instances.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-32 gap-2 px-4">
              <Box size={24} className="text-[#49483e]" />
              <span className="text-[10px] font-mono text-[var(--text-muted,#94a3b8)] text-center">
                No {selectedResource.kind} instances found{' '}
                {selectedResource.namespaced && namespace !== 'all-projects' ? `in '${namespace}'` : 'in cluster'}
              </span>
            </div>
          )}

          {filteredInstances.map((item) => {
            const name = item.metadata?.name || '';
            const ns = item.metadata?.namespace || '';
            const age = formatAge(item.metadata?.creationTimestamp);
            const { status, color } = getStatusInfo(item);
            const isSelected = selectedInstance?.metadata?.name === name && selectedInstance?.metadata?.namespace === ns;

            return (
              <div
                key={`${ns}/${name}`}
                className={`px-3 py-2 cursor-pointer border-b border-[#3e3d32]/30 transition-colors ${
                  isSelected
                    ? 'bg-[#66d9ef]/10 border-l-2 border-l-[#66d9ef]'
                    : 'hover:bg-[#3e3d32]/30 border-l-2 border-l-transparent'
                }`}
                onClick={() => selectInstance(item)}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 bg-${color}-400`} />
                  <span className="text-[11px] font-mono text-[var(--text-main,#f8fafc)] font-bold truncate flex-1" title={name}>
                    {name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteResource(item);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-950/80 text-[var(--text-muted,#94a3b8)] hover:text-rose-400 transition-all"
                    title={`Delete ${selectedResource.kind} ${name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-3">
                  {ns && (
                    <span className="text-[9px] font-mono text-purple-400 truncate max-w-[110px]" title={ns}>
                      {ns}
                    </span>
                  )}
                  <span className={`text-[9px] font-mono text-${color}-400`}>{status}</span>
                  <span className="text-[9px] font-mono text-[var(--text-muted,#94a3b8)] ml-auto">{age}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Instance count */}
        <div className="p-2 border-t border-[var(--border-subtle,#334155)] text-[10px] font-mono text-[var(--text-muted,#94a3b8)] shrink-0 bg-[var(--bg-card-header,#0f172a)] flex items-center justify-between">
          <span>
            {instances.length} {instances.length === 1 ? 'instance' : 'instances'}
          </span>
          {selectedResource.isCrd && <span className="text-purple-400 font-bold">Custom Resource</span>}
        </div>
      </div>
    );
  };

  // ── Render: Right Panel (Object Drilldown & Deep List Editing) ──
  const renderDrilldown = () => {
    if (!selectedInstance) return null;

    const name = selectedInstance.metadata?.name || '';
    const ns = selectedInstance.metadata?.namespace || '';
    const apiVersion = selectedInstance.apiVersion || '';
    const kind = selectedInstance.kind || '';

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-main,#020617)]">
        {/* Top Header */}
        <div className="p-2.5 border-b border-[var(--border-subtle,#334155)] bg-[var(--bg-card-header,#0f172a)] shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (focusPath) {
                  // Zoom out one step
                  const parts = focusPath.split('.');
                  parts.pop();
                  setFocusPath(parts.join('.'));
                } else {
                  setSelectedInstance(null);
                  setPendingPatches(new Map());
                }
              }}
              className="p-1 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[var(--text-main,#f8fafc)] transition-colors"
              title="Back"
            >
              <ArrowLeft size={14} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-[#66d9ef] truncate">{name}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#3e3d32] border border-[#49483e] text-[var(--text-muted,#94a3b8)]">
                  {kind}
                </span>
                {selectedResource?.isCrd && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-950/80 border border-purple-800 text-purple-300">
                    CRD
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] font-mono text-[var(--text-muted,#94a3b8)]">{apiVersion}</span>
                {ns && <span className="text-[9px] font-mono text-purple-400">{ns}</span>}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={expandAll}
                className="p-1 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[var(--text-main,#f8fafc)] transition-colors"
                title="Expand all nodes"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={collapseAll}
                className="p-1 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[var(--text-main,#f8fafc)] transition-colors"
                title="Collapse all nodes"
              >
                <Minus size={13} />
              </button>
              <button
                onClick={copyJson}
                className="p-1 rounded hover:bg-[#3e3d32] text-[var(--text-muted,#94a3b8)] hover:text-[var(--text-main,#f8fafc)] transition-colors"
                title="Copy entire JSON"
              >
                <Copy size={13} />
              </button>
              <button
                onClick={() => handleDeleteResource(selectedInstance)}
                className="p-1 rounded hover:bg-rose-950/80 text-[var(--text-muted,#94a3b8)] hover:text-rose-400 transition-colors"
                title={`Delete ${selectedResource?.kind} ${name}`}
              >
                <Trash2 size={13} />
              </button>
              {onEditYaml && (
                <button
                  onClick={() => {
                    const targetNs = ns && ns !== 'all-projects' && ns !== 'cluster'
                      ? ns
                      : (selectedResource?.namespaced && namespace && namespace !== 'all-projects' ? namespace : '');
                    const ri = {
                      id: `${targetNs || ''}/${name}`,
                      name,
                      namespace: targetNs,
                      kind: (selectedResource?.name as any) || kind.toLowerCase(),
                      status: '',
                      age: '',
                      raw: selectedInstance,
                    };
                    onEditYaml(ri);
                  }}
                  className="p-1 rounded hover:bg-[#66d9ef]/20 text-[#66d9ef] transition-colors"
                  title="Open in Full YAML Editor"
                >
                  <FileCode2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Breadcrumb Navigation Bar (Deep List Zooming) */}
          <div className="flex items-center gap-1 mt-2 pt-1 border-t border-[#3e3d32]/30 text-[10px] font-mono overflow-x-auto">
            <span className="text-[var(--text-muted,#94a3b8)] shrink-0">Path:</span>
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={b.path}>
                {i > 0 && <span className="text-[var(--text-muted,#94a3b8)] opacity-40">/</span>}
                <button
                  onClick={() => setFocusPath(b.path)}
                  className={`px-1 py-0.5 rounded hover:bg-[#3e3d32] transition-colors truncate max-w-[120px] ${
                    focusPath === b.path ? 'text-[#66d9ef] font-bold bg-[#66d9ef]/10' : 'text-slate-300'
                  }`}
                  title={`Navigate to ${b.path || 'root'}`}
                >
                  {b.label}
                </button>
              </React.Fragment>
            ))}
            {focusPath && (
              <button
                onClick={() => setFocusPath('')}
                className="ml-auto text-[9px] text-[#fd971f] hover:underline shrink-0"
                title="Reset zoom to root"
              >
                (Reset zoom)
              </button>
            )}
          </div>

          {/* Field Filter in Drilldown */}
          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1.5 text-[var(--text-muted,#94a3b8)]" size={11} />
              <input
                type="text"
                value={treeFilterText}
                onChange={(e) => setTreeFilterText(e.target.value)}
                placeholder="Filter fields in this object/list..."
                className="w-full border rounded pl-6 pr-3 py-0.5 text-[10px] focus:outline-none font-mono"
                style={{
                  backgroundColor: 'var(--bg-input, #0f172a)',
                  borderColor: 'var(--border-subtle, #334155)',
                  color: 'var(--text-main, #f8fafc)',
                }}
              />
            </div>
          </div>

          {/* Pending changes bar */}
          {pendingPatches.size > 0 && (
            <div className="flex items-center gap-2 mt-2 p-1.5 rounded bg-amber-950/50 border border-amber-800">
              <span className="text-[10px] font-mono text-amber-300">
                {pendingPatches.size} pending {pendingPatches.size === 1 ? 'change' : 'changes'}
              </span>
              <button
                onClick={applyPatches}
                disabled={saving}
                className="ml-auto flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 border border-emerald-700 text-[10px] font-mono font-bold transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                Apply Patch
              </button>
              <button
                onClick={() => {
                  setPendingPatches(new Map());
                  if (selectedResource) selectInstance(selectedInstance);
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#3e3d32] hover:bg-[#49483e] text-[var(--text-muted,#94a3b8)] border border-[#49483e] text-[10px] font-mono transition-colors"
              >
                <XCircle size={10} />
                Discard
              </button>
            </div>
          )}
        </div>

        {/* Object Tree View */}
        <div className="flex-1 overflow-y-auto p-3">
          <ObjectTreeNode
            data={activeDrilldownData}
            path={focusPath}
            expandedPaths={expandedPaths}
            toggleExpand={toggleExpandPath}
            editingPath={editingPath}
            editingValue={editingValue}
            onStartEdit={handleStartEdit}
            onEditChange={handleEditChange}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onDeleteNode={handleDeleteNode}
            onAddArrayItem={handleAddArrayItem}
            onAddObjectField={handleAddObjectField}
            onFocusPath={(path) => setFocusPath(path)}
            filterText={treeFilterText}
          />
        </div>
      </div>
    );
  };

  // ── Main Render ──
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div
        className="rounded-xl shadow-2xl w-[96vw] max-w-[1550px] h-[92vh] flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-color, #334155)',
          color: 'var(--text-main, #f8fafc)',
        }}
      >
        {/* Header */}
        <div className="p-3 bg-[var(--bg-card-header,#0f172a)] border-b border-[var(--border-subtle,#334155)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#3e3d32] flex items-center justify-center border border-[#49483e] text-[#66d9ef]">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-main,#f8fafc)] font-mono flex items-center gap-2">
                <span>API Object Explorer</span>
                <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800 text-[10px] text-purple-300 font-mono flex items-center gap-1">
                  <Boxes size={10} />
                  CRD Browser & Deep Editor
                </span>
              </h2>
              <p className="text-[10px] text-[var(--text-muted,#94a3b8)] font-mono">
                Explore all K8s/OpenShift objects and CRDs • Deep list drilldown & edit •{' '}
                {namespace === 'all-projects' ? 'All Projects' : `Project: ${namespace}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadApiGroups}
              className="p-1.5 rounded-lg text-[var(--text-muted,#94a3b8)] hover:text-[#66d9ef] hover:bg-[#3e3d32] transition-colors"
              title="Refresh all API groups"
            >
              <RefreshCw size={15} className={loadingGroups ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted,#94a3b8)] hover:text-[var(--text-main,#f8fafc)] hover:bg-[#3e3d32] transition-colors"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-3 mt-2 p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs font-mono flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-400 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="p-0.5 hover:bg-rose-900/40 rounded">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div
            className={`mx-3 mt-2 p-2 rounded-lg text-xs font-mono flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                : 'bg-rose-950/60 border border-rose-800 text-rose-200'
            }`}
          >
            {toast.type === 'success' ? <Check size={13} className="text-emerald-400" /> : <AlertTriangle size={13} className="text-rose-400" />}
            <span>{toast.text}</span>
          </div>
        )}

        {/* Three-Panel Explorer Layout */}
        <div className="flex-1 flex overflow-hidden">
          {renderGroupTree()}
          {renderInstanceList()}
          {renderDrilldown()}
        </div>

        {/* Footer */}
        <div
          className="p-2 border-t flex items-center justify-between text-[10px] font-mono shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
            color: 'var(--text-muted, #94a3b8)',
          }}
        >
          <div className="flex items-center gap-3">
            {selectedResource && (
              <span>
                {selectedResource.group || 'core'}/{selectedResource.version}/{selectedResource.name}
              </span>
            )}
            {selectedInstance && (
              <>
                <span>•</span>
                <span className="text-[#66d9ef] font-bold">{selectedInstance.metadata?.name}</span>
              </>
            )}
            {focusPath && (
              <>
                <span>•</span>
                <span className="text-amber-400 font-semibold">Focus: {focusPath}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>
              Press <strong>Esc</strong> to{' '}
              {editingPath
                ? 'cancel edit'
                : focusPath
                ? 'zoom out'
                : selectedInstance
                ? 'go back'
                : selectedResource
                ? 'deselect'
                : 'close'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
