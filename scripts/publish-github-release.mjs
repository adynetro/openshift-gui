import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;

const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = `v${VERSION}`;
const releaseName = `OpenShift GUI v${VERSION} - Node Host Debugger, Port Forwarding, GUI Cluster Login, Direct Replica Input & Gi Memory`;

const releaseBody = `## 🚀 OpenShift GUI v${VERSION} - Node Host Debugger, Port Forwarding & GUI Login

### 🛠️ Node Host Debugger Pod Auto-Spawning & Zero 404 Resolution
- **Privileged Host Debugger Pod**: When initiating host debug on any Kubernetes/OpenShift node, OpenShift GUI automatically discovers or provisions a privileged debug pod (\`node-debugger-<nodeName>\`) running directly on that specific node with host filesystem mounted at \`/host\`, full host networking, PID, IPC, and automatic \`chroot /host\` shell initiation.
- **Air-Gapped & Enterprise Cluster Image Re-use**: Automatically scans and reuses container images already cached on the target node to prevent \`ImagePullBackOff\` or external registry dependencies.
- **Automatic Lifecycle Clean-up**: Automatically removes temporary debug pods on terminal session termination to keep clusters clean.

### 🌐 Native Kubernetes Ingresses Explorer & Routing
- **Dedicated Ingresses View**: First-class support for Kubernetes Ingress resources under **Networking** (Hotkey: \`g\`) alongside OpenShift Routes, Services, and NetworkPolicies.
- **Rich Ingress Insights**: View exposed hosts, routing paths, ingress classes, backend services, and TLS certificates with 1-click external browser launch and jump-to-service navigation.
- **Ingress Port Forwarding**: Direct 1-click background port forwarding from any Ingress or Route to your local machine.

### 🔌 Ingress, Route & Service Port Forwarding Manager
- **Live Background Port Forwarding**: Effortlessly forward ports from any Kubernetes/OpenShift **Service**, **Route**, or **Pod** directly to your local workstation.
- **Port Auto-Detection**: Automatically detects target container and service ports (\`80\`, \`443\`, \`8080\`, \`8443\`, \`3000\`, \`5432\`, \`3306\`, etc.) and assigns optimal local ports.
- **Interactive Management Modal**: Monitor active tunnels, copy \`localhost:<port>\` URLs with 1-click, open web endpoints directly in your default browser, and terminate individual or all active port-forward sessions cleanly.
- **Quick Action Triggers**: Instant **Port Forward** action button on Services and Routes in the resource explorer and search bar.

### 🔐 GUI Cluster Login & Kubeconfig Importer
- **Smart \`oc login\` Command Parser**: Simply paste any \`oc login\` command (e.g. \`oc login https://api.cluster.example.com:6443 --token=sha256~... --insecure-skip-tls-verify=true\`) and OpenShift GUI automatically parses the server URL, token, username, password, namespace, and certificate options.
- **Direct Bearer Token & Basic Auth**: Connect directly to remote OpenShift, Kubernetes, and Rancher clusters from the GUI without needing the \`oc\` CLI installed.
- **Full Kubeconfig YAML / JSON Importer**: Paste raw YAML/JSON kubeconfig manifests into the GUI to safely merge clusters, users, and contexts into \`~/.kube/config\` with automatic timestamped backups.
- **1-Click Context Activation**: Automatically switches the active context and synchronizes projects immediately after login or import.

### 🔢 Direct Workload Replicas Input & Presets
- **Editable Replica Input Textbox**: Directly type the exact desired replica count (e.g. \`0\`, \`5\`, \`25\`, \`100\`) into an interactive text box.
- **Instant Scaling Presets**: 1-click quick presets for common replica targets: \`0 (Stop / Scale Down)\`, \`1\`, \`2\`, \`3\`, \`5\`, and \`10\`.
- **Enhanced Keyboard Workflow**: Press \`Enter\` directly from the text box to execute scaling immediately.
- **Dynamic Adaptive Range Slider**: Slider range automatically adjusts to match higher replica targets.

### 💻 Open Pod Console in OS Default Terminal
- **Native Host Terminal Launch**: Launch interactive pod shell sessions directly in your host operating system's native terminal emulator:
  - **macOS**: Opens in macOS Terminal.app or iTerm2.
  - **Windows**: Opens in Windows Terminal (\`wt.exe\`), PowerShell, or CMD.
  - **Linux**: Opens in \`x-terminal-emulator\`, \`gnome-terminal\`, \`konsole\`, \`xfce4-terminal\`, \`alacritty\`, \`kitty\`, or \`xterm\`.
- **Automatic Fallback Command Copy**: If no supported terminal emulator is found, automatically copies the connection command to clipboard and notifies the user.

### 💾 Download Complete Un-Truncated Logs
- **1-Click Log File Export**: Download the complete, un-truncated log history for any container, pod, or workload directly to a timestamped \`.log\` file.
- **Streamlined Log Viewer Integration**: Dedicated **Download Logs** button in the Log Viewer modal header.

### 📊 Normalized Memory & Ephemeral Storage in Gi / Ti (Not Ki)
- **Human-Readable Gi & Ti Display**: All memory and ephemeral-storage capacity, allocatable resources, node metrics, pod limits, container requests, and describe outputs are cleanly normalized to \`Gi\` and \`Ti\` (or \`Gb\` / \`Tb\`) instead of raw, unreadable \`Ki\` or byte counts.
- **Node Diagnostics & Debug Cards**: Clear Gi and Ti capacity and allocatable gauges in Node Host Debug and Pod Diagnostics modals.

### 🏷️ Friendly Cluster Name Context Display
- **Display \`clusters.name\` Instead of Raw URL**: Top navigation bar, cluster switcher modal, and server cards prominently display the friendly cluster name (\`clusters[].name\` / \`context.cluster\`) rather than raw \`https://...\` server URLs.

---

### 📦 Multi-Container Pod Terminal Auto-Discovery & Zero-Failure Recovery
- **Automatic Container Resolution**: Auto-detects \`kubectl.kubernetes.io/default-container\` annotation or selects primary container on multi-container pods.
- **Zero-Failure Error Recovery**: Dynamically parses container names from API rejection responses and auto-reconnects.
- **Interactive Container Selector Dropdown**: 1-click switching between sidecars, controllers, and application containers in the terminal modal header.

### 🖥️ Native Terminal WebSocket 400 Bad Request Fix & TTY Stream Synchronization
- **Fixed TTY / Stderr Stream Conflict**: Resolved the \`HTTP 400 Bad Request\` error (\`cannot specify stderr with tty\`) by properly adhering to the Kubernetes Exec API specification where stderr is omitted when allocating a pseudo-terminal (\`tty: true\`).
- **Standardized Subprotocol Negotiation**: Enforced standard Kubernetes streaming subprotocols (\`v4.channel.k8s.io\`, \`v3.channel.k8s.io\`, \`v2.channel.k8s.io\`, \`channel.k8s.io\`) and removed unrecognized protocol strings.
- **Port Normalization for Ingress & Reverse Proxies**: Avoids sending redundant \`:443\` / \`:80\` in the WebSocket \`Host\` header, preventing route host mismatch rejections in OpenShift HAProxy/Envoy routers, ALBs, and Cloudflare proxies.
- **Rich Rejection Error Reporting**: Integrated \`unexpected-response\` stream listener in \`TerminalService\` to extract and render exact API server error reasons directly in the terminal interface.

### 🪟 Full Windows Kubeconfig & Token Sanitization
- **Windows CRLF (\`\\r\\n\`) Stripping**: Automatically scrubs carriage returns and trailing line breaks from bearer authentication tokens, token files, and base64 certificates to ensure clean HTTP authorization headers without malformed header exceptions on Windows.
- **Relative Certificate Path Resolution**: Automatically resolves relative \`certificate-authority\`, \`client-certificate\`, and \`client-key\` file paths relative to the kubeconfig directory across all operating systems.

### 📐 Live Terminal Dynamic Resizing (Channel 4)
- **Bidirectional Dimension Synchronization**: Added \`terminal:resize\` IPC handler and hooked up xterm.js \`onResize\` across **Pod Terminal**, **Pod Debug**, and **Node Host Debug** modals.
- **Flawless Fullscreen & CLI Experience**: Remote TTY dimensions dynamically adjust to fit exact window width and height for interactive tools (\`top\`, \`htop\`, \`vim\`, \`nano\`, \`less\`, multi-column tables).

### ⚡ 100% Standalone Native REST & WebSocket Engine (Zero \`oc\` / \`kubectl\` Dependence)
- **Zero CLI Binary Requirement**: OpenShift GUI does not require \`oc\` or \`kubectl\` binaries installed on the host operating system.
- **Direct HTTPS REST API**: All operations execute directly via native HTTPS Keep-Alive connections to the Kubernetes API server.
- **Native WebSocket Terminal Exec**: Integrated interactive terminal shell (\`TerminalService\`) communicates directly over Kubernetes WebSocket Exec endpoint using \`v4.channel.k8s.io\` subprotocol with full bidirectional stdin/stdout/stderr multiplexing and terminal resizing.
- **Native HTTPS Log Streaming**: Live container log streaming (\`LogStreamer\`) operates via persistent chunked HTTP transfer with automatic multi-pod aggregation, timestamp parsing, and zero subprocess overhead.

### 🐮 Full Rancher, K3s, RKE & Vanilla Kubernetes Compatibility
- **Path-Based Server URL Handling**: Correctly preserves and routes API requests to Rancher cluster path prefixes (e.g. \`https://<rancher-host>/k8s/clusters/<cluster-id>\`).
- **Seamless Namespace Fallback**: Automatically discovers and lists namespaces on clusters that do not run OpenShift-specific project APIs (\`/apis/project.openshift.io/v1/projects\` ➔ \`/api/v1/namespaces\`).
- **Token & Auth Provider Support**: Directly extracts and authenticates with bearer tokens, auth-provider configs (OIDC, Rancher, token-file), and custom X.509 client certificates.
- **Cross-Platform Compatibility**: Fully compatible with OpenShift 3/4, Rancher v2.x, RKE/RKE2, K3s, EKS, GKE, AKS, and standard Kubernetes clusters.

### ⚡ Gzip, Deflate & Brotli REST Stream Acceleration
- **Automatic HTTP Stream Decompression**: Enabled \`Accept-Encoding: gzip, deflate, br\` in \`KubeHttpClient\` with \`node:zlib\` fast streaming decompression.
- **Micro-Payload API Responses**: Large cluster JSON responses compress by 80%-90%, dramatically accelerating transfer over VPN and remote cluster networks.
- **Persistent Keep-Alive Connection Pool**: Sockets maintain active TLS sessions for 60 seconds with \`maxSockets: 100\` and \`maxFreeSockets: 50\`, avoiding expensive repeated TLS handshakes.

### 🏎️ Instant In-Memory SWR Resource Caching (0ms Tab Switching)
- **Unified Multi-Tier Cache**: All transformed Kubernetes/OpenShift objects across all resource kinds are cached in unified memory stores.
- **0ms Instant Tab Transitions**: Clicking between sidebar tabs populates the table **instantly in 0 milliseconds** without loading spinners.
- **Stale-While-Revalidate (SWR)**: The UI renders cached items immediately while silent background syncs update live cluster changes seamlessly.
- **Smart Mutation Invalidation**: Applying YAML, scaling replicas, restarting workloads, or deleting resources automatically invalidates specific cache keys.

### 🛰️ Live Loading Animation & Radar Scanner
- **High-Tech Animated Preloader**: Seamless orbital radar scanner with counter-rotating rings and glowing center hub displayed during Server / Context and Project / Namespace switches.
- **Dynamic Shimmer Progress Bar**: Smooth real-time progress bar with animated light sweep indicating active synchronization stages.
- **Zero-Flicker Transitions**: Prevents flashing empty states by holding the smooth preloader until all objects and counts have been received.

### ⚡ Comprehensive Parallel Data Preloading
- **Concurrent REST Queries**: Preloads active view manifests, topology graphs, and all sidebar badge counts across all kinds (**Pods, Deployments, StatefulSets, DaemonSets, Routes, Services, NetworkPolicies, PVCs, ConfigMaps, Secrets, ImageStreams, Helm Releases**) in parallel over Keep-Alive HTTPS.
- **Topology Graph Instant Preload**: Preloads full application topology in the background so navigating or switching projects in the **Topology** view displays instantly without secondary spinners.
- **Initial Startup Preload**: Background preloading populates sidebar counts immediately upon cluster connection.

### 🖥️ Kubeconfig Startup Parsing & Active Server Discovery
- **Display Only Servers with Active Contexts**: Automatically parses \`~/.kube/config\` at startup, maps cluster server endpoints, and displays only servers that have active/valid contexts.
- **Server Grouping & Deduplication**: Groups multiple contexts belonging to the same cluster server endpoint (e.g. per-project OpenShift contexts) under a unified server card with active context and user badges.
- **Sub-Context Selector**: Quick-switch buttons and pill list to select specific namespaces/contexts under a server without UI clutter.

### 🔄 Automatic Project Refresh on Server Change
- **Instant Project Sync**: Automatically switches and refreshes the projects/namespaces list whenever a server or context is changed.
- **Auto-Select Active Namespace**: Automatically selects the new server's active namespace (or cluster-wide \`All Projects\`), preventing stale/orphaned namespace queries.
- **Immediate Resource Reload**: Clears stale resource cache and re-fetches resources for the active project on the newly selected server.

### 🛡️ Resilient Kubeconfig Parser & Edge-Case Protection
- **Fault-Tolerant Parsing**: Handles heavily corrupted, malformed, or incomplete kubeconfig files (dangling cluster references, missing user objects, null arrays, duplicate names, invalid YAML syntax).
- **Safe Fallbacks**: Automatically falls back to atomic direct updates if CLI \`oc config\` commands fail.
- **Safe Automatic Backups**: Continues to create automatic timestamped backups at \`~/.kube/config.bak-<timestamp>\` before writing any changes.

### 🏷️ Dynamic Version Synchronization
- **Automated UI Versioning**: The version indicator on the bottom-left sidebar is dynamically bound via compile-time injection (\`__APP_VERSION__\`) directly from \`package.json\`, ensuring the UI footer always accurately reflects the installed desktop release version.

---

### ⚡ Direct High-Speed HTTPS REST Engine
- **Persistent Keep-Alive Connection Pool**: Bypasses the overhead of spawning heavyweight \`oc\` CLI processes for polling. HTTP Keep-Alive sockets maintain connections directly to the Kubernetes / OpenShift API server.
- **Eliminates 65K Buffer & Pipe Truncation**: Large JSON responses (>65KB) in topology and resource explorers stream directly into memory without kernel pipe truncation.
- **10x-20x Faster Topology**: Concurrent micro-queries for workloads, services, routes, PVCs, and pods execute in parallel over the pooled connection in **~60ms** (down from 2-4 seconds).
- **Graceful Zero-Breakage Fallback**: Automatically falls back to \`oc\` CLI execution if dynamic auth plugins or custom proxies are detected.

### 📦 92% Initial Frontend Bundle Reduction
- **Asynchronous Modal Code-Splitting**: CodeMirror YAML editor, Xterm terminal, Add App Wizard, NetworkPolicy Designer, and all 20+ modals are dynamically imported on-demand.
- **Instant Desktop Startup**: Initial frontend payload dropped from **1.5 MB** down to **116 KB**.
- **Stand-alone Vendor Chunks**: Isolated vendor chunks for CodeMirror, Xterm, React, and Lucide for maximum caching.

### 📜 High-Throughput Log Streaming & Event-Loop Optimization
- **Micro-Throttled IPC Batching**: Buffers streaming log lines into 25ms / 40-line batches, eliminating Electron IPC event-loop starvation during intensive container log bursts.
- **Bulk Buffer Slicing**: Replaced O(N) single-element array shifts with bulk slicing.
- **Stable Stream Pause/Resume**: Toggling log pause preserves the active backend stream without teardown or restarts.

### 🧹 Kubeconfig Context Cleaner & Pruner
- **Keep Active Context Only**: 1-click action to purge all stale/inactive contexts from \`~/.kube/config\`.
- **Selective Bulk Cleanup & Individual Deletion**: Manage contexts with checkboxes or individual delete triggers.
- **Orphaned Cluster & User Pruning**: Automatically prunes dangling \`clusters\` and \`users\` (auth-infos) with timestamped backups (\`~/.kube/config.bak-<timestamp>\`).

---

### 📦 Release Binaries & Supported Platforms

#### 🪟 Windows (x64 & x86)
- **\`OpenShift GUI ${VERSION}.exe\`** (Self-Contained Standalone Portable Executable - No installation required)
- **\`OpenShift GUI Setup ${VERSION}.exe\`** (Windows Setup Installer)
- **\`OpenShift GUI-${VERSION}-win.zip\`** (Windows x64 Portable App Package)
- **\`OpenShift GUI-${VERSION}-ia32-win.zip\`** (Windows x86 32-bit Portable App Package)

#### 🍏 macOS (Apple Silicon & Intel)
- **\`OpenShift GUI-${VERSION}-arm64-mac.zip\`** (macOS Apple Silicon Desktop App)
- **\`openshift-gui-darwin-arm64\`** (Native Mach-O 64-bit Standalone CLI / TUI Binary)
- **\`openshift-gui-v${VERSION}-darwin-arm64.zip\`** / **\`.tar.gz\`**

#### 🐧 Linux (x64 & arm64)
- **\`OpenShift GUI-${VERSION}.tar.gz\`** & **\`OpenShift GUI-${VERSION}-arm64.tar.gz\`**
- **\`OpenShift GUI-${VERSION}.zip\`** & **\`OpenShift GUI-${VERSION}-arm64.zip\`**

#### 🔐 Checksums
Verify file integrity using \`SHA256SUMS.txt\`.`;

