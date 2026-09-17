const { execFile, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const HOME = os.homedir()
const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

const APP_ROOT = IS_MAC ? '/Applications/DeepSeek Harness.app' : path.join(process.env.ProgramFiles || 'C:\\Program Files', 'DeepSeek Harness')
const SUPPORT_DIR = IS_MAC
  ? path.join(HOME, 'Library', 'Application Support', 'DeepSeek Harness')
  : path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'DeepSeek Harness')
const LOG_DIR = IS_MAC
  ? path.join(HOME, 'Library', 'Logs', 'DeepSeek Harness')
  : path.join(SUPPORT_DIR, 'logs')
const DSH_HOME = path.join(HOME, '.dsh')
const WEB_PROFILE = path.join(DSH_HOME, 'profiles', 'web')
const MARKET_DIR = path.join(WEB_PROFILE, '.dsh-market')
const STATE_FILE = path.join(SUPPORT_DIR, 'instance.env')
const LOCK_DIR = path.join(SUPPORT_DIR, 'launch.lock')
const CREDENTIALS = path.join(DSH_HOME, '.credentials.yaml')
const SETTINGS = path.join(DSH_HOME, 'settings.yaml')

function now() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function exists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function joinLog(lines, message) {
  if (message) lines.push(message)
  return lines
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || HOME,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    shell: IS_WIN,
  })
  const out = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n').trim()
  return { code: result.status, out }
}

function runLogged(command, args, lines, label, options = {}) {
  lines.push(`> ${label || [command, ...args].join(' ')}`)
  const result = run(command, args, options)
  if (result.out) lines.push(result.out)
  if (result.code !== 0) lines.push(`exit ${result.code}`)
  return result
}

function findDshBin() {
  const candidates = IS_WIN
    ? [
        path.join(HOME, 'bin', 'dsh.cmd'),
        path.join(HOME, 'nodejs', 'bin', 'dsh.cmd'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'dsh.cmd'),
      ]
    : [
        path.join(HOME, 'bin', 'dsh'),
        path.join(HOME, 'nodejs', 'bin', 'dsh'),
        '/opt/homebrew/bin/dsh',
        '/usr/local/bin/dsh',
      ]
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate
  }
  return null
}

function findDshApp() {
  if (IS_MAC) return exists(APP_ROOT) ? APP_ROOT : null
  const candidates = [
    path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'Programs', 'DeepSeek Harness', 'DeepSeekHarness.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'DeepSeek Harness', 'DeepSeekHarness.exe'),
  ]
  return candidates.find(exists) || null
}

function readState() {
  try {
    const text = fs.readFileSync(STATE_FILE, 'utf8')
    return Object.fromEntries(text.split(/\r?\n/).filter(Boolean).map((line) => {
      const index = line.indexOf('=')
      return index === -1 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)]
    }))
  } catch {
    return {}
  }
}

