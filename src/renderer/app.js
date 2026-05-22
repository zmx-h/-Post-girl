// ============================================================
// 桌面 Live2D 看板娘 — 渲染进程 + AI 对话
// ============================================================

const { Live2DModel } = PIXI.live2d;

// ---- 调试日志 ----
function dbg(msg) {
  console.log(msg);
}
dbg('脚本开始执行');

// ---- 从配置读取参数 ----
const modelConfig = window.electronAPI.getModelConfig();
const charConfig = window.electronAPI.getCharacterConfig();
const chatConfig = window.electronAPI.getChatConfig();

if (modelConfig) dbg('模型路径: ' + modelConfig.path);
else dbg('警告: modelConfig 为空');

const MODEL_URL = modelConfig ? modelConfig.path : '../../assets/kalabiqiu/卡拉.model3.json';
const MODEL_SCALE = modelConfig ? modelConfig.scale : 0.18;
const MODEL_ANCHOR_X = modelConfig ? modelConfig.anchorX : 0.5;
const MODEL_ANCHOR_Y = modelConfig ? modelConfig.anchorY : 0.5;
const MODEL_POS_RATIO_X = modelConfig ? modelConfig.positionRatioX : 0.5;
const MODEL_POS_RATIO_Y = modelConfig ? modelConfig.positionRatioY : 0.5;
const BUBBLE_TEXTS = charConfig ? charConfig.bubbleTexts : [];
const NEGATIVE_KEYWORDS = charConfig ? charConfig.negativeKeywords : [];
const GREETING_MORNING = charConfig ? charConfig.greetingMorning : null;
const GREETING_NIGHT = charConfig ? charConfig.greetingNight : null;
const REPLY_DURATION = chatConfig ? chatConfig.replyDuration : 8000;

let model = null;
let app = null;
let isDragging = false;
let dragStart = { sx: 0, sy: 0 };

// ---- AI 对话状态 ----
let isChatMode = false;
let isWaitingReply = false;
let recentNegativeCount = 0;
let greetTimerStarted = false;

// ============================================================
// PIXI 初始化
// ============================================================
async function initPixi() {
  dbg('初始化 PIXI...');
  const canvas = document.getElementById('live2d-canvas');
  if (!canvas) { dbg('错误: 找不到 canvas 元素!'); return; }
  dbg('canvas 尺寸: ' + canvas.width + 'x' + canvas.height);
  app = new PIXI.Application({
    view: canvas,
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  dbg('PIXI 初始化完成');
}

// ============================================================
// 加载模型
// ============================================================
async function loadModel() {
  dbg('正在加载模型: ' + MODEL_URL);
  try {
    model = await Live2DModel.from(MODEL_URL);
    dbg('模型加载成功');

    model.anchor.set(MODEL_ANCHOR_X, MODEL_ANCHOR_Y);
    model.scale.set(MODEL_SCALE);
    model.position.set(window.innerWidth * MODEL_POS_RATIO_X, window.innerHeight * MODEL_POS_RATIO_Y);
    model.interactive = true;
    model.cursor = 'default';

    app.stage.addChild(model);

    setupDrag();
    setupResizeHandle();
    setupGlobalEvents();
    setupChat();
    startIdleTimer();
    checkTimeGreeting();
    dbg('Live2D 模型加载成功! AI 对话已就绪');
  } catch (err) {
    const errMsg = '模型加载失败: ' + (err.message || err);
    dbg(errMsg);
    console.error('模型加载失败:', err);
    document.getElementById('reaction-bubble').textContent = errMsg;
    document.getElementById('reaction-bubble').classList.add('show');
  }
}

// ============================================================
// 拖拽
// ============================================================
function setupDrag() {
  const canvas = document.getElementById('live2d-canvas');

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (isChatMode) exitChatMode();
    isDragging = false;
    dragStart = { sx: e.screenX, sy: e.screenY };
  });

  document.addEventListener('mousemove', (e) => {
    if (dragStart.sx === 0 && dragStart.sy === 0) return;

    const dx = e.screenX - dragStart.sx;
    const dy = e.screenY - dragStart.sy;

    if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      isDragging = true;
    }

    if (isDragging) {
      window.electronAPI.moveWindow(dx, dy);
      dragStart = { sx: e.screenX, sy: e.screenY };
    }
  });

  document.addEventListener('mouseup', () => {
    dragStart = { sx: 0, sy: 0 };
    isDragging = false;
  });
}

// ============================================================
// 顶部边缘调整窗口大小
// ============================================================
function setupResizeHandle() {
  const handle = document.getElementById('resize-top');
  if (!handle) return;
  let resizing = false;
  let resizeStart = { sy: 0, startY: 0, startH: 0 };

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    resizing = true;
    resizeStart = { sy: e.screenY, startY: e.screenY, startH: window.innerHeight };
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dy = resizeStart.sy - e.screenY;
    const newH = Math.max(200, resizeStart.startH + dy);
    window.electronAPI.resizeWindow(newH);
    resizeStart.sy = e.screenY;
  });

  document.addEventListener('mouseup', () => {
    resizing = false;
  });
}

