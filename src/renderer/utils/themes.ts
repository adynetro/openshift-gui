import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";
import { useState, useEffect } from "react";

export type ThemeId =
  | "default-dark"
  | "atom-one-dark"
  | "atom-one-light"
  | "solarized-dark"
  | "solarized-light"
  | "monokai"
  | "dracula"
  | "nord"
  | "github-dark"
  | "tokyo-night";

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  category: "dark" | "light";
  preview: {
    bg: string;
    sidebar: string;
    text: string;
    accent: string;
  };
  cssVars: Record<string, string>;
  xtermTheme: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent?: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  "default-dark": {
    id: "default-dark",
    name: "OpenShift Slate",
    category: "dark",
    preview: {
      bg: "#0b0f19",
      sidebar: "#0f172a",
      text: "#f8fafc",
      accent: "#06b6d4",
    },
    cssVars: {
      "--bg-main": "#0b0f19",
      "--bg-sidebar": "#0f172a",
      "--bg-header": "#0f172a",
      "--bg-card": "#1e293b",
      "--bg-card-header": "#0f172a",
      "--bg-input": "#0f172a",
      "--bg-row-hover": "#1e293b80",
      "--bg-row-selected": "#1e293be6",
      "--border-color": "#1e293b",
      "--border-subtle": "#334155",
      "--text-main": "#f8fafc",
      "--text-muted": "#94a3b8",
      "--accent-color": "#06b6d4",
      "--accent-cyan": "#06b6d4",
      "--accent-green": "#10b981",
      "--accent-yellow": "#f59e0b",
      "--accent-red": "#ef4444",
      "--accent-purple": "#a855f7",
      "--accent-blue": "#3b82f6",
    },
    xtermTheme: {
      background: "#0b0f19",
      foreground: "#f8fafc",
      cursor: "#06b6d4",
      cursorAccent: "#0b0f19",
      selectionBackground: "#334155",
      black: "#0f172a",
      red: "#ef4444",
      green: "#10b981",
      yellow: "#f59e0b",
      blue: "#3b82f6",
      magenta: "#a855f7",
      cyan: "#06b6d4",
      white: "#f8fafc",
      brightBlack: "#64748b",
      brightRed: "#f87171",
      brightGreen: "#34d399",
      brightYellow: "#fbbf24",
      brightBlue: "#60a5fa",
      brightMagenta: "#c084fc",
      brightCyan: "#22d3ee",
      brightWhite: "#ffffff",
    },
  },

  "atom-one-dark": {
    id: "atom-one-dark",
    name: "Atom One Dark",
    category: "dark",
    preview: {
      bg: "#21252b",
      sidebar: "#282c34",
      text: "#abb2bf",
      accent: "#61afef",
    },
    cssVars: {
      "--bg-main": "#21252b",
      "--bg-sidebar": "#282c34",
      "--bg-header": "#282c34",
      "--bg-card": "#282c34",
      "--bg-card-header": "#21252b",
      "--bg-input": "#1e2227",
      "--bg-row-hover": "#2c313a80",
      "--bg-row-selected": "#2c313ae6",
      "--border-color": "#181a1f",
      "--border-subtle": "#3e4451",
      "--text-main": "#abb2bf",
      "--text-muted": "#5c6370",
      "--accent-color": "#61afef",
      "--accent-cyan": "#56b6c2",
      "--accent-green": "#98c379",
      "--accent-yellow": "#e5c07b",
      "--accent-red": "#e06c75",
      "--accent-purple": "#c678dd",
      "--accent-blue": "#61afef",
    },
    xtermTheme: {
      background: "#21252b",
      foreground: "#abb2bf",
      cursor: "#528bff",
      cursorAccent: "#21252b",
      selectionBackground: "#3e4451",
      black: "#282c34",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#abb2bf",
      brightBlack: "#5c6370",
      brightRed: "#be5046",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
  },

  "atom-one-light": {
    id: "atom-one-light",
    name: "Atom One Light",
    category: "light",
    preview: {
      bg: "#f0f0f0",
      sidebar: "#e5e5e6",
      text: "#1e2227",
      accent: "#4078f2",
    },
    cssVars: {
      "--bg-main": "#f0f0f0",
      "--bg-sidebar": "#e5e5e6",
      "--bg-header": "#e5e5e6",
      "--bg-card": "#ffffff",
      "--bg-card-header": "#e5e5e6",
      "--bg-input": "#ffffff",
      "--bg-row-hover": "#e0e0e280",
      "--bg-row-selected": "#dbdbdce6",
      "--border-color": "#d0d0d0",
      "--border-subtle": "#c0c0c0",
      "--text-main": "#1e2227",
      "--text-muted": "#50545a",
      "--accent-color": "#4078f2",
      "--accent-cyan": "#0184bc",
      "--accent-green": "#50a14f",
      "--accent-yellow": "#c18401",
      "--accent-red": "#e45649",
      "--accent-purple": "#a626a4",
      "--accent-blue": "#4078f2",
    },
    xtermTheme: {
      background: "#ffffff",
      foreground: "#1e2227",
      cursor: "#526fff",
      cursorAccent: "#ffffff",
      selectionBackground: "#e5e5e6",
      black: "#000000",
      red: "#e45649",
      green: "#50a14f",
      yellow: "#c18401",
      blue: "#4078f2",
      magenta: "#a626a4",
      cyan: "#0184bc",
      white: "#50545a",
      brightBlack: "#4f525d",
      brightRed: "#e45649",
      brightGreen: "#50a14f",
      brightYellow: "#c18401",
      brightBlue: "#4078f2",
      brightMagenta: "#a626a4",
      brightCyan: "#0184bc",
      brightWhite: "#1e2227",
    },
  },

  "solarized-dark": {
    id: "solarized-dark",
    name: "Solarized Dark",
    category: "dark",
    preview: {
      bg: "#00212b",
      sidebar: "#002b36",
      text: "#839496",
      accent: "#2aa198",
    },
    cssVars: {
      "--bg-main": "#00212b",
      "--bg-sidebar": "#002b36",
      "--bg-header": "#002b36",
      "--bg-card": "#073642",
      "--bg-card-header": "#002b36",
      "--bg-input": "#001e26",
      "--bg-row-hover": "#07364280",
      "--bg-row-selected": "#073642e6",
      "--border-color": "#073642",
      "--border-subtle": "#586e75",
      "--text-main": "#839496",
      "--text-muted": "#586e75",
      "--accent-color": "#2aa198",
      "--accent-cyan": "#2aa198",
      "--accent-green": "#859900",
      "--accent-yellow": "#b58900",
      "--accent-red": "#dc322f",
      "--accent-purple": "#6c71c4",
      "--accent-blue": "#268bd2",
    },
    xtermTheme: {
      background: "#00212b",
      foreground: "#839496",
      cursor: "#2aa198",
      cursorAccent: "#00212b",
      selectionBackground: "#073642",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#6c71c4",
      cyan: "#2aa198",
      white: "#839496",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#93a1a1",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },

  "solarized-light": {
    id: "solarized-light",
    name: "Solarized Light",
    category: "light",
    preview: {
      bg: "#eee8d5",
      sidebar: "#fdf6e3",
      text: "#073642",
      accent: "#268bd2",
    },
    cssVars: {
      "--bg-main": "#eee8d5",
      "--bg-sidebar": "#fdf6e3",
      "--bg-header": "#fdf6e3",
      "--bg-card": "#fdf6e3",
      "--bg-card-header": "#eee8d5",
      "--bg-input": "#ffffff",
      "--bg-row-hover": "#e4decb80",
      "--bg-row-selected": "#ddd6c1e6",
      "--border-color": "#d5c4a1",
      "--border-subtle": "#bdae93",
      "--text-main": "#073642",
      "--text-muted": "#586e75",
      "--accent-color": "#268bd2",
      "--accent-cyan": "#2aa198",
      "--accent-green": "#859900",
      "--accent-yellow": "#b58900",
      "--accent-red": "#dc322f",
      "--accent-purple": "#6c71c4",
      "--accent-blue": "#268bd2",
    },
    xtermTheme: {
      background: "#fdf6e3",
      foreground: "#073642",
      cursor: "#2aa198",
      cursorAccent: "#fdf6e3",
      selectionBackground: "#eee8d5",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#6c71c4",
      cyan: "#2aa198",
      white: "#839496",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#93a1a1",
      brightCyan: "#93a1a1",
      brightWhite: "#002b36",
    },
  },

  monokai: {
    id: "monokai",
    name: "Monokai Pro",
    category: "dark",
    preview: {
      bg: "#1e1f1c",
      sidebar: "#272822",
      text: "#f8f8f2",
      accent: "#a6e22e",
    },
    cssVars: {
      "--bg-main": "#1e1f1c",
      "--bg-sidebar": "#272822",
      "--bg-header": "#272822",
      "--bg-card": "#272822",
      "--bg-card-header": "#1e1f1c",
      "--bg-input": "#191a17",
      "--bg-row-hover": "#3e3d3280",
      "--bg-row-selected": "#3e3d32e6",
      "--border-color": "#3e3d32",
      "--border-subtle": "#49483e",
      "--text-main": "#f8f8f2",
      "--text-muted": "#75715e",
      "--accent-color": "#a6e22e",
      "--accent-cyan": "#a1efe4",
      "--accent-green": "#a6e22e",
      "--accent-yellow": "#fd971f",
      "--accent-red": "#f92672",
      "--accent-purple": "#ae81ff",
      "--accent-blue": "#66d9ef",
    },
    xtermTheme: {
      background: "#1e1f1c",
      foreground: "#f8f8f2",
      cursor: "#a6e22e",
      cursorAccent: "#1e1f1c",
      selectionBackground: "#49483e",
      black: "#272822",
      red: "#f92672",
      green: "#a6e22e",
      yellow: "#fd971f",
      blue: "#66d9ef",
      magenta: "#ae81ff",
      cyan: "#a1efe4",
      white: "#f8f8f2",
      brightBlack: "#75715e",
      brightRed: "#f92672",
      brightGreen: "#a6e22e",
      brightYellow: "#e6db74",
      brightBlue: "#66d9ef",
      brightMagenta: "#ae81ff",
      brightCyan: "#a1efe4",
      brightWhite: "#f8f8f2",
    },
  },

  dracula: {
    id: "dracula",
    name: "Dracula",
    category: "dark",
    preview: {
      bg: "#1e1f29",
      sidebar: "#282a36",
      text: "#f8f8f2",
      accent: "#bd93f9",
    },
    cssVars: {
      "--bg-main": "#1e1f29",
      "--bg-sidebar": "#282a36",
      "--bg-header": "#282a36",
      "--bg-card": "#282a36",
      "--bg-card-header": "#1e1f29",
      "--bg-input": "#181920",
      "--bg-row-hover": "#44475a80",
      "--bg-row-selected": "#44475ae6",
      "--border-color": "#21222c",
      "--border-subtle": "#44475a",
      "--text-main": "#f8f8f2",
      "--text-muted": "#6272a4",
      "--accent-color": "#bd93f9",
      "--accent-cyan": "#8be9fd",
      "--accent-green": "#50fa7b",
      "--accent-yellow": "#f1fa8c",
      "--accent-red": "#ff5555",
      "--accent-purple": "#bd93f9",
      "--accent-blue": "#8be9fd",
    },
    xtermTheme: {
      background: "#1e1f29",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      cursorAccent: "#1e1f29",
      selectionBackground: "#44475a",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
  },

  nord: {
    id: "nord",
    name: "Nord",
    category: "dark",
    preview: {
      bg: "#242933",
      sidebar: "#2e3440",
      text: "#eceff4",
      accent: "#88c0d0",
    },
    cssVars: {
      "--bg-main": "#242933",
      "--bg-sidebar": "#2e3440",
      "--bg-header": "#2e3440",
      "--bg-card": "#2e3440",
      "--bg-card-header": "#242933",
      "--bg-input": "#1e222a",
      "--bg-row-hover": "#3b425280",
      "--bg-row-selected": "#3b4252e6",
      "--border-color": "#1d2128",
      "--border-subtle": "#3b4252",
      "--text-main": "#eceff4",
      "--text-muted": "#4c566a",
      "--accent-color": "#88c0d0",
      "--accent-cyan": "#88c0d0",
      "--accent-green": "#a3be8c",
      "--accent-yellow": "#ebcb8b",
      "--accent-red": "#bf616a",
      "--accent-purple": "#b48ead",
      "--accent-blue": "#81a1c1",
    },
    xtermTheme: {
      background: "#242933",
      foreground: "#eceff4",
      cursor: "#88c0d0",
      cursorAccent: "#242933",
      selectionBackground: "#434c5e",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#d08770",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    },
  },

  "github-dark": {
    id: "github-dark",
    name: "GitHub Dark",
    category: "dark",
    preview: {
      bg: "#010409",
      sidebar: "#0d1117",
      text: "#c9d1d9",
      accent: "#58a6ff",
    },
    cssVars: {
      "--bg-main": "#010409",
      "--bg-sidebar": "#0d1117",
      "--bg-header": "#0d1117",
      "--bg-card": "#161b22",
      "--bg-card-header": "#0d1117",
      "--bg-input": "#0d1117",
      "--bg-row-hover": "#21262d80",
      "--bg-row-selected": "#21262de6",
      "--border-color": "#21262d",
      "--border-subtle": "#30363d",
      "--text-main": "#c9d1d9",
      "--text-muted": "#8b949e",
      "--accent-color": "#58a6ff",
      "--accent-cyan": "#39c5cf",
      "--accent-green": "#3fb950",
      "--accent-yellow": "#d29922",
      "--accent-red": "#f85149",
      "--accent-purple": "#bc8cff",
      "--accent-blue": "#58a6ff",
    },
    xtermTheme: {
      background: "#010409",
      foreground: "#c9d1d9",
      cursor: "#58a6ff",
      cursorAccent: "#010409",
      selectionBackground: "#30363d",
      black: "#484f58",
      red: "#ff7b72",
      green: "#3fb950",
      yellow: "#d29922",
      blue: "#58a6ff",
      magenta: "#bc8cff",
      cyan: "#39c5cf",
      white: "#b1bac4",
      brightBlack: "#6e7681",
      brightRed: "#ffa198",
      brightGreen: "#56d364",
      brightYellow: "#e3b341",
      brightBlue: "#79c0ff",
      brightMagenta: "#d2a8ff",
      brightCyan: "#56d4dd",
      brightWhite: "#f0f6fc",
    },
  },

  "tokyo-night": {
    id: "tokyo-night",
    name: "Tokyo Night",
    category: "dark",
    preview: {
      bg: "#16161e",
      sidebar: "#1a1b26",
      text: "#a9b1d6",
      accent: "#7aa2f7",
    },
    cssVars: {
      "--bg-main": "#16161e",
      "--bg-sidebar": "#1a1b26",
      "--bg-header": "#1a1b26",
      "--bg-card": "#1f2335",
      "--bg-card-header": "#1a1b26",
      "--bg-input": "#13141c",
      "--bg-row-hover": "#292e4280",
      "--bg-row-selected": "#292e42e6",
      "--border-color": "#1f2335",
      "--border-subtle": "#292e42",
      "--text-main": "#a9b1d6",
      "--text-muted": "#565f89",
      "--accent-color": "#7aa2f7",
      "--accent-cyan": "#7dcfff",
      "--accent-green": "#9ece6a",
      "--accent-yellow": "#e0af68",
      "--accent-red": "#f7768e",
      "--accent-purple": "#bb9af7",
      "--accent-blue": "#7aa2f7",
    },
    xtermTheme: {
      background: "#16161e",
      foreground: "#a9b1d6",
      cursor: "#7aa2f7",
      cursorAccent: "#16161e",
      selectionBackground: "#283457",
      black: "#32344a",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#ad8ee6",
      cyan: "#444b6a",
      white: "#787c99",
      brightBlack: "#444b6a",
      brightRed: "#ff7a93",
      brightGreen: "#b9f27c",
      brightYellow: "#ff9e64",
      brightBlue: "#7da6ff",
      brightMagenta: "#bb9af7",
      brightCyan: "#0db9d7",
      brightWhite: "#acb0d0",
    },
  },
};

const THEME_STORAGE_KEY = "openshift_gui_theme_id";

export function getStoredTheme(): ThemeConfig {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId;
    if (stored && THEMES[stored]) {
      return THEMES[stored];
    }
  } catch {}
  return THEMES["default-dark"];
}

export function applyTheme(themeId: ThemeId): ThemeConfig {
  const theme = THEMES[themeId] || THEMES["default-dark"];
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  } catch {}

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme.id);
    root.setAttribute("data-theme-category", theme.category);

    for (const [key, value] of Object.entries(theme.cssVars)) {
      root.style.setProperty(key, value);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-theme-changed", { detail: theme }));
  }
  return theme;
}

export function getCodeMirrorTheme(theme: ThemeConfig) {
  const isLight = theme.category === "light";
  return createTheme({
    theme: isLight ? "light" : "dark",
    settings: {
      background: theme.cssVars["--bg-input"] || (isLight ? "#ffffff" : "#0b0f19"),
      backgroundImage: "",
      foreground: theme.cssVars["--text-main"] || (isLight ? "#1e2227" : "#f8fafc"),
      caret: theme.cssVars["--accent-cyan"] || (isLight ? "#0184bc" : "#06b6d4"),
      selection: isLight ? "#d0d0d080" : "#33415580",
      selectionMatch: isLight ? "#d0d0d040" : "#33415540",
      lineHighlight: isLight ? "#e0e0e240" : "#1e293b50",
      gutterBackground: theme.cssVars["--bg-card-header"] || (isLight ? "#f0f0f0" : "#0f172a"),
      gutterForeground: theme.cssVars["--text-muted"] || (isLight ? "#50545a" : "#94a3b8"),
      gutterBorder: theme.cssVars["--border-color"] || (isLight ? "#d0d0d0" : "#1e293b"),
    },
    styles: [
      { tag: t.comment, color: theme.cssVars["--text-muted"] || (isLight ? "#50545a" : "#64748b"), fontStyle: "italic" },
      { tag: [t.variableName, t.attributeName], color: theme.cssVars["--accent-cyan"] || (isLight ? "#0184bc" : "#06b6d4") },
      { tag: [t.string, t.special(t.brace)], color: theme.cssVars["--accent-green"] || (isLight ? "#50a14f" : "#10b981") },
      { tag: [t.number, t.bool, t.null], color: theme.cssVars["--accent-yellow"] || (isLight ? "#c18401" : "#f59e0b") },
      { tag: t.keyword, color: theme.cssVars["--accent-purple"] || (isLight ? "#a626a4" : "#a855f7") },
      { tag: t.propertyName, color: theme.cssVars["--accent-blue"] || (isLight ? "#4078f2" : "#3b82f6"), fontWeight: "bold" },
      { tag: t.heading, color: theme.cssVars["--accent-red"] || (isLight ? "#e45649" : "#ef4444"), fontWeight: "bold" },
      { tag: t.operator, color: theme.cssVars["--text-muted"] || (isLight ? "#50545a" : "#94a3b8") },
    ],
  });
}

export function useCurrentTheme(): { theme: ThemeConfig; cmTheme: any } {
  const [theme, setTheme] = useState<ThemeConfig>(getStoredTheme);

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail) {
        setTheme(e.detail);
      }
    };
    window.addEventListener("app-theme-changed", handler);
    return () => window.removeEventListener("app-theme-changed", handler);
  }, []);

  const cmTheme = getCodeMirrorTheme(theme);
  return { theme, cmTheme };
}
