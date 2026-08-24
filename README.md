# OpenShift & Kubernetes CLI TUI (`openshift-gui` / `oc-gui`)

An interactive, modern Terminal User Interface (TUI) for OpenShift and Kubernetes command-line workflows. Built with Node.js, TypeScript, React, and Ink.

![OpenShift CLI TUI](https://img.shields.io/badge/OpenShift-CLI%20TUI-EE0000?style=for-the-badge&logo=redhatopenshift&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-Blue-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)
![Helm](https://img.shields.io/badge/Helm-3-0F1689?style=for-the-badge&logo=helm&logoColor=white)

---

## ✨ Features

- **⚡ Instant Context & Project Switcher**:
  - Hotkey `c` to fuzzy search and switch active kubeconfig contexts on the fly.
  - Hotkey `p` to fuzzy search and switch OpenShift projects (`oc project`) or Kubernetes namespaces.
- **🔍 Autocomplete & Command Palette (`/` or `:`)**:
  - Type `/` to filter any resource view with real-time fuzzy search.
  - Type `:` to open command suggestions (`:scale`, `:logs`, `:clean-imagestream`, `:helm`, `:restart`, `:delete`, `:context`, `:project`).
  - Suggestion pills with `[Tab]` autocomplete.
- **📦 ImageStream Management & Semantic Versioning Cleanup**:
  - Automatically parses tags into semantic versions (e.g. `v2.4.1`, `2.0.0-rc1`).
  - Sorts tags in true SemVer descending order (newest version first).
  - Interactive **Cleanup Wizard (`i` -> `c`)**: choose how many latest SemVer versions to retain (e.g., keep top 3), preview tags to prune vs retain, calculate space, and batch delete (`oc tag -d`).
- **⎈ Native Helm Support**:
  - View Helm releases, revisions, chart versions, app versions, and status.
  - Inspect Helm values (`v`) and manifests (`m`).
  - Rollback to any historical revision (`r`) or uninstall (`u`).
- **📜 Real-Time Log Streaming**:
  - Streams logs live from any Pod container (`l`).
  - Auto-scroll toggle (`a`), pause/resume (`p`), and live in-log regex filtering (`/`).
- **⚙ Core Workload Operations**:
  - Interactive scaling for Deployments and StatefulSets (`s`).
  - Rollout restarts (`r`).
  - Describe / YAML syntax viewers (`d` / `y` / `Enter`).
  - Safe deletion dialogs (`x` / `Delete`).

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/alexandruchiscari/openshift-gui.git
cd openshift-gui

# Install dependencies and build
npm install
npm run build

# Link binary globally (optional)
npm link
```

### Usage

```bash
# Start the TUI
openshift-gui
# or
oc-gui

# Launch with a specific project/namespace
openshift-gui -n my-project

# Launch directly on ImageStreams or Helm tab
openshift-gui -k imagestreams
openshift-gui -k helm

# Launch with a specific context
openshift-gui -c my-cluster-context
```

---

## ⌨ Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| **`1` - `9`, `0`** | Switch Resource Tab (Pods, Deployments, StatefulSets, Services, Routes, ImageStreams, ConfigMaps, Secrets, Helm, Nodes) |
| **`c`** | **Context Switcher**: Fuzzy search & switch cluster context |
| **`p`** | **Project Switcher**: Fuzzy search & switch OpenShift project / namespace |
| **`/`** | Open search / filter bar with autocomplete suggestion pills |
| **`:`** | Open command palette (`:scale`, `:logs`, `:clean-imagestream`, `:helm`, etc.) |
| **`Enter` / `d`** | View Resource Description / Details |
| **`y`** | View Resource YAML definition |
| **`l`** | Open Live Log Streamer (Pods / Workloads) |
| **`s`** | Scale Deployment / StatefulSet replicas interactively |
| **`r`** | Trigger Rollout Restart |
| **`i`** | Open ImageStream SemVer Tag Manager & Cleanup Wizard |
| **`v`** | View Helm Values (when in Helm view) |
| **`m`** | View Helm Manifest (when in Helm view) |
| **`x` / `Del`** | Delete selected resource (with safety confirmation) |
| **`↑` / `↓` (`k` / `j`)** | Navigate through resource list |
| **`?` / `h`** | Open Help / Shortcuts cheatsheet |
| **`Esc`** | Close active modal / cancel filter |
| **`q`** | Quit application |

---

## 🧪 Testing

Run the test suite:

```bash
npm test
```
