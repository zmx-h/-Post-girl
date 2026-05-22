const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const Store = require('electron-store');

// === 顶层错误捕获（必须在任何其他代码之前） ===
process.on('uncaughtException', (err) => {
  console.error('[顶层异常]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[顶层Promise拒绝]', reason);
});
console.log('[主进程] main.js 开始执行');

console.log('[主进程] 硬件加速保持默认');

// 加载用户配置
const configPath = path.join(__dirname, '..', '..', 'config.json');
const configExamplePath = path.join(__dirname, '..', '..', 'config.example.json');
console.log('[主进程] 配置路径:', configPath);

let config;
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('[主进程] 配置加载成功');
} else {
  console.error('config.json 不存在！');
  if (fs.existsSync(configExamplePath)) {
    config = JSON.parse(fs.readFileSync(configExamplePath, 'utf8'));
    console.warn('已使用 config.example.json');
  } else {
    console.error('config.example.json 也不存在！');
    app.quit();
    return;
  }
}

console.log('[主进程] 初始化 electron-store...');
const store = new Store({
  defaults: {
    winX: null,
    winY: null,
    winScale: 1.0,
  },
});
console.log('[主进程] electron-store 初始化完成');

let mainWindow = null;
let winScale = store.get('winScale', 1.0);
console.log('[主进程] winScale:', winScale);
console.log('[主进程] 即将定义窗口函数和 IPC 处理器');

function createWindow() {
  console.log('[主进程] createWindow 开始执行');
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
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  console.log('[主进程] 窗口位置:', 100, 100, '尺寸:', w, h);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // 捕获渲染进程控制台日志
  mainWindow.webContents.on('console-message', (event, level, message) => {
    const prefix = level === 2 ? '[渲染错误]' : level === 3 ? '[渲染警告]' : '[渲染日志]';
    console.log(`${prefix} ${message}`);
  });
  mainWindow.webContents.on('unhandled-rejection', (_event, reason) => {
    console.error('[渲染Promise错误]', reason);
  });

  // 页面加载完成后主动显示
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[主进程] 页面加载完成');
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('ready-to-show', () => {
    console.log('[主进程] 窗口准备就绪');
  });

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

// === IPC: Resize Height ===
ipcMain.on('window-resize-height', (event, newHeight) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const baseW = config.window.baseWidth;
  const w = Math.round(baseW * winScale);
  mainWindow.setBounds({ width: w, height: Math.round(newHeight), x, y });
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

console.log('[主进程] 开始 App Lifecycle...');
// === App Lifecycle ===
app.requestSingleInstanceLock();

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
