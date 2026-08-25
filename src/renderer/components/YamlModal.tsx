import React, { useState, useEffect } from "react";
import { X, Code2, FileText, Copy, Check, RefreshCw, Edit3 } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { ResourceItem } from "../../types/k8s.js";
import { useCurrentTheme } from "../utils/themes.js";

interface YamlModalProps {
  mode: "yaml" | "describe";
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onEdit?: () => void;
}

export const YamlModal: React.FC<YamlModalProps> = ({ mode, item, namespace, onClose, onEdit }) => {
  const { theme, cmTheme } = useCurrentTheme();
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let text = "";
        let cmdKind: string = item.kind;
        if (cmdKind === "deploymentconfigs") cmdKind = "dc";
        if (cmdKind === "imagestreams") cmdKind = "is";
        if (cmdKind === "statefulsets") cmdKind = "sts";
        if (cmdKind === "daemonsets") cmdKind = "ds";
        if (cmdKind === "configmaps") cmdKind = "cm";
        if (cmdKind === "events") cmdKind = "event";

        if (mode === "yaml") {
          text = await (window as any).electronAPI.getYaml(cmdKind, item.name, namespace);
        } else {
          text = await (window as any).electronAPI.describeResource(cmdKind, item.name, namespace);
        }
        setContent(text);
      } catch (err: any) {
        setContent(`Error loading resource data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [mode, item, namespace]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-in fade-in duration-150"
    >
      <div
        className="rounded-xl shadow-2xl w-[96vw] max-w-[1750px] h-[94vh] flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: "var(--bg-card, #1e293b)",
          borderColor: "var(--border-color, #334155)",
          color: "var(--text-main, #f8fafc)",
        }}
      >
        {/* Header */}
        <div
          className="p-3 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: "var(--bg-card-header, #0f172a)",
            borderColor: "var(--border-color, #334155)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{
                backgroundColor: "var(--bg-input, #0f172a)",
                borderColor: "var(--border-subtle, #334155)",
                color: "var(--accent-cyan, #06b6d4)",
              }}
            >
              {mode === "yaml" ? <Code2 size={16} /> : <FileText size={16} />}
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                {mode === "yaml" ? "YAML Definition" : "Resource Description"}:{" "}
                <span className="font-mono font-bold" style={{ color: "var(--accent-cyan, #06b6d4)" }}>
                  {item.name}
                </span>
              </h2>
              <p className="text-[11px] font-mono" style={{ color: "var(--text-muted, #94a3b8)" }}>
                Kind: {item.kind} • Project: {namespace} • Theme: {theme.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct Edit YAML Button in YAML View */}
            {mode === "yaml" && onEdit && item.kind !== "nodes" && item.kind !== "events" && (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-all cursor-pointer"
                title="Open interactive in-app editor"
              >
                <Edit3 size={13} />
                <span>Edit YAML</span>
              </button>
            )}

            <button
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              style={{
                backgroundColor: "var(--bg-input, #0f172a)",
                borderColor: "var(--border-subtle, #334155)",
                color: "var(--text-main, #f8fafc)",
              }}
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-white/10 transition-colors"
              title="Close window (Esc)"
              aria-label="Close window"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Syntax Highlighted Content Box (Fills Full Height & Width) */}
        <div
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
          style={{ backgroundColor: "var(--bg-input, #0f172a)" }}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center gap-2" style={{ color: "var(--text-muted, #94a3b8)" }}>
              <RefreshCw size={18} className="animate-spin" style={{ color: "var(--accent-cyan, #06b6d4)" }} />
              <span className="text-xs">Loading details...</span>
            </div>
          ) : (
            <div className="flex-1 min-h-0 h-full w-full overflow-hidden flex flex-col">
              <CodeMirror
                value={content}
                height="100%"
                className="h-full flex-1 w-full"
                theme={cmTheme}
                extensions={mode === "yaml" ? [yaml()] : []}
                editable={false}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  foldGutter: true,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
