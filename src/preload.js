const { contextBridge, ipcRenderer } = require('electron')

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload)
}

contextBridge.exposeInMainWorld('dshWorkstation', {
  systemInfo: () => invoke('system:info'),
  runRepair: (kind, options) => invoke('repair:run', { kind, options }),
  forumList: () => invoke('forum:list'),
  forumComments: (number) => invoke('forum:comments', { number }),
  forumCreate: (title, body) => invoke('forum:create', { title, body }),
  forumReply: (number, body) => invoke('forum:reply', { number, body }),
  forumSettingsGet: () => invoke('forum:settings:get'),
  forumSettingsSave: (settings) => invoke('forum:settings:save', { settings }),
  openExternal: (target) => invoke('shell:open', { target }),
  writeClipboard: (text) => invoke('clipboard:write', { text }),
  openDeepSeek: () => invoke('app:open-deepseek'),
  makeInstaller: (format) => invoke('repair:make-installer', { format }),
})
