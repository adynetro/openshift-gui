import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerIpcHandlers } from './ipc-handlers.js';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1000,
    minHeight: 650,
    title: 'OpenShift GUI',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a', // Slate 900
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist', 'main', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  registerIpcHandlers(mainWindow);

  const isDev = process.env['NODE_ENV'] === 'development' || !app.isPackaged;
  const devUrl = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173';

  if (isDev && process.env['VITE_DEV_SERVER_URL']) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
