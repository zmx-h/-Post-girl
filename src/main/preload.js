const { contextBridge, ipcRenderer } = require('electron');

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
});
