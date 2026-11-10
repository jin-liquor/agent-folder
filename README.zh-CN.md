# Agent Folder

[English](README.md)

Agent Folder 是一个面向 Windows 的轻量级桌面工具，用于管理常用文件夹，并快速在代码编辑器或资源管理器中打开。

## 功能

- 收藏常用文件夹，并按最近使用情况排序
- 按名称、路径和标签进行模糊搜索
- 浏览目录树，或扫描配置的目录范围查找项目
- 使用 VS Code、VS Code Insiders、Cursor、Windsurf 或资源管理器打开文件夹
- 为项目添加标签和颜色，并识别常见项目类型
- 使用系统托盘、全局快捷键和快速启动浮窗
- 导入、导出本地 JSON 数据；每个用户最多保留 500 条历史记录，收藏不会因历史裁剪而删除

## 安装

从 [GitHub Releases](https://github.com/jin-liquor/agent-folder/releases) 下载最新的 `*_x64-setup.exe`，运行安装程序即可。

系统要求：Windows 10 或更高版本，以及 Microsoft Edge WebView2 Runtime（Windows 11 通常已预装）。建议安装后从开始菜单启动应用。不要直接从受低完整性权限限制的工作目录运行构建产物，否则 Windows 可能阻止系统托盘图标注册。

## 快速开始

1. 启动 Agent Folder。
2. 选择「添加文件夹」浏览磁盘，或使用「磁盘扫描」搜索项目。
3. 选择项目并按 `Enter`，使用当前默认编辑器打开。
4. 将常用目录加入收藏，之后可在主窗口或快速启动浮窗中搜索。

如果项目不在默认扫描范围内，请在「设置 → 磁盘扫描范围」添加对应目录。添加记录、收藏或设置不会移动、修改或删除磁盘上的项目文件。

## 快捷键

| 快捷键 | 操作 |
|---|---|
| `Ctrl+K` | 聚焦搜索框 |
| `↑` / `↓` | 选择列表项 |
| `Enter` | 打开选中项目 |
| `Ctrl+D` | 收藏或取消收藏 |
| `Delete` | 移除记录，不删除实际文件夹 |
| `Ctrl+,` | 打开设置 |
| `Esc` | 关闭面板或清空搜索 |
| `Ctrl+Alt+V` | 显示或隐藏主窗口，可在设置中更改 |
| `Ctrl+Shift+Space` | 显示或隐藏快速启动浮窗 |

点击标题栏的最小化按钮会隐藏到托盘。关闭按钮的行为由「关闭时最小化到托盘」设置决定。完全退出请右键托盘图标并选择「退出」。

## 隐私与数据

Agent Folder 将文件夹记录和设置保存在本机：`%APPDATA%\agent-folder\data.json`。应用不上传这些数据，也不收集使用统计。JSON 导入和导出由用户主动操作。项目当前不包含自动更新器；新版本通过 GitHub Releases 手动下载并安装。

## 从源码构建

需要 Node.js、pnpm、Rust 工具链和 Windows WebView2 Runtime。

```powershell
pnpm install
pnpm build
pnpm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --release --offline
$env:CI = "true"
pnpm tauri build
```

安装包位于 `src-tauri/target/release/bundle/nsis/`。

## 开发文档

开发规范、架构说明、发布说明和实施计划维护在本地 `AGENT.md` 与 `Plan/` 目录中，按项目约定不加入 Git 跟踪。

## 许可

[MIT License](LICENSE)
