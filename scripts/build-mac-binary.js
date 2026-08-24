import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log(`\x1b[36m🍎 Building Native macOS Standalone Binary for OpenShift CLI TUI (v${VERSION})...\x1b[0m\n`);

// 1. Ensure directories exist
fs.mkdirSync(RELEASE_DIR, { recursive: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// 2. Bundle application as standalone ESM module
console.log('📦 Step 1: Bundling app with esbuild...');

const stubDevtoolsPlugin = {
  name: 'stub-devtools',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, (args) => {
      return { path: args.path, namespace: 'stub-devtools' };
    });
    build.onLoad({ filter: /.*/, namespace: 'stub-devtools' }, () => {
      return {
        contents: 'export default { connectToDevTools: () => {} };',
        loader: 'js',
      };
    });
  },
};

const esmBundlePath = path.join(DIST_DIR, 'bundle.js');

await esbuild.build({
  entryPoints: [path.join(ROOT_DIR, 'src', 'index.tsx')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: esmBundlePath,
  plugins: [stubDevtoolsPlugin],
  external: ['node:*'],
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);\n',
  },
  minify: true,
  sourcemap: false,
});
console.log('✅ Bundled ESM distribution at dist/bundle.js\n');

// 3. Create CJS SEA Entrypoint using Node SEA Assets API
console.log('⚙️ Step 2: Creating SEA entrypoint with Node SEA Assets...');
const seaEntryPath = path.join(DIST_DIR, 'sea-entry.cjs');
const seaEntryCode = `
const { getRawAsset } = require('node:sea');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

try {
  const bundleBuffer = Buffer.from(getRawAsset('bundle.js'));
  const tempFile = path.join(os.tmpdir(), \`openshift-gui-\${process.pid}.mjs\`);
  fs.writeFileSync(tempFile, bundleBuffer);

  const cleanup = () => {
    try { fs.unlinkSync(tempFile); } catch (e) {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  import(pathToFileURL(tempFile).href).catch((err) => {
    cleanup();
    console.error('Error starting OpenShift CLI TUI:', err);
    process.exit(1);
  });
} catch (err) {
  console.error('Fatal error loading embedded application:', err);
  process.exit(1);
}
`;
fs.writeFileSync(seaEntryPath, seaEntryCode);

const seaConfig = {
  main: path.relative(ROOT_DIR, seaEntryPath),
  output: 'dist/sea-prep.blob',
  assets: {
    'bundle.js': path.relative(ROOT_DIR, esmBundlePath),
  },
  disableExperimentalSEAWarning: true,
};

const seaConfigPath = path.join(ROOT_DIR, 'sea-config.json');
fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));

// Generate blob
execSync('node --experimental-sea-config sea-config.json', { cwd: ROOT_DIR, stdio: 'inherit' });
console.log('✅ Generated SEA blob at dist/sea-prep.blob\n');

// 4. Identify Architecture & Copy Node runtime binary
const arch = process.arch; // 'arm64' or 'x64'
const binaryName = `openshift-gui-darwin-${arch}`;
const targetBinary = path.join(RELEASE_DIR, binaryName);
const nodePath = process.execPath;

console.log(`🔨 Step 3: Preparing Mach-O executable for macOS (${arch})...`);
console.log(`   Source Node binary: ${nodePath}`);
console.log(`   Target Binary: ${targetBinary}`);

fs.copyFileSync(nodePath, targetBinary);
fs.chmodSync(targetBinary, 0o755);

// 5. Remove original signature
console.log('🔏 Step 4: Stripping existing Mach-O code signature...');
try {
  execSync(`codesign --remove-signature "${targetBinary}"`, { stdio: 'inherit' });
} catch (e) {
  console.log('   (No signature found or already stripped)');
}

// 6. Inject SEA blob using postject
console.log('💉 Step 5: Injecting SEA blob into Mach-O binary via postject...');
const blobPath = path.join(DIST_DIR, 'sea-prep.blob');
execSync(
  `npx postject "${targetBinary}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`,
  { cwd: ROOT_DIR, stdio: 'inherit' }
);
console.log('✅ SEA blob successfully injected.\n');

// 7. Re-sign Mach-O binary ad-hoc
console.log('🔏 Step 6: Re-signing binary with ad-hoc signature for macOS...');
execSync(`codesign --sign - "${targetBinary}"`, { stdio: 'inherit' });
console.log('✅ Mach-O binary signed.\n');

// Create symlink/copy as `openshift-gui-macos`
const genericMacBinary = path.join(RELEASE_DIR, 'openshift-gui-macos');
fs.copyFileSync(targetBinary, genericMacBinary);
fs.chmodSync(genericMacBinary, 0o755);

// 8. Package into .tar.gz and .zip for macOS
console.log('📦 Step 7: Packaging macOS distribution archive...');
const macTarGz = path.join(RELEASE_DIR, `openshift-gui-v${VERSION}-darwin-${arch}.tar.gz`);
const macZip = path.join(RELEASE_DIR, `openshift-gui-v${VERSION}-darwin-${arch}.zip`);

execSync(`tar -czf "${macTarGz}" -C "${RELEASE_DIR}" "${binaryName}" "openshift-gui-macos" -C "${ROOT_DIR}" README.md LICENSE`, {
  cwd: ROOT_DIR,
  stdio: 'inherit',
});

execSync(`zip -q -j "${macZip}" "${targetBinary}" "${ROOT_DIR}/README.md" "${ROOT_DIR}/LICENSE"`, {
  cwd: ROOT_DIR,
  stdio: 'inherit',
});

// Update SHA256 Checksums
console.log('🔐 Step 8: Updating SHA256 checksums...');
const releaseFiles = fs.readdirSync(RELEASE_DIR).filter((f) => f !== 'SHA256SUMS.txt');
const checksumLines = [];

for (const file of releaseFiles) {
  const filePath = path.join(RELEASE_DIR, file);
  if (fs.statSync(filePath).isFile()) {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    checksumLines.push(`${hash}  ${file}`);
  }
}

const checksumFile = path.join(RELEASE_DIR, 'SHA256SUMS.txt');
fs.writeFileSync(checksumFile, checksumLines.join('\n') + '\n');

console.log(`\n\x1b[32m🎉 Native macOS binary built successfully!\x1b[0m`);
console.log(`\nGenerated macOS Binaries & Archives:`);
console.log(`  - release/${binaryName} (Native Mach-O 64-bit Executable)`);
console.log(`  - release/openshift-gui-macos (Alias)`);
console.log(`  - release/${path.basename(macTarGz)}`);
console.log(`  - release/${path.basename(macZip)}`);
