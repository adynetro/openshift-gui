import React, { useEffect } from "react";
import { X, Keyboard, Layers, FolderGit2, Search, Terminal, ScrollText, Maximize2, Trash2, Boxes, Anchor, Sparkles } from "lucide-react";

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const shortcutGroups = [
    {
      title: "Navigation & Tabs",
      items: [
        { key: "1", desc: "Topology & Cluster Map View" },
        { key: "2", desc: "Pods View (with multi-selection & batch deletion)" },
        { key: "3", desc: "Deployments" },
        { key: "4", desc: "DeploymentConfigs (OpenShift DC)" },
        { key: "5", desc: "StatefulSets" },
        { key: "6", desc: "DaemonSets" },
        { key: "7", desc: "Routes (OpenShift Ingress URLs)" },
        { key: "8", desc: "Services" },
        { key: "9", desc: "PersistentVolumeClaims (PVC)" },
        { key: "0", desc: "PersistentVolumes (PV)" },
        { key: "w", desc: "NetworkPolicies" },
        { key: "k", desc: "Custom Resource Definitions (CRD)" },
        { key: "i", desc: "ImageStreams & SemVer Tag Cleanup" },
        { key: "h", desc: "Helm Releases & Values Editor" },
        { key: "c", desc: "ConfigMaps" },
        { key: "s", desc: "Secrets GUI Editor" },
        { key: "n", desc: "Nodes" },
        { key: "o", desc: "Cluster Operators & Live Health" },
        { key: "e", desc: "Cluster Events Stream" },
      ],
    },
    {
      title: "Context, Project & Search",
      items: [
        { key: "c", desc: "Open Context Switcher Modal" },
        { key: "p", desc: "Open Project / Namespace Switcher" },
        { key: "/", desc: "Focus Instant Search / Autocomplete Bar" },
        { key: "?", desc: "Open Keyboard Shortcuts & Help" },
        { key: "Esc", desc: "Close Active Modal / Clear Selection" },
      ],
    },
    {
      title: "Interactive Workload & Pod Actions",
      items: [
        { key: "Click Name", desc: "Open Workload Details / Hierarchy Modal" },
        { key: "Checkboxes", desc: "Multi-select Pods for Batch Deletion" },
        { key: "Terminal Icon", desc: "Interactive Shell Session (xterm-256color)" },
        { key: "Logs Icon", desc: "Live Log Stream with Pod Aggregation" },
        { key: "Key Icon", desc: "GUI Secret Editor with Plaintext Decoding" },
        { key: "Resize Icon", desc: "Expand Persistent Volume Storage Capacity" },
        { key: "Sparkles", desc: "SemVer Tag Cleanup Wizard for ImageStreams" },
        { key: "Anchor", desc: "Helm Release Values & Upgrade Manager" },
      ],
    },
  ];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 select-none"
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: "var(--bg-card, #1e293b)",
          borderColor: "var(--border-color, #334155)",
          color: "var(--text-main, #f8fafc)",
        }}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: "var(--bg-card-header, #0f172a)",
            borderColor: "var(--border-color, #334155)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center border"
              style={{
                backgroundColor: "rgba(6, 182, 212, 0.15)",
                borderColor: "rgba(6, 182, 212, 0.3)",
                color: "var(--accent-cyan, #06b6d4)",
              }}
            >
              <Keyboard size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold">Keyboard Shortcuts & Navigation Guide</h2>
              <p className="text-xs opacity-60 font-mono">OpenShift Desktop GUI • Turbo-charged Productivity</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/10 transition-all"
            title="Close help (Esc)"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6">
          {shortcutGroups.map((grp) => (
            <div key={grp.title} className="space-y-2.5">
              <h3
                className="text-xs font-bold uppercase tracking-wider font-mono flex items-center gap-1.5"
                style={{ color: "var(--accent-cyan, #06b6d4)" }}
              >
                <span>{grp.title}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {grp.items.map((item) => (
                  <div
                    key={item.key + item.desc}
                    className="flex items-center justify-between p-2 rounded-lg border text-xs font-mono transition-colors"
                    style={{
                      backgroundColor: "var(--bg-input, #0f172a)",
                      borderColor: "var(--border-subtle, #334155)",
                    }}
                  >
                    <span className="opacity-90">{item.desc}</span>
                    <kbd
                      className="px-2 py-0.5 rounded border text-[11px] font-bold shadow-sm shrink-0 ml-2"
                      style={{
                        backgroundColor: "var(--bg-card, #1e293b)",
                        borderColor: "var(--border-color, #334155)",
                        color: "var(--accent-color, #06b6d4)",
                      }}
                    >
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="p-3 border-t flex items-center justify-between text-xs font-mono opacity-70 shrink-0"
          style={{
            backgroundColor: "var(--bg-card-header, #0f172a)",
            borderColor: "var(--border-color, #334155)",
          }}
        >
          <span>OpenShift Desktop GUI</span>
          <span>Press <strong>Esc</strong> or <strong>?</strong> to close</span>
        </div>
      </div>
    </div>
  );
};