function writeMarketRegion(region) {
  try {
    fs.mkdirSync(MARKET_DIR, { recursive: true })
    const statePath = path.join(MARKET_DIR, 'state.json')
    const current = exists(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {}
    current.region = region
    if (region !== 'global') current.regionAuto = false
    fs.writeFileSync(statePath, JSON.stringify(current), 'utf8')
    return true
  } catch {
    return false
  }
}

function detect() {
  const dshBin = findDshBin()
  const dshApp = findDshApp()
  const state = readState()
  let version = ''
  if (dshBin) {
    const versionResult = run(dshBin, ['--version'], { timeout: 10000 })
    version = versionResult.code === 0 ? versionResult.out.split(/\s/).pop() || versionResult.out : ''
  }
  return {
    platform: process.platform,
    arch: process.arch,
    home: HOME,
    dshHome: DSH_HOME,
    dshBin,
    dshApp,
    supportDir: SUPPORT_DIR,
    logDir: LOG_DIR,
    webProfile: WEB_PROFILE,
    state,
    version,
    checks: {
      dshBin: Boolean(dshBin),
      dshApp: Boolean(dshApp),
      dshHome: isDir(DSH_HOME),
      supportDir: isDir(SUPPORT_DIR),
      webProfile: isDir(WEB_PROFILE),
      profileManifest: exists(path.join(WEB_PROFILE, 'package.json')),
      instanceState: exists(STATE_FILE),
      launchLock: exists(LOCK_DIR),
      marketState: exists(path.join(MARKET_DIR, 'state.json')),
      credentials: exists(CREDENTIALS),
      settings: exists(SETTINGS),
    },
  }
}

function statusLines(info) {
  const lines = []
  lines.push(`平台: ${info.platform} ${info.arch}`)
  lines.push(`用户目录: ${HOME}`)
  lines.push(`DSH 可执行文件: ${info.dshBin || '未找到'}`)
  lines.push(`DeepSeek Harness APP: ${info.dshApp || '未找到'}`)
  lines.push(`DSH 数据目录: ${info.dshHome}`)
  lines.push(`Web Profile: ${info.webProfile}`)
  lines.push(`支持目录: ${info.supportDir}`)
  if (info.version) lines.push(`DSH 版本: ${info.version}`)
  if (info.state.port) lines.push(`当前端口: ${info.state.port}`)
  if (info.state.url) lines.push(`认证地址: ${info.state.url}`)
  return lines
}

function selfCheck(lines = []) {
  const info = detect()
  lines.push(...statusLines(info))
  lines.push('')
  lines.push('--- 自检结果 ---')
  const labels = {
    dshBin: 'DSH 命令',
    dshApp: '桌面 APP',
    dshHome: '~/.dsh',
    supportDir: '应用支持目录',
    webProfile: 'Web Profile',
    profileManifest: 'Profile package.json',
    instanceState: '实例状态文件',
    launchLock: '启动锁',
    marketState: '插件市场状态',
    credentials: '凭据文件',
    settings: '设置文件',
  }
  let ok = true
  for (const [key, label] of Object.entries(labels)) {
    const pass = info.checks[key]
    if (!pass) ok = false
    lines.push(`${pass ? '✓' : '✗'} ${label}: ${pass ? '正常' : '异常或缺失'}`)
  }
  lines.push(ok ? '自检通过。' : '发现需要修复的项目。')

  if (info.dshBin) {
    lines.push('')
    lines.push('--- DSH 版本 ---')
    const version = run(info.dshBin, ['--version'], { timeout: 10000 })
    lines.push(version.out || `exit ${version.code}`)
  }

  if (info.dshApp && IS_MAC) {
    lines.push('')
    lines.push('--- APP 包完整性 ---')
    const checks = [
      ['Contents/MacOS/DeepSeekHarness', '主程序'],
      ['Contents/Resources/DSHWindow.swift', '窗口源码'],
      ['Contents/Resources/start-server.sh', '启动脚本'],
      ['Contents/Resources/dsh-app', '命令行控制工具'],
      ['Contents/Resources/build-window.sh', '窗口构建脚本'],
    ]
    for (const [relative, label] of checks) {
      const full = path.join(info.dshApp, ...relative.split('/'))
      lines.push(`${exists(full) ? '✓' : '✗'} ${label}: ${full}`)
    }
  }

  if (info.checks.launchLock) {
    lines.push('')
    lines.push('发现启动锁，可能由未完成的启动造成。')
  }

  const marketState = path.join(MARKET_DIR, 'state.json')
  if (exists(marketState)) {
    try {
      const market = JSON.parse(fs.readFileSync(marketState, 'utf8'))
      lines.push(`插件市场区域: ${market.region || 'global'}`)
      if (market.region !== 'china') lines.push('建议将插件市场区域切换为 china，避免目录拉取超时。')
    } catch {
      lines.push('插件市场状态文件解析失败。')
    }
  }

  if (exists(path.join(LOG_DIR, 'dsh-web.log'))) {
    const tail = fs.readFileSync(path.join(LOG_DIR, 'dsh-web.log'), 'utf8').split(/\r?\n/).slice(-8).join('\n')
    lines.push('')
    lines.push('--- 最近服务器日志 ---')
    lines.push(tail)
  }

  return { info, lines, ok }
}

function clearLaunchLock(lines) {
  if (exists(LOCK_DIR)) {
    try {
      fs.rmdirSync(LOCK_DIR)
      lines.push('已清除启动锁。')
    } catch {
      try {
        fs.rmSync(LOCK_DIR, { recursive: true, force: true })
        lines.push('已强制清除启动锁。')
      } catch (error) {
        lines.push(`启动锁清除失败: ${error.message}`)
      }
    }
  } else {
    lines.push('没有启动锁。')
  }
}

function ensureBaseDirs(lines) {
  for (const dir of [SUPPORT_DIR, LOG_DIR, DSH_HOME, WEB_PROFILE, MARKET_DIR]) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      lines.push(`目录就绪: ${dir}`)
    } catch (error) {
      lines.push(`目录创建失败: ${dir} (${error.message})`)
    }
  }
}

