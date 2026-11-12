# Agent Folder Changelog / 更新记录

All notable user-facing changes are recorded here. / 记录面向用户的重要变更。

## [1.1.0] - 2026-11-12

### Added / 新增

- 常驻磁盘索引：启动时后台构建一次，搜索只读内存，输入不再触发整盘遍历。 / Persistent on-disk folder index: built once in the background, every query is served from memory instead of walking the disk.
- 快速启动浮窗支持磁盘检索，已保存记录与磁盘命中分组展示，打开后自动进入历史。 / The quick-launch palette now searches the disk index too, groups saved records and disk hits, and records what you open.
- 快速启动浮窗显示打开方式图标（VS Code / Codex / Claude / 资源管理器），支持 `Ctrl+Enter`、`Ctrl+1`、`Ctrl+2`、`Ctrl+3`。 / Open-with icons in the palette with `Ctrl+Enter`, `Ctrl+1`, `Ctrl+2`, and `Ctrl+3` shortcuts.
- 设置新增「快速启动默认动作」「显示打开方式图标」，以及磁盘索引状态与重建入口。 / New settings for the palette default action, icon visibility, and an index status row with a rebuild button.
- 界面改为 GitHub Primer 风格：实底画布、1px 描边、6px 圆角、语义色与黄色命中高亮。 / GitHub Primer visual language: solid canvas, 1px borders, 6px radii, semantic colors, yellow match highlights.

### Improved / 改进

- 磁盘检索改为内存索引匹配，查询从「350 ms 防抖 + 1–7 s 遍历」降到毫秒级。 / Disk search now matches an in-memory index, cutting queries from a 350 ms debounce plus a 1–7 s walk to milliseconds.
- 跳过 Windows 系统目录（Windows、Program Files、ProgramData、`$Recycle.Bin` 等），大幅减少无效遍历。 / Windows system directories are skipped, removing most wasted traversal.
- 主窗口搜索增加渲染上限，避免一次命中过多拖慢列表。 / The main window caps rendered search rows so large result sets stay responsive.
- 中文输入法拼写过程中不再触发查询，避免结果抖动。 / IME composition no longer triggers searches mid-word, removing jitter for Chinese input.
- 索引缓存与 `data.json` 分离：缓存损坏只重建索引，不影响用户数据。 / The index cache is separate from `data.json`, so a damaged cache never touches user data.

### Fixed / 修复

- 设置页快捷键速查补上 `Ctrl+Shift+Space`。 / Added the missing `Ctrl+Shift+Space` entry to the shortcut reference.

## [1.0.1] - 2026-11-11

### Added / 新增

- Add a Claude Code default startup mode that launches `claude` without extra arguments; existing saved mode choices remain unchanged. / 新增 Claude Code 默认启动模式，直接运行 `claude` 且不附加参数；用户已保存的启动模式保持不变。

### Fixed / 修复

- Launch Windows npm CLI shims through `cmd.exe` and include the user's npm directory in the child process PATH. / Windows 下通过 `cmd.exe` 启动 npm CLI shim，并将用户 npm 目录加入子进程 PATH。

## [0.1.0] - 2026-11-10

### Added / 新增

- Bilingual Chinese and English installation, usage, privacy, and build documentation. / 增加中英双语的安装、使用、隐私与构建文档。
- A release overview and installation guidance for the Windows NSIS package. / 增加 Windows NSIS 安装包的版本说明与安装指引。

### Improved / 改进

- Clarified local-only data storage and the absence of automatic update behavior. / 明确本地数据存储方式与当前不含自动更新功能。
- Updated keyboard shortcut, project structure, and development instructions to match the current implementation. / 更新快捷键、项目结构和开发说明，使其与当前实现一致。
- Rebuilt the Windows installer from the cleaned 0.1.0 source tree for the GitHub release. / 基于整理后的 0.1.0 源码重新构建 Windows 安装包。

### Privacy / 隐私

- The release installer does not include user folder records, settings, credentials, access tokens, or personal workspace files. / 发布安装包不包含用户文件夹记录、设置、凭证、访问令牌或个人工作区文件。
- Application data remains on the user's computer; no usage analytics or automatic upload is included. / 应用数据保存在用户本机；不包含使用统计或自动上传功能。
