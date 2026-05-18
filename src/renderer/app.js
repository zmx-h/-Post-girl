// ============================================================
// 桌面 Live2D 看板娘 — 渲染进程
// ============================================================

const { Live2DModel } = PIXI.live2d;

const MODEL_URL = '../../assets/kalabiqiu/卡拉.model3.json';

const BUBBLE_TEXTS = [
  '诶嘿~', '怎么了？', '你好呀！', '❤', '别戳我~', '嘻嘻',
  '有什么事吗？', '加油哦！', '✨', '我在呢', '好无聊啊~',
  '戳戳戳！', '啊！', '嗯？', '今天也要开心哦', '♪',
];

let model = null;
let app = null;
let isDragging = false;
let dragStart = { sx: 0, sy: 0 };

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
  model.scale.set(0.18);  // 缩小以完整显示
  model.position.set(window.innerWidth / 2, window.innerHeight * 0.58);
  model.interactive = true;
  model.cursor = 'default';

  app.stage.addChild(model);

  setupDrag();
  setupGlobalEvents();
  startIdleTimer();
  console.log('Live2D 模型加载成功!');
}

// ============================================================
// 拖拽 — 用原生 DOM 事件，不依赖 PIXI 事件
// ============================================================
function setupDrag() {
  const canvas = document.getElementById('live2d-canvas');

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 只响应左键
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
  // 右键菜单
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.electronAPI.showContextMenu();
  });

  // 窗口大小变化
  window.addEventListener('resize', () => {
    if (app && app.renderer) {
      app.renderer.resize(window.innerWidth, window.innerHeight);
    }
  });

  // ---- 模型点击反应 ----
  model.on('hit', (hitAreas) => {
    const area = hitAreas[0] || 'body';
    try {
      if (area === 'Head') model.motion('flick_head');
      else model.motion('tap_body');
    } catch (e) {}
    showBubble(randomBubbleText());
  });
}

// ============================================================
// 对话气泡
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
      if (model && !isDragging) {
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
