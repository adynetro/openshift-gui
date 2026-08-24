import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;
const RELEASE_DIR = path.join(ROOT_DIR, 'release');

console.log(`\x1b[36m🚀 Building OpenShift CLI TUI Release v${VERSION}...\x1b[0m\n`);

// 1. Run Tests
console.log('🧪 Step 1: Running unit tests...');
execSync('npm test', { cwd: ROOT_DIR, stdio: 'inherit' });
console.log('✅ Unit tests passed.\n');

// 2. Clean directories
console.log('🧹 Step 2: Cleaning output directories...');
if (fs.existsSync(RELEASE_DIR)) {
  fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(RELEASE_DIR, { recursive: true });

// 3. Compile TypeScript
console.log('🔨 Step 3: Compiling TypeScript...');
execSync('npx tsc', { cwd: ROOT_DIR, stdio: 'inherit' });
console.log('✅ TypeScript compilation complete.\n');

// 4. Bundle with esbuild
console.log('📦 Step 4: Bundling standalone distribution with esbuild...');

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

await esbuild.build({
  entryPoints: [path.join(ROOT_DIR, 'src', 'index.tsx')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: path.join(ROOT_DIR, 'dist', 'bundle.js'),
  plugins: [stubDevtoolsPlugin],
  external: [
    'node:*',
  ],
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);\n',
  },
  minify: true,
  sourcemap: false,
});

fs.chmodSync(path.join(ROOT_DIR, 'dist', 'bundle.js'), 0o755);
console.log('✅ Standalone bundle created at dist/bundle.js\n');

// 5. Create Standalone Executable in release/
const releaseBin = path.join(RELEASE_DIR, 'openshift-gui');
fs.copyFileSync(path.join(ROOT_DIR, 'dist', 'bundle.js'), releaseBin);
fs.chmodSync(releaseBin, 0o755);

// 6. Generate npm pack tarball
console.log('📦 Step 5: Packaging npm tarball...');
const packOutput = execSync(`npm pack --pack-destination "${RELEASE_DIR}"`, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
const tgzFile = path.join(RELEASE_DIR, packOutput);
console.log(`✅ NPM release package created: ${path.basename(tgzFile)}\n`);

// 7. Create standalone distribution archive (tar.gz)
console.log('📦 Step 6: Creating standalone archive...');
const archiveName = `openshift-gui-v${VERSION}-standalone.tar.gz`;
const archivePath = path.join(RELEASE_DIR, archiveName);

execSync(`tar -czf "${archivePath}" -C "${RELEASE_DIR}" openshift-gui -C "${ROOT_DIR}" README.md LICENSE`, {
  cwd: ROOT_DIR,
  stdio: 'inherit',
});
console.log(`✅ Standalone archive created: ${archiveName}\n`);

// 8. Generate SHA256 Checksums
console.log('🔐 Step 7: Generating SHA256 checksums...');
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
console.log(`✅ SHA256 checksums generated at ${path.basename(checksumFile)}\n`);

console.log(`\x1b[32m🎉 Release v${VERSION} built successfully in release/ folder!\x1b[0m`);
console.log('\nGenerated Artifacts:');
for (const line of checksumLines) {
  console.log(`  - ${line.split('  ')[1]}`);
}
