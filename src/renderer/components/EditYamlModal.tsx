import React, { useState, useEffect, useCallback } from "react";
import { X, Save, FileCode2, RefreshCw, AlertTriangle, CheckCircle2, Copy, Check, RotateCcw, ShieldCheck } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { parseAllDocuments } from "yaml";
import { ResourceItem } from "../../types/k8s.js";
import { useCurrentTheme } from "../utils/themes.js";

interface EditYamlModalProps {
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const EditYamlModal: React.FC<EditYamlModalProps> = ({
  item,
  namespace,
  onClose,
  onSuccess,
}) => {
  const { theme, cmTheme } = useCurrentTheme();
  const [yamlText, setYamlText] = useState<string>("");
  const [originalYaml, setOriginalYaml] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let cmdKind: string = item.kind;
        if (cmdKind === "deploymentconfigs") cmdKind = "dc";
        if (cmdKind === "imagestreams") cmdKind = "is";
        if (cmdKind === "statefulsets") cmdKind = "sts";
        if (cmdKind === "daemonsets") cmdKind = "ds";
        if (cmdKind === "configmaps") cmdKind = "cm";

        const text = await (window as any).electronAPI.getYaml(cmdKind, item.name, namespace);
        setYamlText(text);
        setOriginalYaml(text);
      } catch (err: any) {
        setStatusMessage({ text: err.message || "Failed to load YAML", type: "error" });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [item, namespace]);

  const validateYamlString = (val: string) => {
    if (!val.trim()) return;
    const docs = parseAllDocuments(val);
    for (const doc of docs) {
      if (doc.errors && doc.errors.length > 0) {
        throw doc.errors[0];
      }
    }
  };

  const handleTextChange = useCallback((val: string) => {
    setYamlText(val);
    try {
      validateYamlString(val);
      setValidationError(null);
    } catch (err: any) {
      setValidationError(err.message || "YAML syntax error");
    }
  }, []);

  const handleSave = async () => {
    try {
      validateYamlString(yamlText);
    } catch (err: any) {
      setValidationError(`Invalid YAML: ${err.message}`);
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await (window as any).electronAPI.applyYaml(yamlText, namespace);
      if (res.success) {
        onSuccess(res.message);
        onClose();
      } else {
        setStatusMessage({ text: res.message, type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Failed to apply changes", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(yamlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (window.confirm("Discard all unapplied edits and reset to original YAML?")) {
      setYamlText(originalYaml);
      setValidationError(null);
    }
  };

  // Keyboard shortcut: Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!saving && !loading && !validationError) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saving, loading, validationError, yamlText]);

  const isDirty = yamlText !== originalYaml;

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
                color: "var(--accent-green, #10b981)",
              }}
            >
              <FileCode2 size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                IDE Resource Editor:{" "}
                <span className="font-mono font-bold" style={{ color: "var(--accent-cyan, #06b6d4)" }}>
                  {item.kind}/{item.name}
                </span>
                {isDirty && (
                  <span
                    className="px-2 py-0.5 rounded-full border text-[10px] font-semibold"
                    style={{
                      backgroundColor: "var(--bg-input, #0f172a)",
                      borderColor: "var(--accent-yellow, #f59e0b)",
                      color: "var(--accent-yellow, #f59e0b)",
                    }}
                  >
                    • Modified
                  </span>
                )}
                {!validationError && !loading && (
                  <span
                    className="px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1"
                    style={{
                      backgroundColor: "var(--bg-input, #0f172a)",
                      borderColor: "var(--accent-green, #10b981)",
                      color: "var(--accent-green, #10b981)",
                    }}
                  >
                    <ShieldCheck size={10} /> Valid YAML
                  </span>
                )}
              </h2>
              <p className="text-[11px] font-mono" style={{ color: "var(--text-muted, #94a3b8)" }}>
                Project: {namespace} • Theme: {theme.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-input, #0f172a)",
                  borderColor: "var(--border-subtle, #334155)",
                  color: "var(--text-main, #f8fafc)",
                }}
                title="Reset to original"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
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

        {/* Validation Error Alert */}
        {validationError && (
          <div className="px-4 py-2 bg-rose-950/70 text-rose-300 border-b border-rose-800 text-xs flex items-center gap-2 font-mono shrink-0">
            <AlertTriangle size={14} className="shrink-0 text-rose-400" />
            <span className="truncate">{validationError}</span>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs flex items-center gap-2 border-b font-mono shrink-0 ${
              statusMessage.type === "error"
                ? "bg-rose-950/70 text-rose-300 border-rose-800"
                : "bg-emerald-950/70 text-emerald-300 border-emerald-800"
            }`}
          >
            {statusMessage.type === "error" ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* CodeMirror IDE Editor (Fills Full Height & Width) */}
        <div
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
          style={{ backgroundColor: "var(--bg-input, #0f172a)" }}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center gap-2" style={{ color: "var(--text-muted, #94a3b8)" }}>
              <RefreshCw size={18} className="animate-spin" style={{ color: "var(--accent-cyan, #06b6d4)" }} />
              <span className="text-xs">Loading resource YAML...</span>
            </div>
          ) : (
            <div className="flex-1 min-h-0 h-full w-full overflow-hidden flex flex-col">
              <CodeMirror
                value={yamlText}
                height="100%"
                className="h-full flex-1 w-full"
                theme={cmTheme}
                extensions={[yaml()]}
                onChange={handleTextChange}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightSpecialChars: true,
                  history: true,
                  foldGutter: true,
                  drawSelection: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: true,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  closeBracketsKeymap: true,
                  searchKeymap: true,
                  foldKeymap: true,
                  completionKeymap: true,
                  lintKeymap: true,
                }}
              />
            </div>
          )}
        </div>

        {/* Footer info */}
        <div
          className="p-2.5 border-t flex items-center justify-between text-[11px] shrink-0"
          style={{
            backgroundColor: "var(--bg-card-header, #0f172a)",
            borderColor: "var(--border-color, #334155)",
            color: "var(--text-muted, #94a3b8)",
          }}
        >
          <div className="flex items-center gap-3">
            <span>
              Press{" "}
              <kbd
                className="px-1.5 py-0.5 rounded font-mono text-[10px] border"
                style={{
                  backgroundColor: "var(--bg-input, #0f172a)",
                  borderColor: "var(--border-subtle, #334155)",
                  color: "var(--text-main, #f8fafc)",
                }}
              >
                ⌘S
              </kbd>{" "}
              to Save & Apply directly to{" "}
              <code
                className="px-1 rounded border"
                style={{
                  backgroundColor: "var(--bg-input, #0f172a)",
                  borderColor: "var(--border-subtle, #334155)",
                  color: "var(--accent-cyan, #06b6d4)",
                }}
              >
                {namespace}
              </code>
              .
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 rounded text-xs font-medium border transition-colors"
              style={{
                backgroundColor: "var(--bg-input, #0f172a)",
                borderColor: "var(--border-subtle, #334155)",
                color: "var(--text-main, #f8fafc)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !!validationError}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-40"
            >
              <Save size={12} />
              <span>Save & Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
