const { app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const repair = require('./repair')
const github = require('./github')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'DSH Repair Workstation',
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, payload) => {
    try {
      return { ok: true, data: await fn(payload || {}) }
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? error.message : String(error),
      }
    }
  })
}

handle('system:info', () => repair.detect())
handle('repair:run', ({ kind, options }) => repair.runRepair(kind, options))

handle('forum:list', async () => ({
  repo: github.repo(),
  write: github.hasWriteToken(),
  issues: await github.listIssues(),
}))

handle('forum:comments', ({ number }) => github.listComments(number))

handle('forum:create', async ({ title, body }) => {
  const issue = await github.createIssue({ title, body })
  return {
    issue,
    repo: github.repo(),
  }
})

handle('forum:reply', async ({ number, body }) => {
  const comment = await github.createReply(number, body)
  return { comment }
})

handle('forum:settings:get', () => github.readSettings())
handle('forum:settings:save', ({ settings }) => github.saveSettings(settings))

handle('shell:open', ({ target }) => {
  if (!target) return false
  shell.openExternal(String(target))
  return true
})

handle('clipboard:write', ({ text }) => {
  clipboard.writeText(String(text || ''))
  return true
})

handle('app:open-deepseek', () => {
  const target = repair.findDshApp()
  if (target) shell.openPath(target)
  return Boolean(target)
})

handle('repair:make-installer', async ({ format = 'zip' }) => {
  if (process.platform !== 'darwin') {
    return {
      status: 'unsupported',
      message: '当前平台暂不支持自动生成 macOS 安装包。',
    }
  }

  const appRoot = repair.APP_ROOT
  if (!repair.exists(appRoot)) {
    return {
      status: 'missing',
      message: '未找到 /Applications/DeepSeek Harness.app',
    }
  }

  const outputDir = path.join(app.getPath('downloads'), 'DSH-Repair-Output')
  fs.mkdirSync(outputDir, { recursive: true })
  const timestamp = repair.now()
  const zipPath = path.join(outputDir, `DeepSeek-Harness-${timestamp}.zip`)

  await new Promise((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appRoot, zipPath], (error) => {
      if (error) reject(error)
      else resolve()
    })
  })

  shell.showItemInFolder(zipPath)
  return {
    status: 'ok',
    message: '已生成 macOS 版 DeepSeek Harness 安装包。',
    path: zipPath,
  }
})

app.on('will-quit', () => {
  ipcMain.removeHandler('system:info')
  ipcMain.removeHandler('repair:run')
  ipcMain.removeHandler('forum:list')
  ipcMain.removeHandler('forum:comments')
  ipcMain.removeHandler('forum:create')
  ipcMain.removeHandler('forum:reply')
})
