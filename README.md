# 桌面 Live2D 看板娘

一个基于 Electron + PIXI.js 的桌面虚拟角色应用。在桌面上渲染一个 Live2D 模型，支持拖拽、缩放、AI 对话。

## 功能特性

- **Live2D 模型渲染** — 加载任意 Live2D Cubism 4 模型，支持物理效果、自动眨眼、呼吸动画
- **AI 智能对话** — 接入 DeepSeek API，角色会以设定的人设与你闲聊
- **桌面拖拽** — 按住角色拖到桌面任意位置
- **缩放调节** — 右键菜单调整角色大小（50% ~ 150%）
- **位置记忆** — 关闭后自动保存位置和缩放比例
- **时段问候** — 早上和深夜自动问候
- **治愈模式** — 检测到负面情绪时自动切换暖心语气
- **表情动作** — 点击角色触发对应互动动作

## 环境要求

- Windows 10 / Windows 11
- Node.js 18+

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/zmx-h/-Post-girl.git
cd Post-girl

# 2. 安装依赖（国内用户可设置镜像加速）
#    Windows PowerShell: $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
#    Windows CMD:        set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install

# 3. 配置（首次使用需要）
#    复制 config.example.json 为 config.json，填写你的 DeepSeek API key
cp config.example.json config.json

# 4. 放置模型文件
#    将你的 Live2D 模型放入 assets/ 目录下

# 5. 启动
npm start
```

## 配置说明

项目的所有可配置项集中在 `config.json` 中（注意是 `config.json`，不是 `config.example.json`）。

### 完整配置项

```jsonc
{
  "api": {
    "key": "sk-你的DeepSeek API密钥",  // 必填，AI 对话需要
    "url": "api.deepseek.com",         // API 地址
    "model": "deepseek-chat",          // 模型名称
    "maxTokens": 200,                  // 每次回复最大字数
    "temperature": 0.9,                // 回复随机性（0~1，越大越随机）
    "timeout": 15000                   // API 请求超时时间（毫秒）
  },
  "window": {
    "baseWidth": 600,                  // 窗口基础宽度
    "baseHeight": 850,                 // 窗口基础高度
    "defaultMarginRight": 40,          // 默认右下角距右边缘距离
    "defaultMarginBottom": 50,         // 默认右下角距下边缘距离
    "screenEdgeThreshold": 100         // 窗口边缘检测阈值（防止跑出屏幕）
  },
  "model": {
    "path": "./assets/kalabiqiu/卡拉.model3.json",  // 模型入口文件路径
    "scale": 0.18,                    // 模型显示大小（根据模型调整）
    "anchor": { "x": 0.5, "y": 0.5 }, // 模型锚点（0~1）
    "positionRatio": { "x": 0.5, "y": 0.58 }  // 在窗口中的位置比例
  },
  "character": {
    "name": "灵梦",                    // 角色名字
    "greetingMorning": "早安~...",     // 早安问候语
    "greetingNight": "唔…灵梦有点困了...",  // 深夜问候语
    "bubbleTexts": ["诶嘿~", ...],     // 点击时的短语气泡
    "negativeKeywords": ["烦", "累", ...],  // 负面情绪关键词
    "systemPrompt": "你是'灵梦'..."    // AI 角色人设提示词
  },
  "chat": {
    "replyDuration": 8000,            // AI 回复气泡显示时长（毫秒）
    "inputMaxLength": 200             // 输入框最大字数
  }
}
```

### 如何获取 DeepSeek API Key

1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 注册账号并登录
3. 在 API Keys 页面创建新的 API Key
4. 复制 key 填入 `config.json` 的 `api.key` 字段

> **注意**：`config.json` 包含你的 API 密钥，已加入 `.gitignore`，不会提交到 Git。请勿将密钥直接写在代码中。

## 替换模型

本项目支持任意 **Live2D Cubism 4** 模型，替换步骤：

### 方法一：替换目录（推荐）

如果模型文件结构与当前相同：

```bash
# 将你的模型文件夹放入 assets/ 下
# 例如：assets/你的模型/你的模型.model3.json

