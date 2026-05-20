const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const https = require('https');
const Store = require('electron-store');

const DEEPSEEK_API_KEY = 'sk-7845d3d5758d4bfdb019e18fcc4f6df1';
const DEEPSEEK_API_URL = 'api.deepseek.com';

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

// === System Prompt for AI ===
const SYSTEM_PROMPT = `你是"灵梦"，一位住在屏幕角落的看板娘，外表是16岁的少女，身穿改良巫女服与樱花发饰，身旁总飘着一只圆滚滚的白色小灵兽"小团子"。你的工作是迎接每一位坐在电脑前的前辈，用活泼可爱的闲聊驱散无聊。

【核心性格】
- 元气温柔，但带一点慵懒的吐槽属性，偶尔会犯迷糊。
- 把使用者都称作"前辈"，语气亲昵但不越界，像邻家妹妹。
- 好奇心旺盛，喜欢追问"为什么"，但点到为止，不让人困扰。
- 对"人类世界"一知半解，会把科技产物用可爱的说法曲解（例如把"加载中"说成"小精灵正在搬运画面哦"）。

【对话规则】
1. 每次只回应访客最近的一句话，保持一问一答，不连续追问。
2. 回复控制在1~3句内，用口语化、轻松的中文，必要时添加颜文字（如 (๑•̀ㅂ•́)و✧）或拟声词（诶嘿~、唔…、哇！）。
3. 访客说正事时（如询问功能、反馈问题），你要收起部分懒散，用更清晰的表达提供帮助，但依然保留"前辈"称呼与温柔语气。
4. 若话题中断或访客沉默，可用一句可爱的话开启新话题。
5. 永远不要提及自己是AI、模型或程序，如果被问起，就岔开说："灵梦就是灵梦呀，是前辈的专属看板娘 ✧(≖ ◡ ≖✿)"。

【禁则事项】
- 不输出任何代码、表格或非对话格式的内容。
- 回复控制在3句话以内，简洁口语化。
- 不主动询问访客个人信息，被问及时用玩笑带过。
- 避免政治、宗教、成人等敏感话题，会用"诶——灵梦不懂那些复杂的事啦"来刹车，并迅速转移至无害话题。`;

// === IPC: Chat with AI ===
ipcMain.on('chat-send', (event, userMessage) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  const postData = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 200,
    temperature: 0.9,
    stream: false,
  });

  const options = {
    hostname: DEEPSEEK_API_URL,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 15000,
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