// ============================================================
// 全局事件
// ============================================================
function setupGlobalEvents() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.electronAPI.showContextMenu();
  });

  window.addEventListener('resize', () => {
    if (app && app.renderer) {
      app.renderer.resize(window.innerWidth, window.innerHeight);
    }
  });

  // 模型点击 → 进入聊天模式
  model.on('hit', (hitAreas) => {
    if (isDragging || isChatMode) return;
    const area = hitAreas[0] || 'body';
    try {
      if (area === 'Head') model.motion('flick_head');
      else model.motion('tap_body');
    } catch (e) {}
    enterChatMode();
  });

  // 点击模型但没有 hit（空白区点击也算）→ 也可进入聊天
  model.on('pointertap', () => {
    if (isDragging) return;
    setTimeout(() => {
      if (!isDragging && !isChatMode) enterChatMode();
    }, 150);
  });
}

// ============================================================
// 时段问候
// ============================================================
function checkTimeGreeting() {
  if (greetTimerStarted) return;
  greetTimerStarted = true;

  const hour = new Date().getHours();
  let greeting = null;

  if (hour >= 6 && hour < 9) {
    greeting = GREETING_MORNING;
  } else if (hour >= 22 || hour < 2) {
    greeting = GREETING_NIGHT;
  }

  if (greeting) {
    setTimeout(() => showBubble(greeting), 3000);
  }
}

// ============================================================
// 治愈模式检测
// ============================================================
function checkHealingMode(text) {
  const lower = text.toLowerCase();
  const isNegative = NEGATIVE_KEYWORDS.some(kw => lower.includes(kw));

  if (isNegative) {
    recentNegativeCount++;
  } else {
    recentNegativeCount = Math.max(0, recentNegativeCount - 1);
  }

  return recentNegativeCount >= 3;
}

// ============================================================
// Chat 设置
// ============================================================
function setupChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  // 发送按钮
  sendBtn.addEventListener('click', () => sendChatMessage());

  // 回车发送
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
    if (e.key === 'Escape') exitChatMode();
  });

  // 点击输入框外 → 退出聊天
  document.addEventListener('click', (e) => {
    if (isChatMode && !e.target.closest('#chat-input-area') && !e.target.closest('#live2d-canvas')) {
      exitChatMode();
    }
  });

  // 接收 AI 回复
  window.electronAPI.onChatReply((reply) => {
    const bubble = document.getElementById('ai-bubble');
    bubble.textContent = '';
    bubble.classList.remove('show');

    showAIBubble(reply);
    isWaitingReply = false;

    try { model.motion('tap_body'); } catch (e) {}
  });
}

function enterChatMode() {
  if (isChatMode) return;
  isChatMode = true;
  const area = document.getElementById('chat-input-area');
  const input = document.getElementById('chat-input');
  area.classList.add('active');
  input.value = '';
  input.focus();
}

function exitChatMode() {
  isChatMode = false;
  isWaitingReply = false;
  document.getElementById('chat-input-area').classList.remove('active');
  document.getElementById('chat-input').value = '';
  document.getElementById('ai-bubble').classList.remove('show');
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || isWaitingReply) return;

  input.value = '';

  if (checkHealingMode(text)) {
    recentNegativeCount = 0;
  }

  const aiBubble = document.getElementById('ai-bubble');
  aiBubble.textContent = '…';
  aiBubble.style.left = '50%';
  aiBubble.style.top = '8%';
  aiBubble.classList.add('show');
  isWaitingReply = true;

  window.electronAPI.sendChat(text);
}

// ============================================================
// AI 回复气泡（长时间显示）
// ============================================================
function showAIBubble(text) {
  const bubble = document.getElementById('ai-bubble');
  if (!bubble) return;
  bubble.textContent = text;
  bubble.style.left = '50%';
  bubble.style.top = '8%';
  bubble.classList.add('show');

  clearTimeout(bubble._timeout);
  bubble._timeout = setTimeout(() => {
    bubble.classList.remove('show');
  }, REPLY_DURATION);
}

// ============================================================
// 短语气泡
// ============================================================
function showBubble(text) {
  const bubble = document.getElementById('reaction-bubble');
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.remove('show');
  bubble.style.left = '50%';
  bubble.style.top = '10%';
  void bubble.offsetWidth;
  bubble.classList.add('show');
}

function randomBubbleText() {
  if (!BUBBLE_TEXTS.length) return '诶嘿~';
  return BUBBLE_TEXTS[Math.floor(Math.random() * BUBBLE_TEXTS.length)];
}

// ============================================================
// 待机动作
// ============================================================
function startIdleTimer() {
  function scheduleNext() {
    setTimeout(() => {
      if (model && !isDragging && !isWaitingReply) {
        try { model.motion('idle_01'); } catch (e) {}
      }
      scheduleNext();
    }, 12000 + Math.random() * 18000);
  }
  scheduleNext();
}

// ============================================================
// 右键菜单
// ============================================================
window.electronAPI.onContextMenuAction((action) => {
  switch (action) {
    case 'scale-50':  window.electronAPI.scaleWindow(0.5); break;
    case 'scale-75':  window.electronAPI.scaleWindow(0.75); break;
    case 'scale-100': window.electronAPI.scaleWindow(1.0); break;
    case 'scale-125': window.electronAPI.scaleWindow(1.25); break;
    case 'scale-150': window.electronAPI.scaleWindow(1.5); break;
    case 'reset-position':
      window.electronAPI.resetPosition();
      break;
  }
});

window.electronAPI.onWindowScaleChanged((scale) => {
  if (model) {
    model.scale.set(MODEL_SCALE * scale);
    model.position.set(window.innerWidth * MODEL_POS_RATIO_X, window.innerHeight * MODEL_POS_RATIO_Y);
  }
});

// ============================================================
// 启动
// ============================================================
async function start() {
  await initPixi();
  await loadModel();
}

start().catch((err) => console.error('启动失败:', err));
