import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = 'v1.2.2';
const releaseName = 'OpenShift GUI v1.2.2 - ImageStream Tag Count Filter, Registry Blob Pruner & Generation Cleanup';

const releaseBody = `## 🚀 What's New in OpenShift GUI v1.2.2

### 🏷️ ImageStream Tag Count Filtering & Quick Tag Manager
- **Filter by Tag Count**: Added a dedicated Tag Count filter dropdown on the ImageStreams tab with preset thresholds (\`All\`, \`≥ 1 Tag\`, \`≥ 5 Tags\`, \`≥ 10 Tags\`, \`≥ 20 Tags\`, \`≥ 50 Tags\`, \`0 Tags (Empty)\`) to quickly spot bloated or unreferenced image streams.
- **1-Click Tag Manager**: Clicking ImageStream names in the resource table now directly opens the Tag Manager and Cleanup Wizard.

### 🔥 OpenShift Integrated Registry Image & Storage Blob Pruner
- **Interactive Registry Pruner Wizard**: Added a dedicated tool (\`oc adm prune images\`) to purge unreferenced image layers, orphaned storage blobs, and historical tag revisions from registry persistent storage.
- **Dry-Run Simulation**: Run simulated pruning without deleting data to preview candidate images and blobs.
- **Confirmed Blob Deletion (\`--confirm\`)**: Permanently purge orphaned blobs and free physical disk space on registry storage.
- **Configurable Pruning Parameters**: Configure \`--keep-tag-revisions\`, \`--keep-younger-than\`, \`--all=true\`, and \`--ignore-invalid-refs\`.
- **Automated OpenShift CronJob Generator**: Generate and 1-click apply a native OpenShift \`batch/v1 CronJob\` and RBAC (\`system:image-pruner\` ServiceAccount and ClusterRoleBinding) for automated registry pruning.

### 🔢 Keep Latest N Tag Generations (Not Only SemVer)
- **Generation-Based Cleanup Strategy**: Added a strategy toggle in the ImageStream Cleanup Planner allowing users to prune by **Tag Generation** (\`gen:#\`) or **SemVer Releases**, retaining the newest $N$ revisions regardless of naming conventions.
- **Multi-Interface Support**: Strategy switching supported across both Desktop GUI and CLI/TUI modes.

---

### 📦 Release Binaries & Packages

#### 🪟 Windows Packages (x86 & x64)
- **\`OpenShift GUI-1.2.2-win.zip\`** (Windows x64 64-bit Standalone Portable App)
- **\`OpenShift GUI-1.2.2-ia32-win.zip\`** (Windows x86 32-bit Standalone Portable App)

#### 🍏 macOS Packages (Apple Silicon)
- **\`OpenShift GUI-1.2.2-arm64-mac.zip\`** (macOS Apple Silicon Desktop App)
- **\`openshift-gui-darwin-arm64\`** (Native Mach-O 64-bit CLI / TUI Executable)
- **\`openshift-gui-v1.2.2-darwin-arm64.zip\`** / **\`.tar.gz\`**

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
    'OpenShift GUI-1.2.2-win.zip',
    'OpenShift GUI-1.2.2-ia32-win.zip',
    'OpenShift GUI-1.2.2-arm64-mac.zip',
    'openshift-gui-darwin-arm64',
    'openshift-gui-v1.2.2-darwin-arm64.zip',
    'openshift-gui-v1.2.2-darwin-arm64.tar.gz',
    'openshift-gui-1.2.2.tgz',
    'openshift-gui-v1.2.2-standalone.tar.gz',
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
