import React, { useState, useEffect, useRef } from "react";
import { Palette, Check, Sun, Moon, ChevronUp } from "lucide-react";
import { THEMES, ThemeId, ThemeConfig, getStoredTheme, applyTheme } from "../utils/themes.js";

interface ThemeSelectorProps {
  onThemeChange?: (theme: ThemeConfig) => void;
  dropUp?: boolean;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ onThemeChange, dropUp = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(getStoredTheme());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Apply initial stored theme on mount
    const initial = applyTheme(currentTheme.id);
    setCurrentTheme(initial);

    // Listen for theme changes across the app
    const handler = (e: any) => {
      if (e.detail) {
        setCurrentTheme(e.detail);
        if (onThemeChange) onThemeChange(e.detail);
      }
    };
    window.addEventListener("app-theme-changed", handler);
    return () => window.removeEventListener("app-theme-changed", handler);
  }, [onThemeChange]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelectTheme = (themeId: ThemeId) => {
    const nextTheme = applyTheme(themeId);
    setCurrentTheme(nextTheme);
    setIsOpen(false);
  };

  const themeList = Object.values(THEMES);
  const darkThemes = themeList.filter((t) => t.category === "dark");
  const lightThemes = themeList.filter((t) => t.category === "light");

  return (
    <div className="relative no-drag w-full" ref={dropdownRef}>
      {/* Theme Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-mono transition-all opacity-85 hover:opacity-100 hover:bg-white/5"
        style={{
          backgroundColor: "var(--bg-card, #1e293b)",
          borderColor: "var(--border-subtle, #334155)",
          color: "var(--text-main, #f8fafc)",
        }}
        title="Change Global Window Theme"
        aria-label="Select Theme"
      >
        <div className="flex items-center gap-2 truncate">
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center border border-white/30 overflow-hidden shadow-inner shrink-0"
            style={{ backgroundColor: currentTheme.preview.bg }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentTheme.preview.accent }} />
          </div>
          <Palette size={13} style={{ color: "var(--accent-cyan, #06b6d4)" }} className="shrink-0" />
          <span className="font-semibold text-[11px] truncate">
            {currentTheme.name}
          </span>
        </div>
        <ChevronUp size={13} className={`opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu - Unfolds Upwards into viewport */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 ${
            dropUp ? "bottom-full mb-2" : "top-full mt-2"
          } w-64 max-w-[calc(100vw-24px)] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 border`}
          style={{
            backgroundColor: "var(--bg-card, #1e293b)",
            borderColor: "var(--border-color, #334155)",
            color: "var(--text-main, #f8fafc)",
          }}
        >
          {/* Header */}
          <div
            className="p-2.5 border-b flex items-center justify-between"
            style={{
              backgroundColor: "var(--bg-card-header, #0f172a)",
              borderColor: "var(--border-color, #334155)",
            }}
          >
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <Palette size={14} style={{ color: "var(--accent-cyan, #06b6d4)" }} />
              <span>Theme Selector</span>
            </div>
            <span className="text-[10px] opacity-60 font-mono">
              {currentTheme.category === "dark" ? "Dark Theme" : "Light Theme"}
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5 space-y-2">
            {/* Dark Themes Group */}
            <div>
              <div className="px-2 py-1 text-[10px] uppercase font-bold opacity-60 tracking-wider flex items-center gap-1">
                <Moon size={11} className="text-purple-400" />
                <span>Dark Themes</span>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {darkThemes.map((theme) => {
                  const isSelected = currentTheme.id === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => handleSelectTheme(theme.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all text-left ${
                        isSelected
                          ? "font-bold shadow-sm"
                          : "hover:bg-white/10 opacity-80 hover:opacity-100"
                      }`}
                      style={
                        isSelected
                          ? {
                              backgroundColor: "var(--bg-input, #0f172a)",
                              border: "1px solid var(--accent-cyan, #06b6d4)",
                              color: "var(--accent-cyan, #06b6d4)",
                            }
                          : { border: "1px solid transparent" }
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center border border-white/20 shrink-0 shadow-sm"
                          style={{ backgroundColor: theme.preview.bg }}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: theme.preview.accent }}
                          />
                        </div>
                        <span className="truncate">{theme.name}</span>
                      </div>
                      {isSelected && <Check size={14} style={{ color: "var(--accent-cyan, #06b6d4)" }} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Light Themes Group */}
            <div
              className="border-t pt-1.5"
              style={{ borderColor: "var(--border-subtle, #334155)" }}
            >
              <div className="px-2 py-1 text-[10px] uppercase font-bold opacity-60 tracking-wider flex items-center gap-1">
                <Sun size={11} className="text-amber-400" />
                <span>Light Themes</span>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {lightThemes.map((theme) => {
                  const isSelected = currentTheme.id === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => handleSelectTheme(theme.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all text-left ${
                        isSelected
                          ? "font-bold shadow-sm"
                          : "hover:bg-white/10 opacity-80 hover:opacity-100"
                      }`}
                      style={
                        isSelected
                          ? {
                              backgroundColor: "var(--bg-input, #0f172a)",
                              border: "1px solid var(--accent-cyan, #06b6d4)",
                              color: "var(--accent-cyan, #06b6d4)",
                            }
                          : { border: "1px solid transparent" }
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center border border-black/20 shrink-0 shadow-sm"
                          style={{ backgroundColor: theme.preview.bg }}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: theme.preview.accent }}
                          />
                        </div>
                        <span className="truncate">{theme.name}</span>
                      </div>
                      {isSelected && <Check size={14} style={{ color: "var(--accent-cyan, #06b6d4)" }} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
