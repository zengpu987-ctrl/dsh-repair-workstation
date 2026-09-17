const api = window.dshWorkstation

const state = {
  view: 'overview',
  system: null,
  issues: [],
  selectedIssue: null,
  comments: [],
  settings: {},
}

const titles = {
  overview: ['状态概览', 'DeepSeek Harness 问题与修复工作站'],
  forum: ['问题论坛', '浏览社区问题，发布描述或补充解决方案'],
  packages: ['修复包区', '安装包、卡死修复、启动修复、文件修复和重置工具'],
  'repair-box': ['内部文件修复箱', '检查并修复 DeepSeek Harness 内部文件结构'],
  reset: ['DSH 重置', '备份后安全重置配置、缓存、会话或全部数据'],
  settings: ['设置', '配置 GitHub 论坛同步'],
}

document.addEventListener('DOMContentLoaded', () => {
  bindNavigation()
  bindActions()
  loadOverview()
  loadForum()
  loadSettings()
})

function bindNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view))
  })

  document.querySelectorAll('[data-view-jump]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.viewJump))
  })
}

function bindActions() {
  document.querySelector('[data-action="refresh-system"]').addEventListener('click', loadOverview)
  document.querySelector('[data-action="open-deepseek"]').addEventListener('click', async () => {
    const result = await api.openDeepSeek()
    if (result.ok && result.data) showToast('已打开 DeepSeek Harness')
    else showToast('未找到 DeepSeek Harness APP')
  })

  document.querySelector('[data-action="open-repo"]').addEventListener('click', () => {
    api.openExternal(`https://github.com/${state.settings.repo || 'zengpu987-ctrl/dsh-repair-workstation'}`)
  })

  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => runTool(button.dataset.tool))
  })

  document.querySelector('[data-action="make-installer"]').addEventListener('click', makeInstaller)
  document.querySelector('[data-action="open-official"]').addEventListener('click', () => {
    api.openExternal('https://github.com/deepseek-ai/deepseek-harness/releases')
  })

  document.querySelector('[data-action="copy-log"]').addEventListener('click', () => {
    copyText(document.getElementById('repair-output').textContent, '修复日志已复制')
  })
  document.querySelector('[data-action="copy-reset-log"]').addEventListener('click', () => {
    copyText(document.getElementById('reset-output').textContent, '重置日志已复制')
  })

  document.querySelector('[data-action="run-reset"]').addEventListener('click', runReset)
  document.querySelector('[data-action="save-settings"]').addEventListener('click', saveSettings)
  document.querySelector('[data-action="new-issue"]').addEventListener('click', openNewIssueDialog)
  document.querySelector('[data-close-dialog]').addEventListener('click', closeNewIssueDialog)

  document.getElementById('forum-search').addEventListener('input', renderForumList)
  document.getElementById('new-issue-form').addEventListener('submit', submitNewIssue)
}

function showView(view) {
  state.view = view
  document.querySelectorAll('.view').forEach((section) => section.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view))
  document.getElementById(`view-${view}`).classList.add('active')
  document.getElementById('page-title').textContent = titles[view][0]
  document.getElementById('page-subtitle').textContent = titles[view][1]
  if (view === 'forum' && state.issues.length === 0) loadForum()
}

function showToast(message) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800)
}

async function copyText(text, successMessage) {
  const result = await api.writeClipboard(text || '')
  if (result.ok) showToast(successMessage || '已复制')
}

async function loadOverview() {
  const result = await api.systemInfo()
  if (!result.ok) {
    showToast(result.error || '检测失败')
    return
  }
  state.system = result.data
  renderOverview(state.system)
}

function renderOverview(info) {
  document.getElementById('metric-platform').textContent = info.platform === 'darwin' ? 'macOS' : info.platform
  document.getElementById('metric-arch').textContent = info.arch
  document.getElementById('metric-dsh').textContent = info.checks.dshBin ? '已安装' : '未找到'
  document.getElementById('metric-version').textContent = info.version || ''
  document.getElementById('metric-app').textContent = info.checks.dshApp ? '已安装' : '未找到'
  document.getElementById('metric-app-path').textContent = info.dshApp || ''
  document.getElementById('metric-market').textContent = info.checks.marketState ? '可用' : '未初始化'

  const marketFile = info.checks.marketState ? null : null
  document.getElementById('metric-market-region').textContent = info.checks.marketState ? '配置已检测' : ''

  const checks = [
    ['DSH 命令', info.checks.dshBin],
    ['桌面 APP', info.checks.dshApp],
    ['数据目录', info.checks.dshHome],
    ['支持目录', info.checks.supportDir],
    ['Web Profile', info.checks.webProfile],
    ['Profile 配置', info.checks.profileManifest],
    ['实例状态', info.checks.instanceState],
    ['启动锁', info.checks.launchLock],
    ['插件市场状态', info.checks.marketState],
    ['凭据文件', info.checks.credentials],
  ]

  document.getElementById('overview-checks').innerHTML = checks.map(([label, pass]) => `
    <div class="check-row">
      <span class="state ${pass ? '' : 'bad'}">${pass ? '✓' : '✗'}</span>
      <span>${escapeHtml(label)}</span>
    </div>
  `).join('')
}