function fixPermissions(lines) {
  if (!IS_MAC || !exists(APP_ROOT)) return
  const scripts = [
    'Contents/Resources/start-server.sh',
    'Contents/Resources/dsh-app',
    'Contents/Resources/build-window.sh',
  ]
  for (const relative of scripts) {
    const file = path.join(APP_ROOT, ...relative.split('/'))
    if (!exists(file)) continue
    runLogged('/bin/chmod', ['+x', file], lines, `chmod +x ${file}`)
  }
}

function killDsh(lines) {
  if (IS_MAC) {
    runLogged('/usr/bin/pkill', ['-x', 'DeepSeekHarness'], lines, '停止 DeepSeek Harness APP')
    runLogged('/usr/bin/pkill', ['-f', 'dsh web'], lines, '停止 dsh web 服务')
  } else {
    runLogged('taskkill', ['/F', '/IM', 'DeepSeekHarness.exe'], lines, '停止 DeepSeek Harness APP')
    runLogged('taskkill', ['/F', '/IM', 'dsh.exe'], lines, '停止 dsh 进程')
  }
}

function clearStaleState(lines) {
  if (exists(STATE_FILE)) {
    const stamp = path.join(SUPPORT_DIR, `instance.env.bak-${now()}`)
    try {
      fs.copyFileSync(STATE_FILE, stamp)
      lines.push(`已备份实例状态: ${stamp}`)
    } catch {}
  }
  try {
    fs.unlinkSync(STATE_FILE)
    lines.push('已清除实例状态文件。')
  } catch {}
}

function repairFreeze() {
  const lines = []
  lines.push('=== DeepSeek 卡死修复 ===')
  const info = detect()
  lines.push(`检测到 APP: ${info.dshApp || '无'}`)
  killDsh(lines)
  clearStaleState(lines)
  clearLaunchLock(lines)
  ensureBaseDirs(lines)
  writeMarketRegion('china') && lines.push('已将插件市场区域设为 china。')
  lines.push('')
  lines.push('修复完成。请重新打开 DeepSeek Harness。')
  return { ok: true, info, lines }
}

function repairStartup() {
  const lines = []
  lines.push('=== 无法启动自检与修复 ===')
  const result = selfCheck(lines)
  if (!result.info.dshBin) {
    lines.push('')
    lines.push('未找到 dsh 命令。请先安装 DeepSeek Harness CLI，或检查 PATH。')
    return { ok: false, info: result.info, lines }
  }
  clearLaunchLock(lines)
  ensureBaseDirs(lines)
  fixPermissions(lines)
  writeMarketRegion('china') && lines.push('已将插件市场区域设为 china。')
  lines.push('')
  lines.push('--- 重建 Web Profile 依赖 ---')
  runLogged(result.info.dshBin, ['plugin', '--profile', 'web', 'install'], lines, 'dsh plugin install', { timeout: 180000 })
  lines.push('')
  lines.push('修复流程结束。请重新启动 DeepSeek Harness。')
  return { ok: true, info: result.info, lines }
}

