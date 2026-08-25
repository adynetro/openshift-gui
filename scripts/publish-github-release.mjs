import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = 'v1.2.1';
const releaseName = 'OpenShift GUI v1.2.1 - Embedded SemVer Identification & Generation Sorting';

const releaseBody = `## 🚀 What's New in OpenShift GUI v1.2.1

### 🏷️ Embedded SemVer Tag Identification
- **Complex Tag Version Extraction**: Recognizes embedded semantic versions inside tags with stage, branch, and build prefixes (e.g. \`release-stage-v1.6.6\`, \`stage-app-1.2.3\`, \`app-v2.10.4-rc.1\`, \`10.0-ubi9\`, \`8.0-ubi8\`).
- **SemVer Tag Classifier**: Automatically extracts and parses the underlying version so complex tags are properly ranked, displayed, and protected during automated ImageStream pruning.

### 🔢 OpenShift Tag Generation Tracking & Multi-Mode Sorting
- **Sort by OpenShift Tag Generation**: Added full support for sorting ImageStream tags by OpenShift creation generation (\`generation\` / \`gen:#\`), allowing users to sort by the newest tag revisions regardless of naming.
- **Interactive Sort Selector**: Added 4-way sorting toggle in ImageStream & SemVer Tag Manager:
  - **SemVer** (Highest semantic version first, tie-broken by generation)
  - **Generation** (Newest OpenShift tag generation first)
  - **Date** (Newest creation timestamp first)
  - **Name** (Alphabetical tag sorting)
### 🧹 Clear Completed & Failed Pods Across All Namespaces
- **Cluster-Wide Pod Cleanup**: Fixed batch pruning when viewing "All Projects" / all namespaces. Pods are now automatically grouped and targeted by their respective namespaces (\`oc delete pod <names> -n <namespace>\`), allowing 1-click cleanup across the entire cluster.

---

### 📦 Release Binaries & Packages

#### 🪟 Windows Packages (x86 & x64)
- **\`OpenShift GUI-1.2.1-win.zip\`** (Windows x64 64-bit Standalone Portable App)
- **\`OpenShift GUI-1.2.1-ia32-win.zip\`** (Windows x86 32-bit Standalone Portable App)

#### 🍏 macOS Packages (Apple Silicon)
- **\`OpenShift GUI-1.2.1-arm64-mac.zip\`** (macOS Apple Silicon Desktop App)
- **\`openshift-gui-darwin-arm64\`** (Native Mach-O 64-bit CLI / TUI Executable)
- **\`openshift-gui-v1.2.1-darwin-arm64.zip\`** / **\`.tar.gz\`**

#### 🔐 Checksums
Refer to \`SHA256SUMS.txt\` for binary validation hashes.`;

async function publishRelease() {
  console.log(`Creating GitHub release for ${tagName}...`);

  // 1. Create Release
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

  const releaseData = await createRes.json();
  if (!releaseData.id) {
    throw new Error('Failed to create release: ' + JSON.stringify(releaseData));
  }

  console.log(`Release created successfully! ID: ${releaseData.id}, URL: ${releaseData.html_url}`);

  // 2. Upload Assets
  const uploadUrlTemplate = releaseData.upload_url.replace(/\{(\?.*)?\}/, '');
  const releaseDir = path.join(ROOT_DIR, 'release');
  const filesToUpload = [
    'OpenShift GUI-1.2.1-win.zip',
    'OpenShift GUI-1.2.1-ia32-win.zip',
    'OpenShift GUI-1.2.1-arm64-mac.zip',
    'openshift-gui-darwin-arm64',
    'openshift-gui-v1.2.1-darwin-arm64.zip',
    'openshift-gui-v1.2.1-darwin-arm64.tar.gz',
    'SHA256SUMS.txt',
  ];

  for (const filename of filesToUpload) {
    const filePath = path.join(releaseDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn('Skipping missing file: ' + filename);
      continue;
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
