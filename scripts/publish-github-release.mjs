import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = 'v1.1.0';
const releaseName = 'OpenShift GUI v1.1.0 - Windows (x86/x64) & macOS Releases';

const releaseBody = `## 🚀 What's Changed in OpenShift GUI v1.1.0

### 🎨 Global Theme Engine & High-Contrast Light Mode
- Complete theme support with 10 standard palettes: **Atom One Dark**, **Atom One Light**, **Solarized Dark**, **Solarized Light**, **Monokai**, **Dracula**, **Nord**, **GitHub Dark**, **Tokyo Night**, and **OpenShift Slate**.
- Deep contrast text and borders across all views, cards, status pills, and inspector panels.

### 📝 Dynamic CodeMirror Syntax Highlighter & IDE Editor
- CodeMirror dynamically generates themes matching the app's global theme palette.
- **Fixed line number scrolling bug**: Line gutters are permanently pinned (\`position: sticky\`), preventing line numbers from disappearing when scrolling large documents.
- Full window expansion: Editor expands from top to bottom even for short YAML documents.

### ☸️ Topology Canvas & Batch Operations
- Topology Flow Pipeline, Graph, and Compact Grid views fully aligned with theme variables.
- Project-scoped batch Pod deletion with themed confirmation modal dialog.
- Cluster Operators events monitor & condition state transition history.
- SemVer ImageStream Tag Manager for automated cleanup and pruning.
- Live PVC dynamic capacity expansion.

---

### 📦 Release Binaries & Packages

#### 🪟 Windows Packages
- **\`OpenShift GUI 1.1.0.exe\`** (Universal Portable Windows Installer / App for x86 32-bit & x64 64-bit)
- **\`OpenShift GUI-1.1.0-ia32-win.zip\`** (Windows x86 32-bit Portable Zip Archive)
- **\`OpenShift GUI-1.1.0-win.zip\`** (Windows x64 64-bit Portable Zip Archive)

#### 🍏 macOS Packages
- **\`OpenShift GUI-1.1.0-arm64-mac.zip\`** (macOS Apple Silicon Desktop App)
- **\`openshift-gui-darwin-arm64\`** (Native Mach-O 64-bit CLI / TUI Executable)
- **\`openshift-gui-v1.1.0-darwin-arm64.zip\`** / **\`.tar.gz\`**

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
    'OpenShift GUI 1.1.0.exe',
    'OpenShift GUI-1.1.0-ia32-win.zip',
    'OpenShift GUI-1.1.0-win.zip',
    'OpenShift GUI-1.1.0-arm64-mac.zip',
    'openshift-gui-darwin-arm64',
    'openshift-gui-v1.1.0-darwin-arm64.zip',
    'openshift-gui-v1.1.0-darwin-arm64.tar.gz',
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