async function publishRelease() {
  console.log(`Checking / creating GitHub release for ${tagName}...`);

  let releaseData;

  // 1. Try Create Release
  const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'openshift-gui-builder',
    },
    body: JSON.stringify({
      tag_name: tagName,
      name: releaseName,
      body: releaseBody,
      draft: false,
      prerelease: false,
    }),
  });

  const createJson = await createRes.json();
  if (createJson.id) {
    releaseData = createJson;
    console.log(`Release created successfully! ID: ${releaseData.id}, URL: ${releaseData.html_url}`);
  } else {
    // Check if release exists
    const getRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tagName}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'openshift-gui-builder',
      },
    });
    releaseData = await getRes.json();
    if (!releaseData.id) {
      throw new Error('Failed to create or find release: ' + JSON.stringify(createJson));
    }
    console.log(`Found existing release ID: ${releaseData.id}, URL: ${releaseData.html_url}`);

    // Update release title & body
    await fetch(`https://api.github.com/repos/${repo}/releases/${releaseData.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'openshift-gui-builder',
      },
      body: JSON.stringify({
        name: releaseName,
        body: releaseBody,
      }),
    });
  }

  // 2. Upload Assets
  const uploadUrlTemplate = releaseData.upload_url.replace(/\{(\?.*)?\}/, '');
  const releaseDir = path.join(ROOT_DIR, 'release');
  
  // Discover all built release files automatically
  const filesToUpload = fs.readdirSync(releaseDir).filter((f) => {
    const fullPath = path.join(releaseDir, f);
    return (
      fs.statSync(fullPath).isFile() &&
      !f.endsWith('.blockmap') &&
      !f.endsWith('.yml') &&
      !f.endsWith('.yaml')
    );
  });

  // Fetch existing assets to check which ones are already uploaded
  const assetsRes = await fetch(`https://api.github.com/repos/${repo}/releases/${releaseData.id}/assets?per_page=100`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'openshift-gui-builder',
    },
  });
  const existingAssets = await assetsRes.json();
  const normalize = (s) => (s || '').toLowerCase().replace(/[\s_.-]+/g, '.');
  const assetMap = new Map();
  if (Array.isArray(existingAssets)) {
    for (const asset of existingAssets) {
      assetMap.set(asset.name, asset);
      assetMap.set(normalize(asset.name), asset);
      assetMap.set(asset.name.replace(/\./g, ' '), asset);
    }
  }

  for (const filename of filesToUpload) {
    const filePath = path.join(releaseDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn('Skipping missing file: ' + filename);
      continue;
    }

    const size = fs.statSync(filePath).size;
    const existingAsset = assetMap.get(filename) || assetMap.get(normalize(filename)) || assetMap.get(filename.replace(/\s+/g, '.'));

    if (existingAsset && existingAsset.size === size && existingAsset.state === 'uploaded') {
      console.log(`⏩ ${filename} already uploaded (${(size / (1024 * 1024)).toFixed(2)} MB), skipping.`);
      continue;
    }

    if (existingAsset) {
      console.log(`Replacing existing asset ${filename} (ID: ${existingAsset.id})...`);
      try {
        await fetch(`https://api.github.com/repos/${repo}/releases/assets/${existingAsset.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'openshift-gui-builder',
          },
        });
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        console.warn(`Could not delete asset ${filename}:`, err.message);
      }
    }

    const fileBuffer = fs.readFileSync(filePath);
    console.log(`Uploading ${filename} (${(size / (1024 * 1024)).toFixed(2)} MB)...`);

    let contentType = 'application/octet-stream';
    if (filename.endsWith('.zip')) contentType = 'application/zip';
    else if (filename.endsWith('.tar.gz')) contentType = 'application/gzip';
    else if (filename.endsWith('.exe')) contentType = 'application/vnd.microsoft.portable-executable';
    else if (filename.endsWith('.txt')) contentType = 'text/plain';

    let success = false;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const uploadRes = await fetch(`${uploadUrlTemplate}?name=${encodeURIComponent(filename)}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': contentType,
            'Content-Length': size,
            'User-Agent': 'openshift-gui-builder',
          },
          body: fileBuffer,
        });

        const uploadData = await uploadRes.json();
        if (uploadData && uploadData.id) {
          console.log(`✅ Uploaded ${filename} (Asset ID: ${uploadData.id})`);
          success = true;
          break;
        } else {
          console.warn(`Attempt ${attempt} failed for ${filename}:`, uploadData?.message || uploadData);
        }
      } catch (err) {
        console.warn(`Attempt ${attempt} encountered error for ${filename}: ${err.message}`);
      }

      if (attempt < 4) {
        console.log(`Retrying ${filename} in 5 seconds...`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    if (!success) {
      console.error(`❌ Failed to upload ${filename} after 4 attempts.`);
    }
  }

  console.log(`\n🎉 All release assets processed for ${releaseData.html_url}`);
}

publishRelease().catch((err) => {
  console.error('Error publishing release:', err);
  process.exit(1);
});