async function runTool(kind) {
  const output = document.getElementById('repair-output')
  output.textContent = '正在执行，请稍候…'
  const result = await api.runRepair(kind, collectResetOptions())
  if (!result.ok) {
    output.textContent = result.error || '执行失败'
    showToast('执行失败')
    return
  }
  output.textContent = (result.data.lines || []).join('\n')
  showToast('执行完成')
  loadOverview()
  if (kind === 'reset') {
    document.getElementById('reset-output').textContent = (result.data.lines || []).join('\n')
  }
}

function collectResetOptions() {
  const options = {}
  document.querySelectorAll('[data-reset]').forEach((input) => {
    options[input.dataset.reset] = input.checked
  })
  return options
}

async function runReset() {
  const confirm = document.getElementById('reset-confirm')
  if (confirm.value.trim() !== 'RESET DSH') {
    showToast('请输入 RESET DSH 再执行')
    confirm.focus()
    return
  }
  const resetOutput = document.getElementById('reset-output')
  resetOutput.textContent = '正在备份并执行重置，请勿关闭应用…'
  const result = await api.runRepair('reset', collectResetOptions())
  if (!result.ok) {
    resetOutput.textContent = result.error || '重置失败'
    return
  }
  resetOutput.textContent = (result.data.lines || []).join('\n')
  confirm.value = ''
  showToast('重置完成')
  loadOverview()
}

async function makeInstaller() {
  showToast('正在生成 macOS 安装包…')
  const result = await api.makeInstaller('zip')
  if (!result.ok) {
    showToast(result.error || '生成失败')
    return
  }
  if (result.data.status === 'ok') {
    showToast('安装包已生成，已打开所在文件夹')
  } else {
    showToast(result.data.message || '生成失败')
  }
}

async function loadForum() {
  const result = await api.forumList()
  if (!result.ok) {
    document.getElementById('forum-count').textContent = '加载失败'
    return
  }
  state.issues = result.data.issues || []
  renderForumList()
}

function renderForumList() {
  const search = document.getElementById('forum-search').value.trim().toLowerCase()
  const filtered = state.issues.filter((issue) => {
    return !search || `${issue.title} ${issue.body}`.toLowerCase().includes(search)
  })
  document.getElementById('forum-count').textContent = `${filtered.length} / ${state.issues.length}`
  document.getElementById('forum-list').innerHTML = filtered.map((issue) => `
    <button class="forum-post ${state.selectedIssue?.number === issue.number ? 'active' : ''}" data-number="${issue.number}">
      <div class="forum-post-title">${escapeHtml(issue.title)}</div>
      <div class="forum-post-meta">
        <span>#${issue.number}</span>
        <span>${escapeHtml(issue.user)}</span>
        <span class="state-badge ${issue.state}">${issue.state === 'open' ? '开放' : '已关闭'}</span>
        <span>${issue.comments} 回复</span>
      </div>
    </button>
  `).join('')

  document.querySelectorAll('.forum-post').forEach((button) => {
    button.addEventListener('click', () => selectIssue(Number(button.dataset.number)))
  })
}

async function selectIssue(number) {
  const issue = state.issues.find((item) => item.number === number)
  if (!issue) return
  state.selectedIssue = issue
  renderForumList()

  const detail = document.getElementById('forum-detail')
  detail.innerHTML = `<div class="empty-state">正在加载讨论…</div>`

  const commentsResult = await api.forumComments(number)
  state.comments = commentsResult.ok ? commentsResult.data : []
  renderIssueDetail(issue)
}

