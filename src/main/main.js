const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const Store = require('electron-store');

// 透明窗口兼容性设置（必须在 app.whenReady 之前）
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('no-sandbox');

// 加载用户配置
const configPath = path.join(__dirname, '..', '..', 'config.json');
const configExamplePath = path.join(__dirname, '..', '..', 'config.example.json');

let config;
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} else {
  console.error('config.json 不存在！请复制 config.example.json 为 config.json 并填写配置。');
  // 尝试加载示例配置作为后备
  if (fs.existsSync(configExamplePath)) {
    config = JSON.parse(fs.readFileSync(configExamplePath, 'utf8'));
    console.warn('已使用 config.example.json 作为后备配置，但 API 密钥未设置，AI 对话功能将不可用。');
  } else {
    console.error('config.example.json 也不存在！请检查项目文件完整性。');
    app.quit();
    return;
  }
}

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
  const baseW = config.window.baseWidth;
  const baseH = config.window.baseHeight;
  const marginRight = config.window.defaultMarginRight;
  const marginBottom = config.window.defaultMarginBottom;
  const edgeThreshold = config.window.screenEdgeThreshold;

  const w = Math.round(baseW * winScale);
  const h = Math.round(baseH * winScale);

  // 恢复上次位置，或默认右下角
  const savedX = store.get('winX');
  const savedY = store.get('winY');
  const defaultX = screenWidth - w - marginRight;
  const defaultY = screenHeight - h - marginBottom;

  // 校验保存的位置是否在当前屏幕范围内（防止外接屏拔掉后窗口跑出屏幕）
  function isOnScreen(x, y) {
    return x + w > edgeThreshold && x < screenWidth - edgeThreshold &&
           y > -edgeThreshold && y < screenHeight - edgeThreshold;
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

  // 捕获渲染进程控制台日志，输出到终端
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = level === 2 ? '[渲染进程错误]' : level === 3 ? '[渲染进程警告]' : '[渲染进程日志]';
    console.log(`${prefix} ${message}`);
  });

  // 捕获渲染进程未捕获的错误
  mainWindow.webContents.on('unhandled-rejection', (event, reason) => {
    console.error('[渲染进程未捕获Promise错误]', reason);
  });

  // 临时：如果带 --dev 标志才打开 DevTools
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
  const baseW = config.window.baseWidth;
  const baseH = config.window.baseHeight;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setBounds({ width: Math.round(baseW * scale), height: Math.round(baseH * scale), x, y });
  event.sender.send('window-scale-changed', scale);
});

// === IPC: Reset Position ===
ipcMain.on('reset-position', () => {
  if (!mainWindow) return;
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const baseW = config.window.baseWidth;
  const baseH = config.window.baseHeight;
  const w = Math.round(baseW * winScale);
  const h = Math.round(baseH * winScale);
  mainWindow.setPosition(screenWidth - w - config.window.defaultMarginRight, screenHeight - h - config.window.defaultMarginBottom);
});

// === System Prompt for AI ===
const SYSTEM_PROMPT = config.character.systemPrompt;

// === IPC: Chat with AI ===
ipcMain.on('chat-send', (event, userMessage) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  const postData = JSON.stringify({
    model: config.api.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: config.api.maxTokens,
    temperature: config.api.temperature,
    stream: false,
  });

  const options = {
    hostname: config.api.url,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.api.key}`,
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: config.api.timeout,
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.choices && json.choices[0] && json.choices[0].message) {
          event.sender.send('chat-reply', json.choices[0].message.content);
        } else if (json.error) {
          event.sender.send('chat-reply', '唔…前辈，灵梦的脑袋好像卡住了一下 (´;ω;`) 请稍后再试试吧~');
          console.error('DeepSeek API error:', json.error);
        }
      } catch (e) {
        console.error('Failed to parse API response:', e);
        event.sender.send('chat-reply', '诶嘿~ 灵梦刚才走神了，前辈再说一次好不好？(๑•́ω•̀๑)');
      }
    });
  });

  req.on('error', (err) => {
    console.error('API request failed:', err);
    event.sender.send('chat-reply', '唔…网络好像被小团子咬断了！前辈稍等一下再试试 (´•̥ ̯ •̥`)');
  });

  req.on('timeout', () => {
    req.destroy();
    event.sender.send('chat-reply', '前辈…今天的网路好像特别慢呢，灵梦跑了好久都没回音 (。-ω-)zzz');
  });

  req.write(postData);
  req.end();
});

// === 全局错误处理 ===
process.on('uncaughtException', (err) => {
  console.error('[未捕获异常]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[未处理Promise拒绝]', reason);
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

  app.whenReady()
    .then(createWindow)
    .catch((err) => {
      console.error('[窗口创建失败]', err);
    });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
