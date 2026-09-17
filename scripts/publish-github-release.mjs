import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;

const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = `v${VERSION}`;
const releaseName = `OpenShift GUI v${VERSION} - Zero CLI Dependence, Native Rancher Cluster Support & WebSocket Exec`;

const releaseBody = `## 🚀 OpenShift GUI v${VERSION} - 100% Standalone Native REST & Rancher Release

### ⚡ 100% Standalone Native REST & WebSocket Engine (Zero \`oc\` / \`kubectl\` Dependence)
- **Zero CLI Binary Requirement**: OpenShift GUI no longer requires \`oc\` or \`kubectl\` binaries installed on the host operating system.
- **Direct HTTPS REST API**: All operations (manifest loading, filtering, resource creation, YAML apply, scaling, rollout restarts, PVC resizing, secrets editing, and multi-pod deletion) execute directly via native HTTPS Keep-Alive connections to the Kubernetes API server.
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
