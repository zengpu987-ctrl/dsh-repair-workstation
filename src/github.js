const { app } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const DEFAULT_REPO = 'zengpu987-ctrl/dsh-repair-workstation'
const API = 'https://api.github.com'

function settingsFile() {
  return path.join(app.getPath('userData'), 'github-settings.json')
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8')
  return readSettings()
}

function repo() {
  return readSettings().repo || DEFAULT_REPO
}

function tokenFromEnvironment() {
  return process.env.GITHUB_TOKEN || process.env.DSH_REPAIR_GITHUB_TOKEN || ''
}

function tokenFromSettings() {
  return readSettings().token || ''
}

function tokenFromKeychain() {
  try {
    if (process.platform === 'darwin') {
      return execFileSync('/usr/bin/security', ['find-internet-password', '-s', 'github.com', '-w'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    }
    if (process.platform === 'win32') {
      return execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    }
  } catch {}
  return ''
}

function getToken() {
  return tokenFromEnvironment() || tokenFromSettings() || tokenFromKeychain()
}

function hasWriteToken() {
  return Boolean(tokenFromEnvironment() || tokenFromSettings())
}

function authHeaders(token = getToken()) {
  const headers = {
    'user-agent': 'dsh-repair-workstation',
    accept: 'application/vnd.github+json',
  }
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

async function apiRequest(method, route, body) {
  const response = await fetch(`${API}${route}`, {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && data.message ? data.message : `HTTP ${response.status}`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return data
}

async function listIssues() {
  const data = await apiRequest('GET', `/repos/${repo()}/issues?state=all&per_page=100`)
  return data.map((issue) => ({
    id: String(issue.id),
    number: issue.number,
    title: issue.title,
    body: issue.body || '',
    state: issue.state,
    labels: (issue.labels || []).map((label) => label.name),
    user: issue.user ? issue.user.login : 'anonymous',
    comments: issue.comments || 0,
    createdAt: issue.created_at,
    htmlUrl: issue.html_url,
  }))
}

async function listComments(number) {
  const data = await apiRequest('GET', `/repos/${repo()}/issues/${number}/comments?per_page=100`)
  return data.map((comment) => ({
    id: String(comment.id),
    body: comment.body || '',
    user: comment.user ? comment.user.login : 'anonymous',
    createdAt: comment.created_at,
    htmlUrl: comment.html_url,
  }))
}

async function createIssue({ title, body }) {
  if (!title || !title.trim()) throw new Error('问题标题不能为空')
  return apiRequest('POST', `/repos/${repo()}/issues`, {
    title: title.trim(),
    body: body || '',
  })
}

async function createReply(number, body) {
  if (!number) throw new Error('缺少问题编号')
  if (!body || !body.trim()) throw new Error('回复内容不能为空')
  return apiRequest('POST', `/repos/${repo()}/issues/${number}/comments`, {
    body: body.trim(),
  })
}

module.exports = {
  DEFAULT_REPO,
  repo,
  readSettings,
  saveSettings,
  getToken,
  hasWriteToken,
  listIssues,
  listComments,
  createIssue,
  createReply,
}
