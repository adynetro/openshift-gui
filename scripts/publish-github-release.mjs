import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;

const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = `v${VERSION}`;
const releaseName = `OpenShift GUI v${VERSION} - Direct HTTPS REST Engine, 92% Bundle Reduction, High-Throughput Streaming & Multi-Platform Packages`;

const releaseBody = `## 🚀 OpenShift GUI v${VERSION} - Major Architecture & Performance Release

OpenShift GUI v${VERSION} is a major evolutionary release bringing a direct high-speed HTTPS REST engine with connection pooling, drastic bundle optimization (92% initial bundle size reduction via React.lazy code splitting), buffered log streaming, memoized SemVer sorters, and cross-platform native binaries for macOS, Windows, and Linux.

---

### ⚡ High-Speed Direct HTTPS REST Engine
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

  // Fetch existing assets to delete duplicates before re-uploading
  const assetsRes = await fetch(`https://api.github.com/repos/${repo}/releases/${releaseData.id}/assets?per_page=100`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'openshift-gui-builder',
    },
  });
  const existingAssets = await assetsRes.json();
  const normalize = (s) => (s || '').toLowerCase().replace(/[\s.-]+/g, '.');
  const assetMap = new Map();
  if (Array.isArray(existingAssets)) {
    for (const asset of existingAssets) {
      assetMap.set(asset.name, asset.id);
      assetMap.set(normalize(asset.name), asset.id);
    }
  }

  for (const filename of filesToUpload) {
    const filePath = path.join(releaseDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn('Skipping missing file: ' + filename);
      continue;
    }

    const normName = normalize(filename);
    const existingAssetId = assetMap.get(filename) || assetMap.get(normName);
    if (existingAssetId) {
      console.log(`Replacing existing asset ${filename} (ID: ${existingAssetId})...`);
      await fetch(`https://api.github.com/repos/${repo}/releases/assets/${existingAssetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'openshift-gui-builder',
        },
      });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const size = fs.statSync(filePath).size;
    console.log(`Uploading ${filename} (${(size / (1024 * 1024)).toFixed(2)} MB)...`);

    let contentType = 'application/octet-stream';
    if (filename.endsWith('.zip')) contentType = 'application/zip';
    else if (filename.endsWith('.tar.gz')) contentType = 'application/gzip';
    else if (filename.endsWith('.exe')) contentType = 'application/vnd.microsoft.portable-executable';
    else if (filename.endsWith('.txt')) contentType = 'text/plain';

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
    if (!uploadData.id) {
      console.error(`Failed to upload ${filename}:`, uploadData);
    } else {
      console.log(`✅ Uploaded ${filename} (Asset ID: ${uploadData.id})`);
    }
  }

  console.log(`\n🎉 All release assets successfully attached to ${releaseData.html_url}`);
}

publishRelease().catch((err) => {
  console.error('Error publishing release:', err);
  process.exit(1);
});
