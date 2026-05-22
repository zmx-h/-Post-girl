# 桌面 Live2D 看板娘 — 项目架构

## 概述

基于 Electron + PIXI.js + pixi-live2d-display 的 Windows 桌面虚拟角色应用。在桌面上渲染一个 Live2D 模型，支持动画、拖拽、AI 对话和缩放。接入 DeepSeek V4 API，角色以"灵梦"身份进行口语化闲聊。

## 技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Electron | ^31 | 桌面窗口框架：透明、无边框、置顶 |
| PIXI.js | 6.5.10 | WebGL 2D 渲染引擎 |
| pixi-live2d-display | 0.4.0 | PIXI 插件，负责加载和渲染 Live2D 模型 |
| Live2D Cubism SDK | 4.2.2 | 官方核心库，驱动模型骨骼动画/物理/眨眼 |
| electron-store | ^8.2 | 键值存储，持久化窗口位置和缩放比例 |
| DeepSeek API | v4 (deepseek-chat) | AI 对话引擎，OpenAI 兼容格式 |
| Node.js https | built-in | 主进程发起 HTTPS 请求调用 DeepSeek API |

## 项目结构

```
virtual_hostess/
├── package.json              # 项目配置和依赖
├── .gitignore
├── README.md                 # 项目文档
├── ARCHITECTURE.md           # 本文档
├── config.example.json       # 配置模板（提交到 git）
├── config.json               # 用户配置（已 .gitignore，含 API key）
├── public/                   # 静态库文件（本地引用）
│   ├── live2dcubismcore.min.js   # Cubism 4 核心库
│   ├── pixi.min.js               # PIXI.js v6 浏览器构建
│   └── cubism4.min.js            # pixi-live2d-display Cubism 4 捆绑包
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── main.js           # 入口：窗口创建、IPC、API 调用、生命周期
│   │   └── preload.js        # contextBridge：安全暴露 API 给渲染进程
│   └── renderer/             # 渲染进程（浏览器环境）
│       ├── index.html        # HTML 壳，引入所有脚本
│       └── app.js            # 核心逻辑：PIXI 初始化、模型加载、交互
└── assets/                   # Live2D 模型文件（可选本地模型）
```

## 架构设计

### 进程模型

```
┌─────────────────────────────────────────────────┐
│                   Main Process                    │
│  main.js                                          │
│  - 创建透明无边框置顶 BrowserWindow                 │
│  - 处理 IPC：拖拽移动、右键菜单、窗口缩放           │
│  - 通过 electron-store 持久化设置                  │
│  - 单实例锁，防止重复启动                          │
└──────────────┬──────────────────────────────────┘
               │  IPC (ipcMain / ipcRenderer)
               │  preload.js: contextBridge
┌──────────────▼──────────────────────────────────┐
│                 Renderer Process                  │
│  index.html + app.js                              │
│  - PIXI.Application (WebGL, 透明背景)             │
│  - pixi-live2d-display 加载 .model3.json         │
│  - 模型交互：hit 事件、拖拽、待机动作              │
│  - 对话气泡 UI                                    │
└─────────────────────────────────────────────────┘
```

### 窗口配置

```js
new BrowserWindow({
  transparent: true,       // 透明背景
  frame: false,            // 无边框
  alwaysOnTop: true,       // 始终置顶
  skipTaskbar: true,       // 不在任务栏显示
  backgroundColor: '#00000000',  // 完全透明
})
```

### IPC 通道

| 通道 | 方向 | 用途 |
|---|---|---|
| `show-context-menu` | Renderer → Main | 弹出原生右键菜单 |
| `context-menu-action` | Main → Renderer | 通知菜单选择结果 |
| `window-move` | Renderer → Main | 拖拽移动窗口 |
| `window-scale` | Renderer → Main | 改变窗口/模型缩放 |
| `window-scale-changed` | Main → Renderer | 通知缩放已变更 |
| `reset-position` | Renderer → Main | 重置到默认位置 |
| `chat-send` | Renderer → Main | 发送用户消息 → 主进程调用 DeepSeek API |
| `chat-reply` | Main → Renderer | 返回 AI 回复文本 |

### AI 对话流程

```
用户点击角色 → 进入聊天模式 → 底部出现输入框
    │
用户输入文字 + 回车
    │
    ▼
Renderer (app.js)                 Main (main.js)
    │                                  │
    ├─ chat-send ──────────────────→   │
    │                                  ├─ System Prompt (灵梦人设)
    │                                  ├─ POST https://api.deepseek.com/v1/chat/completions
    │                                  │   model: deepseek-chat
    │                                  │   max_tokens: 200, temperature: 0.9
    │                                  │
    │  ← ── chat-reply ───────────── │
    │                                  │
    ├─ showAIBubble(reply)             │
    └─ 8秒后自动消失
```

### Live2D 渲染流程

```
index.html
  ├── <script> live2dcubismcore.min.js  // Cubism 4 核心
  ├── <script> pixi.min.js              // PIXI.js v6
  ├── <script> cubism4.min.js           // pixi-live2d-display
  └── <script> app.js
        │
        ├── new PIXI.Application({ backgroundAlpha: 0 })
        │
        └── Live2DModel.from('haru_greeter_t03.model3.json')
              │
              ├── 下载 .model3.json（入口）
              ├── 下载 .moc3（模型数据）
              └── 下载 textures/（贴图）
                    │
                    └── model → app.stage
                          ├── 自动眨眼（EyeBlink）
                          ├── 自动呼吸（Breath）
                          ├── 物理模拟（Physics）
                          └── 鼠标跟踪（Tracking）
```

### 交互实现

- **拖拽**：原生 DOM `mousedown` → `mousemove` 计算 `screenX/screenY` 偏移 → IPC 通知主进程移动窗口
- **点击反应**：PIXI `model.on('hit')` 检测点击部位 → 播放对应动作 (`tap_body`/`flick_head`) → 弹出对话气泡
- **右键菜单**：`contextmenu` 事件 → IPC → 主进程 `Menu.buildFromTemplate` → 原生菜单
- **待机动作**：`setTimeout` 循环，每 12-30 秒随机播放 `idle_01` 动作

## 配置系统

所有可配置项集中在 `config.json`（在 `.gitignore` 中排除，不提交到 git）:

- **API 设置**: key, url, model, maxTokens, temperature, timeout
- **窗口设置**: baseWidth, baseHeight, defaultMarginRight, defaultMarginBottom
- **模型设置**: path, scale, anchor, positionRatio
- **角色设置**: name, systemPrompt, greetingMorning/Night, bubbleTexts, negativeKeywords
- **聊天设置**: replyDuration, inputMaxLength

详见 `config.example.json`（提交到 git 的配置模板）。

## 关键设计决策

### 为什么用原生 DOM 事件而不是 PIXI 事件做拖拽？

PIXI 交互事件的 `e.data.originalEvent` 在不同版本的 pixi-live2d-display 中结构不一致，容易导致坐标 NaN。原生 DOM 的 `screenX/screenY` 更可靠。

### 为什么基础窗口是 600×850？

当前模型宽高比约为 2:3，600×850 能完整容纳角色全身，避免头脚裁切。
可在 `config.json` 的 `window.baseWidth/baseHeight` 中调整。

### 为什么不使用动态 click-through？

透明窗口的像素级点击穿透需要复杂的碰撞检测。保持窗口始终可交互更稳定，代价是窗口区域内的桌面图标不可点击。
