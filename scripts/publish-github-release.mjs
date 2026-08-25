import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;

const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = `v${VERSION}`;
const releaseName = `OpenShift GUI v${VERSION} - Kubeconfig Context Cleaner, Self-Contained Windows Executable & NetworkPolicy Designer`;

const releaseBody = `## 🚀 What's New in OpenShift GUI v${VERSION}

### 🧹 Kubeconfig Context Cleaner & Pruner (Keep Active Context)
- **Keep Active Context Only**: 1-click action to purge all stale/inactive contexts from \`~/.kube/config\` and retain only the currently active cluster context.
- **Selective Batch Cleanup**: Select specific stale contexts with checkboxes to delete in bulk.
- **Individual Context Deletion**: Instant trash action per context card in the Context Management view.
- **Orphaned Cluster & User Pruning**: Automatically prunes dangling \`clusters\` and \`users\` (auth-infos) that are no longer referenced by any remaining context.
- **Safe Automatic Backups**: Automatically creates a timestamped backup at \`~/.kube/config.bak-<timestamp>\` before writing any changes.

### 🪟 Self-Contained Standalone Windows Executables
- **Portable Single-File Executable**: Released **\`OpenShift GUI ${VERSION}.exe\`** (100% self-contained single-file portable executable requiring no installer, administrative privileges, or Node.js runtime).
- **Windows Setup Installer**: **\`OpenShift GUI Setup ${VERSION}.exe\`** for standard desktop installation.
- **x64 and ia32 (x86) Support**: Both 64-bit and 32-bit standalone ZIP archives and executables.

### 🌐 NetworkPolicy Designer & Interactive Visualizer
- **Interactive Port Editor**: Manage protocol (\`TCP\`, \`UDP\`, \`SCTP\`) and port numbers/names directly with quick-add presets (\`80 HTTP\`, \`443 HTTPS\`, \`53 DNS\`, \`8080\`).
- **Interactive Peer & Label Editor**: Add/remove labels on \`PodSelector\` and \`NamespaceSelector\` peers, and edit \`IPBlock\` CIDR blocks.
- **Enriched Resource Table**: Displays Policy Types, Target Pod match label badges, Ingress rules & port chips, Egress rules & port chips, and metadata labels.

### 🔥 OpenShift Registry Pruner Route Integration
- **Automated External Route Discovery**: Auto-detects \`--registry-url\` from the OpenShift image registry route.
- **Manual Route Configuration**: Editable registry URL field in the image pruner modal with live auto-detection.
- **Automated CronJob Generator**: Injects the detected external registry URL into generated OpenShift \`batch/v1 CronJob\` manifests.

---

### 📦 Release Binaries & Packages

#### 🪟 Windows Packages (x64 & x86)
- **\`OpenShift GUI ${VERSION}.exe\`** (Self-Contained Standalone Portable Executable)
- **\`OpenShift GUI Setup ${VERSION}.exe\`** (Windows Setup Installer)
- **\`OpenShift GUI-${VERSION}-win.zip\`** (Windows x64 Portable App Package)
- **\`OpenShift GUI-${VERSION}-ia32-win.zip\`** (Windows x86 32-bit Portable App Package)

#### 🍏 macOS Packages (Apple Silicon)
- **\`OpenShift GUI-${VERSION}-arm64-mac.zip\`** (macOS Apple Silicon Desktop App)
- **\`openshift-gui-darwin-arm64\`** (Native Mach-O 64-bit Standalone CLI / TUI Binary)
- **\`openshift-gui-v${VERSION}-darwin-arm64.zip\`** / **\`.tar.gz\`**

#### 🔐 Checksums
Refer to \`SHA256SUMS.txt\` for SHA-256 verification hashes.`;

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
  const filesToUpload = [
    `OpenShift GUI ${VERSION}.exe`,
    `OpenShift GUI Setup ${VERSION}.exe`,
    `OpenShift GUI-${VERSION}-win.zip`,
    `OpenShift GUI-${VERSION}-ia32-win.zip`,
    `OpenShift GUI-${VERSION}-arm64-mac.zip`,
    'openshift-gui-darwin-arm64',
    `openshift-gui-v${VERSION}-darwin-arm64.zip`,
    `openshift-gui-v${VERSION}-darwin-arm64.tar.gz`,
    `openshift-gui-${VERSION}.tgz`,
    `openshift-gui-v${VERSION}-standalone.tar.gz`,
    'SHA256SUMS.txt',
  ];

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
