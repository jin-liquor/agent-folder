# Agent Folder Changelog / 更新记录

All notable user-facing changes are recorded here. / 记录面向用户的重要变更。

## [1.2.0] - 2026-11-12

### Added / 新增

- 支持 omp（Oh My Pi）与 opencode 两种 CLI，与 codex、Claude Code 一样可在任意文件夹里直接启动。 / Added omp (Oh My Pi) and opencode alongside codex and Claude Code, launchable from any folder.
- 每种 CLI 都有一套「启动模式预设」下拉栏：内置预设可直接选用，也可以新增自己的参数组合，随时改名、改参数或删除。 / Each CLI has a preset list: pick a built-in mode, or add your own argument combination and rename, edit, or delete it later.
- 首次启动自动探测四个 CLI 的可执行文件路径并保存，设置页可查看结果、重新探测或手动指定。 / CLI executable paths are detected once on first launch and persisted; the settings page lists them and can re-probe or override.
- 主窗口行内保留 6 个高频按钮（VS Code / Codex / Claude / omp / opencode / 收藏），收藏、重命名、颜色、标签、复制路径、资源管理器与移除收进右键菜单；`Shift+F10` 为键盘等价入口。 / Rows keep six high-frequency buttons; favorite, rename, color, tags, copy path, reveal, and remove moved into a right-click menu, with `Shift+F10` as the keyboard equivalent.
- 快速启动快捷键默认改为 `Ctrl+Space`，可配置，清空即禁用；旧版本留下的旧默认值会自动升级，用户自定的组合保持不变。 / The quick-launch hotkey now defaults to `Ctrl+Space`, remains configurable, and clearing it disables it; the old default is migrated automatically while custom combinations are preserved.

### Changed / 变更

- 快速启动浮窗内不再绑定 `Ctrl+Enter` / `Ctrl+1` / `Ctrl+2` / `Ctrl+3`，改为点击行内图标切换打开方式，只保留 `↑` / `↓` 与 `Enter`；浮窗在 `Esc`、失去焦点或 8 秒无操作后自动收起。 / The palette no longer binds `Ctrl+Enter`, `Ctrl+1`, `Ctrl+2`, or `Ctrl+3`; switch the target with the row icons instead, while `↑` / `↓` and `Enter` remain.
- 应用图标、安装包图标、托盘图标、标题栏标识与浏览器 favicon 全部换成新的 `< A >` 字形；小尺寸使用紧凑变体并加粗笔画，保证托盘与标题栏里清晰可辨。 / The app, installer, tray, title-bar mark, and favicon all use the new `< A >` glyph; small sizes use a compact, thickened variant so they stay legible in the tray and title bar.
- omp 与 opencode 使用各自官方图标。 / omp and opencode use their official icons.

### Fixed / 修复

- 修复 CLI 启动后立即闪退：应用是无控制台的 GUI 进程，直接 `CreateProcess` 会把无效的标准句柄传给子进程，TUI 检测到输出不是终端便立刻退出。改为经 `cmd /d /c start` 启动，由新控制台提供合法句柄。 / Fixed CLIs exiting immediately: the app is a consoleless GUI process, so a direct `CreateProcess` handed invalid standard handles to the child and the TUI quit at once. Launching through `cmd /d /c start` gives the child a real console.
- 修复 CLI 启动后立即闪退：应用是无控制台的 GUI 进程，`start` 的窗口标题与程序路径必须带显式引号，否则会被 cmd 切分错位；已改为统一加引号并通过 `cmd /d /c start` 启动。 / Fixed CLIs exiting immediately: `start` needs explicit quotes around both the window title and the program path; otherwise cmd splits them apart. They are now always quoted and launched through `cmd /d /c start`.
- 修复右键菜单点任何项都会顺带打开文件夹：菜单渲染在列表行内，事件冒泡触发了行的点击。 / Fixed every context-menu item also opening the folder, caused by events bubbling to the row's click handler.
- 修复 `Shift+F10` 无法打开右键菜单：行容器缺少键盘焦点，且主窗口的键盘导航没有处理该组合。 / Fixed `Shift+F10` not opening the context menu: rows had no keyboard focus and the window-level navigation ignored the shortcut.
- 修复启动响应慢：改为不等待子进程的 `spawn`，并按命令行注入 `TERM`，避免 `TERM=dumb` 让 TUI 拒绝启动。 / Fixed slow launching by spawning without waiting for the child and injecting `TERM` instead of inheriting `TERM=dumb`.
- 修复 `vitest` 把 `node_modules` 里的第三方测试文件一并收集、导致 `pnpm test` 必然失败的问题。 / Fixed `pnpm test` failing because vitest collected third-party test files from `node_modules`.
- 设置页不再用绿色文字罗列快捷键「已生效」，只在真正冲突时以红色给出原因。 / Settings no longer lists hotkeys in green to say "registered"; it only shows a red reason when a hotkey actually conflicts.

## [1.1.1] - 2026-11-12

> 本次发布覆盖 1.0.1 之后的全部变更；1.1.0 为内部构建，未单独发布。
> This release rolls up every change since 1.0.1; 1.1.0 was an internal build and was never published separately.

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
- 快捷键报错不再用原始长文本撑破设置页布局，改为一句话摘要，完整原因看悬浮提示。 / Long hotkey errors no longer break the settings layout; they collapse to a one-line summary with the full reason in a tooltip.

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
