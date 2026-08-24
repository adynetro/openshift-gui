# OpenShift GUI (Desktop Application & CLI)

A modern, high-performance Graphical Desktop Application (GUI) & Terminal CLI for OpenShift and Kubernetes cluster management.

![OpenShift GUI](https://img.shields.io/badge/OpenShift-Desktop%20GUI-EE0000?style=for-the-badge&logo=redhatopenshift&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-43.4-47848F?style=for-the-badge&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Helm](https://img.shields.io/badge/Helm-3-0F1689?style=for-the-badge&logo=helm&logoColor=white)

---

## 🖥 Desktop GUI Features

- **🪟 Real Native Desktop Window**: Built with Electron, React, Vite, Tailwind CSS, and Lucide icons.
- **⚡ Interactive Context & Project Dropdown Selectors**:
  - Click the **Context** button in the top bar to fuzzy search and switch active kubeconfig contexts immediately.
  - Click the **Project** button in the top bar to fuzzy search and switch OpenShift projects (`oc project`) with one click.
  - Live connection status badge with auto-polling toggle and instant refresh.
- **🔍 Clickable Autocomplete Search & Action Suggestion Pills**:
  - Live resource filtering by name, status, IP, node, or labels.
  - Action pills appear below the search bar (`[ ⚡ Scale Replicas ]`, `[ 📜 Live Logs ]`, `[ 🧹 Clean ImageStream SemVer ]`, `[ ⎈ Helm Values ]`, `[ 🔄 Rollout Restart ]`, `[ 🗑 Delete ]`).
- **📦 ImageStream & Semantic Versioning Cleanup Wizard (`SemVer Clean`)**:
  - Automatic tag parsing into Semantic Versions (`v2.4.1`, `2.0.0-rc1`, etc.).
  - True SemVer descending sorting (newest release first).
  - **Interactive Wizard**: Keep latest `N` SemVer versions (e.g. keep 3), protect common tags (`latest`, `stable`, `main`), toggle Non-SemVer tags.
  - Interactive checkboxes on every tag to customize inclusion/exclusion.
  - Live count preview (Retained vs Pruned tags).
  - Clickable **"Execute Batch Cleanup"** button (`oc tag -d`).
- **⎈ Native Helm Release Manager**:
  - View Helm releases, revisions, chart versions, app versions, and status.
  - Clickable tabs for **User Values (`helm get values`)**, **Manifest (`helm get manifest`)**, **Revision History & Rollback (`helm history` / `helm rollback`)**, and **Uninstall (`helm uninstall`)**.
- **📜 Real-Time Log Streaming Window**:
  - Live scrolling log terminal with container switcher.
  - Clickable Pause / Resume, Auto-scroll toggle, Clear buffer, Copy all logs, and live in-log regex filter.
- **↕ Interactive Scale Dialog**:
  - Big clickable `+` and `-` buttons, number input, and range slider to scale Deployments & StatefulSets easily.
- **{ } YAML & Describe Details Modals**:
  - Clean syntax viewers with search and copy-to-clipboard buttons.

---

## 🚀 How to Run the Desktop GUI

### 1. Launch from Source (Development or Local)

```bash
# Start the Desktop GUI Window
npm run gui
# or
npm start
```

### 2. Launch the Packaged macOS App

```bash
# Open the packaged macOS Application directly
open "release/mac-arm64/OpenShift GUI.app"
```

Or extract [`release/OpenShift-GUI-macOS-arm64.zip`](file:///Users/alexandru.chiscari/git/openshift-gui/release/OpenShift-GUI-macOS-arm64.zip) into your `/Applications` folder!

---

## 📦 Build & Packaging Commands

```bash
# Build the Desktop GUI (Vite + Electron)
npm run build:gui

# Package the macOS .app bundle
npm run pack:app

# Build Standalone CLI Binary
npm run build:mac
```

---

## 🧪 Testing

Run the test suite:

```bash
npm test
```
