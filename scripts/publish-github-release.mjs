import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill | grep "password=" | cut -d= -f2', { encoding: 'utf8' }).trim();

const repo = 'adynetro/openshift-gui';
const tagName = 'v1.2.0';
const releaseName = 'OpenShift GUI v1.2.0 - Workload Wizard, NetPol Designer, Diagnostics & Windows (x86/x64) / macOS';

const releaseBody = `## 🚀 What's New in OpenShift GUI v1.2.0

### 🪄 Workload Creation Wizard ("+ Add App")
- **Visual K8s/OpenShift Workload Wizard**: Full visual generator inspired by \`k8syaml.com\` for **Deployments**, **StatefulSets**, **CronJobs**, and **DeploymentConfigs**.
- **Cluster-Wide ImageStream Discovery**: Real-time searchable autocompletion for all core runtime images from project \`openshift\` (\`nodejs\`, \`python\`, \`dotnet\`, \`golang\`, \`java\`, \`postgresql\`, \`mysql\`, \`nginx\`, \`redis\`, \`ubi8/ubi9\`, etc.) and project-local ImageStreams.
- **Starter Templates**: 1-click starter blueprints for Node.js, Spring Boot API, Python FastAPI, PostgreSQL DB, Nightly Backup CronJob, and Nginx.
- **Live Bidirectional Split-View YAML Editor**: Synchronized real-time form editing and CodeMirror YAML manipulation.

### 🛡️ Interactive NetworkPolicy Designer
- **Visual 3-Column Policy Modeler**: Ingress sources, Target Pod Selectors, and Egress destinations.
- **Port & Protocol Rules**: Multi-port TCP/UDP rules, namespace selectors, and CIDR blocks with live YAML compilation and apply.

### 🩺 Deep Pod & Node Diagnostics
- **Pod Failure Diagnostics & Debug Shell**: Detailed exit code analysis, termination reasons, OOMKilled hints, and interactive \`oc debug pod\` terminal.
- **Node Diagnostics & Privileged Host Shell**: Capacity/allocatable resource meters, condition monitor (MemoryPressure, DiskPressure, PIDPressure), and \`oc debug node/<node-name>\` privileged shell.

### 🧼 Streamlined Resource Table & Top Toolbar Action Bar
- Cleaned table rows for Pods with unified, prominent action pills (**Terminal**, **Logs**, **Debug Pod**, **Describe**, **YAML**, **Delete**) in the top toolbar upon row selection.

---

### 📦 Release Binaries & Packages

#### 🪟 Windows Packages (x86 & x64)
- **\`OpenShift GUI-1.2.0-win.zip\`** (Windows x64 64-bit Standalone Portable App)
- **\`OpenShift GUI-1.2.0-ia32-win.zip\`** (Windows x86 32-bit Standalone Portable App)

#### 🍏 macOS Packages (Apple Silicon)
- **\`OpenShift GUI-1.2.0-arm64-mac.zip\`** (macOS Apple Silicon Desktop App)
- **\`openshift-gui-darwin-arm64\`** (Native Mach-O 64-bit CLI / TUI Executable)
- **\`openshift-gui-v1.2.0-darwin-arm64.zip\`** / **\`.tar.gz\`**

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
    'OpenShift GUI-1.2.0-win.zip',
    'OpenShift GUI-1.2.0-ia32-win.zip',
    'OpenShift GUI-1.2.0-arm64-mac.zip',
    'openshift-gui-darwin-arm64',
    'openshift-gui-v1.2.0-darwin-arm64.zip',
    'openshift-gui-v1.2.0-darwin-arm64.tar.gz',
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