# 然后修改 config.json 中的 model.path
```

```json
{
  "model": {
    "path": "./assets/你的模型/你的模型.model3.json"
  }
}
```

### 方法二：覆盖文件

直接将你的模型文件覆盖到 `assets/kalabiqiu/` 目录下，保持文件名一致。

### 调整模型显示

替换模型后可能需要调整这些参数：

| 参数 | 作用 | 典型值 |
|------|------|--------|
| `model.scale` | 模型大小 | 0.1 ~ 0.5（根据模型尺寸调整） |
| `model.positionRatio.y` | 模型在窗口中的垂直位置 | 0.5 ~ 0.7（越大越靠下） |
| `window.baseWidth/baseHeight` | 窗口大小 | 根据模型比例调整 |

### Live2D 模型资源

Live2D 模型文件一般包含以下内容：

- `.model3.json` — 模型入口配置文件
- `.moc3` — 模型骨骼/网格数据
- `texture_*.png` — 模型贴图
- `.physics3.json` — 物理效果（头发飘动等）
- `.cdi3.json` — 显示信息
- `.exp3.json` — 表情文件
- `.motion3.json` — 动作文件

> **注意**：模型文件通常较大（几十 MB），已在 `.gitignore` 中忽略。你需要自行下载或复制模型文件。

## 操作说明

| 操作 | 效果 |
|------|------|
| **点击角色** | 进入 AI 聊天模式，底部出现输入框 |
| **输入文字 + 回车** | 发送消息给看板娘，等待 AI 回复 |
| **Esc / 点击空白处** | 退出聊天模式 |
| **按住拖拽** | 移动角色到桌面任意位置 |
| **右键** | 弹出缩放/重置/退出菜单 |

### 启动参数

```bash
# 正常启动
npm start

# 开发者模式（打开 DevTools）
npm run dev
```

## 常见问题

**Q: 角色显示不完整？**
A: 右键菜单中调小缩放比例，或在 `config.json` 中调整 `window.baseWidth/baseHeight`。

**Q: AI 对话没反应？**
A: 检查 `config.json` 中的 `api.key` 是否填写正确，以及网络是否连通。

**Q: 模型加载失败？**
A: 检查 `config.json` 中的 `model.path` 路径是否正确，模型文件是否存在。

**Q: 如何修改角色的人设？**
A: 修改 `config.json` 中 `character.systemPrompt` 字段，这是 AI 的角色提示词。

**Q: 开机自启？**
A: 创建快捷方式，放入 `Win+R` → `shell:startup` 目录。

## 项目结构

```
├── config.example.json      # 配置模板（提交到 git）
├── config.json              # 用户配置（已 .gitignore，含 API key）
├── package.json             # 依赖和启动脚本
├── .gitignore               # Git 忽略规则
├── README.md                # 本文件
├── public/                  # 第三方库文件
│   ├── live2dcubismcore.min.js  # Cubism 4 核心库
│   ├── pixi.min.js              # PIXI.js
│   └── cubism4.min.js           # pixi-live2d-display
├── src/
│   ├── main/
│   │   ├── main.js          # Electron 主进程
│   │   └── preload.js       # 安全桥接
│   └── renderer/
│       ├── index.html       # 页面
│       └── app.js           # 渲染逻辑
└── assets/                  # Live2D 模型（已 .gitignore）
```

## 技术栈

- **Electron** — 桌面窗口框架
- **PIXI.js** — WebGL 2D 渲染引擎
- **pixi-live2d-display** — Live2D 模型加载插件
- **Live2D Cubism SDK 4** — 官方模型驱动
- **DeepSeek API** — AI 对话引擎
- **electron-store** — 本地配置持久化