function repairInternalFiles() {
  const lines = []
  lines.push('=== DeepSeek Harness 内部文件修复箱 ===')
  const info = detect()
  lines.push(...statusLines(info))
  ensureBaseDirs(lines)
  fixPermissions(lines)
  clearLaunchLock(lines)
  if (exists(STATE_FILE)) {
    const backup = path.join(SUPPORT_DIR, `instance.env.bak-${now()}`)
    try {
      fs.copyFileSync(STATE_FILE, backup)
      lines.push(`实例状态已备份: ${backup}`)
    } catch (error) {
      lines.push(`实例状态备份失败: ${error.message}`)
    }
  }
  writeMarketRegion('china') && lines.push('已将插件市场区域设为 china。')
  lines.push('')
  lines.push('--- 文件结构检查 ---')
  const files = [
    [path.join(WEB_PROFILE, 'package.json'), 'Web Profile 配置'],
    [path.join(WEB_PROFILE, 'pnpm-lock.yaml'), 'pnpm 锁文件'],
    [path.join(WEB_PROFILE, 'node_modules'), 'Web Profile 依赖目录'],
    [path.join(DSH_HOME, 'settings.yaml'), '全局设置'],
  ]
  for (const [file, label] of files) {
    lines.push(`${exists(file) ? '✓' : '✗'} ${label}: ${file}`)
  }
  lines.push('')
  lines.push('内部文件修复箱执行完成。')
  return { ok: true, info, lines }
}

function safeBackup(source, backupRoot, lines) {
  if (!exists(source)) {
    lines.push(`跳过不存在的路径: ${source}`)
    return null
  }
  const target = path.join(backupRoot, path.basename(source) || 'item')
  fs.mkdirSync(backupRoot, { recursive: true })
  fs.renameSync(source, target)
  lines.push(`已备份: ${source} -> ${target}`)
  return target
}

function resetDsh(options = {}) {
  const lines = []
  lines.push('=== DSH 重置工具 ===')
  const info = detect()
  killDsh(lines)
  clearLaunchLock(lines)
  clearStaleState(lines)

  const backupRoot = path.join(HOME, `.dsh-reset-backup-${now()}`)
  fs.mkdirSync(backupRoot, { recursive: true })
  lines.push(`备份目录: ${backupRoot}`)

  const selected = {
    settings: options.settings !== false,
    credentials: options.credentials === true,
    webProfile: options.webProfile !== false,
    sessions: options.sessions !== false,
    caches: options.caches !== false,
    attachments: options.attachments !== false,
    market: options.market !== false,
    fullReset: options.fullReset === true,
  }

  if (selected.fullReset && exists(DSH_HOME)) {
    safeBackup(DSH_HOME, backupRoot, lines)
    lines.push('已执行全量重置。重新启动应用后，请重新登录并配置。')
    return { ok: true, info, lines, backupRoot }
  }

  if (selected.settings && exists(SETTINGS)) safeBackup(SETTINGS, backupRoot, lines)
  if (selected.credentials && exists(CREDENTIALS)) safeBackup(CREDENTIALS, backupRoot, lines)
  if (selected.webProfile && exists(WEB_PROFILE)) safeBackup(WEB_PROFILE, backupRoot, lines)

  for (const [key, relative] of Object.entries({
    sessions: path.join(DSH_HOME, 'sessions'),
    caches: path.join(DSH_HOME, 'storages', 'session_projcache'),
    attachments: path.join(DSH_HOME, 'attachments'),
    market: MARKET_DIR,
  })) {
    if (selected[key]) safeBackup(relative, backupRoot, lines)
  }

  ensureBaseDirs(lines)
  writeMarketRegion('china') && lines.push('已将插件市场区域设为 china。')

  if (selected.webProfile && info.dshBin) {
    lines.push('')
    lines.push('--- 初始化 Web Profile ---')
    runLogged(info.dshBin, ['plugin', '--profile', 'web', 'install'], lines, 'dsh plugin install', { timeout: 180000 })
  }

  lines.push('')
  lines.push(`重置完成。备份位置: ${backupRoot}`)
  return { ok: true, info, lines, backupRoot }
}

function runRepair(kind, options) {
  switch (kind) {
    case 'self-check':
      return selfCheck()
    case 'freeze':
      return repairFreeze()
    case 'startup':
      return repairStartup()
    case 'internal-files':
      return repairInternalFiles()
    case 'reset':
      return resetDsh(options)
    default:
      throw new Error(`unknown repair kind: ${kind}`)
  }
}

module.exports = {
  APP_ROOT,
  SUPPORT_DIR,
  LOG_DIR,
  DSH_HOME,
  WEB_PROFILE,
  MARKET_DIR,
  STATE_FILE,
  detect,
  findDshBin,
  runRepair,
  run,
  exists,
  now,
}
