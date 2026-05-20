// ============================================================
// 桌面 Live2D 看板娘 — 渲染进程 + AI 对话
// ============================================================

const { Live2DModel } = PIXI.live2d;

const MODEL_URL = '../../assets/kalabiqiu/卡拉.model3.json';

const BUBBLE_TEXTS = [
  '诶嘿~', '怎么了？', '你好呀！', '❤', '别戳我~', '嘻嘻',
  '有什么事吗？', '加油哦！', '✨', '我在呢', '好无聊啊~',
  '戳戳戳！', '啊！', '嗯？', '今天也要开心哦', '♪',
];

// 负面情绪关键词（治愈模式检测）
const NEGATIVE_KEYWORDS = [
  '烦', '累', '难过', '伤心', '哭', '崩溃', '无聊', '郁闷', 'emo',
  '不开心', '压力', '焦虑', '生气', '讨厌', '失败', '好难', '不想',
  '唉', '算了', '没意思', '好累', '心累', '难受', '迷茫', '孤独',
];

let model = null;
let app = null;
let isDragging = false;
let dragStart = { sx: 0, sy: 0 };

// ---- AI 对话状态 ----
let isChatMode = false;
let isWaitingReply = false;
let recentNegativeCount = 0;      // 连续负面消息计数
let greetTimerStarted = false;

// ============================================================
// PIXI 初始化
// ============================================================
async function initPixi() {
  app = new PIXI.Application({
    view: document.getElementById('live2d-canvas'),
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
}

// ============================================================
// 加载模型
// ============================================================
async function loadModel() {
  model = await Live2DModel.from(MODEL_URL);

  model.anchor.set(0.5, 0.5);
  model.scale.set(0.18);
  model.position.set(window.innerWidth / 2, window.innerHeight * 0.58);
  model.interactive = true;
  model.cursor = 'default';

  app.stage.addChild(model);

  setupDrag();
  setupGlobalEvents();
  setupChat();
  startIdleTimer();
  checkTimeGreeting();
  console.log('Live2D 模型加载成功! AI 对话已就绪');
}

// ============================================================
// 拖拽
// ============================================================
function setupDrag() {
  const canvas = document.getElementById('live2d-canvas');

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // 如果处于聊天模式，先退出
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
    greeting = '早安~前辈今天也要元气满满哦，灵梦泡了虚拟茶，请用 (´▽｀)ノ♪';
  } else if (hour >= 22 || hour < 2) {
    greeting = '唔…灵梦有点困了，但会陪前辈到睡着为止…呼啊~';
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
    // 停止等待动画
    const bubble = document.getElementById('ai-bubble');
    bubble.textContent = '';
    bubble.classList.remove('show');

    // 显示 AI 回复
    showAIBubble(reply);
    isWaitingReply = false;

    // 播放反应动作
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

  // 检查治愈模式
  if (checkHealingMode(text)) {
    recentNegativeCount = 0;
  }

  // 显示"思考中"
  const aiBubble = document.getElementById('ai-bubble');
  aiBubble.textContent = '…';
  aiBubble.style.left = '50%';
  aiBubble.style.top = '8%';
  aiBubble.classList.add('show');
  isWaitingReply = true;

  // 通过 IPC 发给主进程调用 DeepSeek API
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

  // 8 秒后自动消失
  clearTimeout(bubble._timeout);
  bubble._timeout = setTimeout(() => {
    bubble.classList.remove('show');
  }, 8000);
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
    model.scale.set(0.18 * scale);
    model.position.set(window.innerWidth / 2, window.innerHeight * 0.58);
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
