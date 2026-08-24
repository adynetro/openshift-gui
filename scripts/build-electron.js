import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const DIST_MAIN = path.join(ROOT_DIR, 'dist', 'main');
const DIST_RENDERER = path.join(ROOT_DIR, 'dist', 'renderer');

console.log('\x1b[36m🚀 Building OpenShift Desktop GUI...\x1b[0m\n');

// 1. Ensure output folders exist
fs.mkdirSync(DIST_MAIN, { recursive: true });
fs.mkdirSync(DIST_RENDERER, { recursive: true });

// 2. Build Vite React Desktop Frontend
console.log('🎨 Step 1: Building React Desktop GUI with Vite...');
execSync('npx vite build', { cwd: ROOT_DIR, stdio: 'inherit' });
console.log('✅ React Desktop UI built in dist/renderer\n');

// 3. Bundle Electron Main Process
console.log('⚡ Step 2: Bundling Electron Main Process...');
await esbuild.build({
  entryPoints: [path.join(ROOT_DIR, 'src', 'main', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: path.join(DIST_MAIN, 'index.js'),
  external: ['electron', 'node:*'],
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);\n',
  },
  minify: false,
  sourcemap: true,
});
console.log('✅ Main process built in dist/main/index.js\n');

// 4. Bundle Electron Preload Script
console.log('🔗 Step 3: Bundling Electron Preload Script...');
await esbuild.build({
  entryPoints: [path.join(ROOT_DIR, 'src', 'main', 'preload.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.join(DIST_MAIN, 'preload.js'),
  external: ['electron'],
  minify: false,
  sourcemap: false,
});
console.log('✅ Preload script built in dist/main/preload.js\n');

console.log('\x1b[32m🎉 OpenShift Desktop GUI build complete!\x1b[0m\n');
