# DSH Repair Workstation

DeepSeek Harness（DSH）问题与 Bug 修复工作站。一个跨平台的桌面应用，用于收集社区问题、提供修复工具、检查内部文件并安全重置 DSH。

## 功能

- 问题论坛：基于 GitHub Issues 的社区问题收集。支持发布问题、回答他人问题、附上解决方案或可运行代码。
- 修复包区：桌面版 APP 安装包、DeepSeek 卡死修复、无法启动自检与修复、内部文件修复箱、DSH 重置工具。
- 跨平台：支持 macOS 与 Windows。
- 安全重置：重置前自动备份，可选择重置配置、凭据、Web Profile、会话、缓存、附件、插件市场或全量数据。

## 安装

### macOS

从 [Releases](https://github.com/zengpu987-ctrl/dsh-repair-workstation/releases) 下载 `DSH Repair Workstation-*-arm64-mac.zip`，解压后拖入 `Applications`。

或者本地构建：

```bash
npm install
npm run pack:mac
```

### Windows

从 Releases 下载 `DSH-Repair-Workstation-Windows-x64.zip`，解压后运行 `DSH Repair Workstation.exe`。

## 开发

```bash
npm install
npm start
```

## GitHub 论坛

应用默认读取本仓库的 Issues。公开浏览无需 Token；发布问题和回复需要 GitHub Token。可在应用内的“设置”页面配置。

## 项目结构

```text
src/main.js         Electron 主进程与 IPC
src/preload.js      安全的渲染进程桥接
src/repair.js       检测、自检、修复与重置逻辑
src/github.js       GitHub Issues 论坛同步
renderer/           界面
assets/             应用图标
```

## License

[MIT](./LICENSE)
