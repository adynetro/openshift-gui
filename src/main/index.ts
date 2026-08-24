import electron from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { registerIpcHandlers } from './ipc-handlers.js';

const { app, BrowserWindow } = electron;

// Ensure macOS GUI subprocess PATH and HOME are properly initialized
const home = process.env['HOME'] || os.homedir();
const defaultPaths = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
  path.join(home, 'bin'),
  path.join(home, '.local', 'bin'),
];

process.env['PATH'] = Array.from(
  new Set([...defaultPaths, ...(process.env['PATH'] || '').split(':')])
).join(':');

if (!process.env['KUBECONFIG']) {
  process.env['KUBECONFIG'] = path.join(home, '.kube', 'config');
}

let mainWindow: electron.BrowserWindow | null = null;

async function createWindow() {
  const iconPath = path.join(__dirname, '../../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0f19',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  registerIpcHandlers(mainWindow);

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
