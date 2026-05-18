const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({
  defaults: {
    winX: null,
    winY: null,
    winScale: 1.0,
  },
});

let mainWindow = null;
let winScale = store.get('winScale', 1.0);

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const baseW = 600;
  const baseH = 850;

  const w = Math.round(baseW * winScale);
  const h = Math.round(baseH * winScale);

  // 恢复上次位置，或默认右下角
  const savedX = store.get('winX');
  const savedY = store.get('winY');
  const defaultX = screenWidth - w - 40;
  const defaultY = screenHeight - h - 50;

  // 校验保存的位置是否在当前屏幕范围内（防止外接屏拔掉后窗口跑出屏幕）
  function isOnScreen(x, y) {
    // 至少要有 100px 的窗口在屏幕内才算有效
    return x + w > 100 && x < screenWidth - 100 &&
           y > -100 && y < screenHeight - 100;
  }

  let x, y;
  if (savedX != null && savedY != null && isOnScreen(savedX, savedY)) {
    x = savedX;
    y = savedY;
  } else {
    x = defaultX;
    y = defaultY;
    // 清除无效的保存位置
    store.set('winX', null);
    store.set('winY', null);
  }

  mainWindow = new BrowserWindow({
    width: w,
    height: h,
    x: x,
    y: y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true);

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 关闭前保存位置
  mainWindow.on('close', () => {
    if (mainWindow) {
      const [wx, wy] = mainWindow.getPosition();
      store.set('winX', wx);
      store.set('winY', wy);
      store.set('winScale', winScale);
    }
  });
}

// === IPC: Context Menu ===
ipcMain.on('show-context-menu', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const pct = Math.round(winScale * 100);
  const menu = Menu.buildFromTemplate([
    { label: `桌面看板娘 — ${pct}%`, enabled: false },
    { type: 'separator' },
    {
      label: '缩放比例',
      submenu: [
        { label: '50%',  click: () => event.sender.send('context-menu-action', 'scale-50') },
        { label: '75%',  click: () => event.sender.send('context-menu-action', 'scale-75') },
        { label: '100%', click: () => event.sender.send('context-menu-action', 'scale-100') },
        { label: '125%', click: () => event.sender.send('context-menu-action', 'scale-125') },
        { label: '150%', click: () => event.sender.send('context-menu-action', 'scale-150') },
      ],
    },
    { type: 'separator' },
    { label: '重置位置', click: () => event.sender.send('context-menu-action', 'reset-position') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

// === IPC: Window Drag ===
ipcMain.on('window-move', (event, { deltaX, deltaY }) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + deltaX, y + deltaY);
});

// === IPC: Scale Window ===
ipcMain.on('window-scale', (event, scale) => {
  if (!mainWindow) return;
  winScale = scale;
  const baseW = 600;
  const baseH = 850;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setBounds({ width: Math.round(baseW * scale), height: Math.round(baseH * scale), x, y });
  event.sender.send('window-scale-changed', scale);
});

// === IPC: Reset Position ===
ipcMain.on('reset-position', () => {
  if (!mainWindow) return;
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const baseW = 600;
  const baseH = 850;
  const w = Math.round(baseW * winScale);
  const h = Math.round(baseH * winScale);
  mainWindow.setPosition(screenWidth - w - 40, screenHeight - h - 50);
});

// === App Lifecycle ===
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    app.quit();
  });
}