function renderIssueDetail(issue) {
  const detail = document.getElementById('forum-detail')
  detail.innerHTML = `
    <h1 class="issue-title">${escapeHtml(issue.title)}</h1>
    <div class="issue-meta">
      #${issue.number} · ${escapeHtml(issue.user)} · ${new Date(issue.createdAt).toLocaleString()}
      · <a href="${escapeHtml(issue.htmlUrl)}" target="_blank" rel="noreferrer">在 GitHub 查看</a>
    </div>
    <div class="markdown-body">${renderMarkdown(issue.body || '')}</div>
    <div class="comments">
      <h2>回答与解决方案</h2>
      ${state.comments.length ? state.comments.map((comment) => `
        <article class="comment">
          <div class="comment-meta">${escapeHtml(comment.user)} · ${new Date(comment.createdAt).toLocaleString()}</div>
          <div class="markdown-body">${renderMarkdown(comment.body)}</div>
        </article>
      `).join('') : '<p class="muted">还没有回答。分享你的解决方案或代码。</p>'}
    </div>
    <div class="reply-box">
      <label>补充解决方案 / 程序代码
        <textarea id="reply-text" class="textarea" rows="6" placeholder="描述解决步骤，或粘贴可运行的代码块。支持 Markdown。"></textarea>
      </label>
      <div class="dialog-actions">
        <button class="primary-button" data-action="submit-reply">提交回答</button>
      </div>
    </div>
  `
  detail.querySelector('[data-action="submit-reply"]').addEventListener('click', submitReply)
}

async function submitReply() {
  const text = document.getElementById('reply-text').value.trim()
  if (!text) {
    showToast('回复内容不能为空')
    return
  }
  const result = await api.forumReply(state.selectedIssue.number, text)
  if (!result.ok) {
    showToast(result.error || '回复失败')
    return
  }
  showToast('回复已发布')
  await selectIssue(state.selectedIssue.number)
}

function openNewIssueDialog() {
  document.getElementById('new-issue-dialog').showModal()
}

function closeNewIssueDialog() {
  document.getElementById('new-issue-dialog').close()
}

async function submitNewIssue(event) {
  event.preventDefault()
  const form = new FormData(event.target)
  const title = form.get('title') || ''
  const body = form.get('body') || ''
  const result = await api.forumCreate(title, body)
  if (!result.ok) {
    showToast(result.error || '发布失败')
    return
  }
  event.target.reset()
  closeNewIssueDialog()
  showToast('问题已发布到 GitHub Issues')
  await loadForum()
}

async function loadSettings() {
  const result = await api.forumSettingsGet()
  if (result.ok) {
    state.settings = result.data || {}
    document.getElementById('setting-repo').value = state.settings.repo || 'zengpu987-ctrl/dsh-repair-workstation'
    document.getElementById('setting-token').value = state.settings.token || ''
  }
}

async function saveSettings() {
  const settings = {
    repo: document.getElementById('setting-repo').value.trim() || 'zengpu987-ctrl/dsh-repair-workstation',
    token: document.getElementById('setting-token').value.trim(),
  }
  const result = await api.forumSettingsSave(settings)
  if (!result.ok) {
    showToast(result.error || '保存失败')
    return
  }
  state.settings = settings
  showToast('设置已保存')
  loadForum()
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderMarkdown(markdown) {
  const source = String(markdown || '')
  const blocks = []
  const withCode = source.replace(/```([\s\S]*?)```/g, (_match, code) => {
    const id = `__CODE_BLOCK_${blocks.length}__`
    blocks.push(`<pre><code>${escapeHtml(code.replace(/^\n/, ''))}</code></pre>`)
    return `\n${id}\n`
  })

  const lines = withCode.split(/\r?\n/)
  const html = []
  let list = null

  function closeList() {
    if (list) {
      html.push(`</${list}>`)
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^__CODE_BLOCK_\d+__$/.test(line.trim())) {
      closeList()
      html.push(blocks[Number(line.trim().match(/\d+/)[0])])
      continue
    }
    if (!line.trim()) {
      closeList()
      continue
    }
    if (/^###\s+/.test(line.trim())) {
      closeList()
      html.push(`<h3>${inlineMarkdown(line.trim().replace(/^###\s+/, ''))}</h3>`)
    } else if (/^##\s+/.test(line.trim())) {
      closeList()
      html.push(`<h2>${inlineMarkdown(line.trim().replace(/^##\s+/, ''))}</h2>`)
    } else if (/^#\s+/.test(line.trim())) {
      closeList()
      html.push(`<h1>${inlineMarkdown(line.trim().replace(/^#\s+/, ''))}</h1>`)
    } else if (/^[-*]\s+/.test(line.trim())) {
      if (list !== 'ul') {
        closeList()
        html.push('<ul>')
        list = 'ul'
      }
      html.push(`<li>${inlineMarkdown(line.trim().replace(/^[-*]\s+/, ''))}</li>`)
    } else if (/^\d+\.\s+/.test(line.trim())) {
      if (list !== 'ol') {
        closeList()
        html.push('<ol>')
        list = 'ol'
      }
      html.push(`<li>${inlineMarkdown(line.trim().replace(/^\d+\.\s+/, ''))}</li>`)
    } else {
      closeList()
      html.push(`<p>${inlineMarkdown(line.trim())}</p>`)
    }
  }
  closeList()
  return html.join('')
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}
