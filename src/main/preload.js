const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// 加载配置（供渲染进程使用）
function loadConfig() {
  const configPath = path.join(__dirname, '..', '..', 'config.json');
  const configExamplePath = path.join(__dirname, '..', '..', 'config.example.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  if (fs.existsSync(configExamplePath)) {
    return JSON.parse(fs.readFileSync(configExamplePath, 'utf8'));
  }
  return null;
}

const config = loadConfig();

contextBridge.exposeInMainWorld('electronAPI', {
  showContextMenu: () => ipcRenderer.send('show-context-menu'),

  onContextMenuAction: (callback) =>
    ipcRenderer.on('context-menu-action', (_event, action) => callback(action)),

  moveWindow: (deltaX, deltaY) =>
    ipcRenderer.send('window-move', { deltaX, deltaY }),

  scaleWindow: (scale) =>
    ipcRenderer.send('window-scale', scale),

  onWindowScaleChanged: (callback) =>
    ipcRenderer.on('window-scale-changed', (_event, scale) => callback(scale)),

  resetPosition: () => ipcRenderer.send('reset-position'),

  // ---- AI 对话 ----
  sendChat: (message) => ipcRenderer.send('chat-send', message),

  onChatReply: (callback) =>
    ipcRenderer.on('chat-reply', (_event, reply) => callback(reply)),

  // ---- 配置（只暴露渲染进程需要的部分） ----
  getModelConfig: () => {
    if (!config) return null;
    // 将模型路径解析为绝对路径（相对于项目根目录）
    const relPath = config.model.path;
    const absPath = path.isAbsolute(relPath)
      ? relPath
      : path.resolve(__dirname, '..', '..', relPath);
    // 转为 file:// URL（正确编码中文等字符）
    const fileUrl = pathToFileURL(absPath).href;
    return {
      path: fileUrl,
      scale: config.model.scale,
      anchorX: config.model.anchor.x,
      anchorY: config.model.anchor.y,
      positionRatioX: config.model.positionRatio.x,
      positionRatioY: config.model.positionRatio.y,
    };
  },

  getCharacterConfig: () => {
    if (!config) return null;
    return {
      name: config.character.name,
      greetingMorning: config.character.greetingMorning,
      greetingNight: config.character.greetingNight,
      bubbleTexts: config.character.bubbleTexts,
      negativeKeywords: config.character.negativeKeywords,
    };
  },

  getChatConfig: () => {
    if (!config) return null;
    return {
      replyDuration: config.chat.replyDuration,
      inputMaxLength: config.chat.inputMaxLength,
    };
  },
});
