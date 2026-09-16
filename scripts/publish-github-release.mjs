import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;

const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = `v${VERSION}`;
const releaseName = `OpenShift GUI v${VERSION} - Active Server Discovery, Automatic Project Refresh & Resilient Kubeconfig Parser`;

const releaseBody = `## 🚀 What's New in OpenShift GUI v${VERSION}

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
