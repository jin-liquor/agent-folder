# 项目结构说明

本文件说明代码如何分层，以及「新增一个功能应该改哪里」。
修改代码前先读这里，能避免把逻辑放错层。

---

## 一、总体分层

```
前端（src/）                        后端（src-tauri/src/）
├── lib/       纯函数与封装          ├── model/      数据结构
├── hooks/     状态与副作用          ├── storage/    持久化
├── stores/    全局状态              ├── services/   业务逻辑
├── components/ 界面                 ├── system/     系统集成
└── App.tsx    装配                  └── commands/   前端接口
```

依赖方向是单向的：

- 前端：`components → hooks/stores → lib`
- 后端：`commands → services/system → storage → model`

**下层不得反向依赖上层。** 例如 `model` 里不允许出现 `std::fs`，
`services` 里不允许直接写 `data.json`。

---

## 二、后端 `src-tauri/src/`

| 目录 | 职责 | 典型内容 |
|---|---|---|
| `model/` | 纯数据结构与路径工具 | `FolderRecord`、`AppSettings`、`normalize_path` |
| `storage/` | 读写 `data.json` | `Store`、`AppData` 的增删改 |
| `services/` | 与系统打交道的业务逻辑 | 编辑器探测与启动、磁盘扫描 |
| `system/` | 系统集成 | 托盘、全局快捷键、窗口显隐 |
| `commands/` | 暴露给前端的 `invoke` 接口 | 参数校验、调用下层、落盘 |
| `lib.rs` | 装配入口 | 注册插件、命令、窗口事件 |

### 数据文件位置

`%APPDATA%\agent-folder\data.json`

保存采用「写临时文件再替换」，避免中途崩溃产生半截 JSON。

### 常见改动指引

| 想做的事 | 改哪里 |
|---|---|
| 记录新增一个字段 | `model/folder.rs` + `src/lib/types.ts` |
| 新增一个设置项 | `model/settings.rs` + `src/lib/types.ts` |
| 新增后端命令 | 在 `commands/` 对应文件加函数，并在 `commands/mod.rs` 的 `app_commands!` 里登记 |
| 支持新的编辑器 | `services/editor.rs` 的 `editor_candidates()` 追加一项 |
| 调整扫描规则（深度/跳过目录） | `services/scanner.rs` |
| 改托盘菜单内容 | `system/tray.rs` 的 `build_menu()` |
| 改窗口显示/隐藏行为 | `system/window.rs` |

> 命令注册集中在 `commands/mod.rs` 的 `app_commands!` 宏里，
> `lib.rs` 不需要随新增命令改动。

---

## 三、前端 `src/`

| 目录 | 职责 | 典型内容 |
|---|---|---|
| `lib/types.ts` | 与后端对应的类型 | `FolderRecord`、`AppSettings` |
| `lib/commands.ts` | 后端命令封装 | `listFolders`、`openInEditor` |
| `lib/system.ts` | 窗口/对话框/剪贴板/自启动 | `hideWindow`、`pickFolder` |
| `lib/search.ts` | 搜索配置与关键词处理 | Fuse 配置、`queryTokens` |
| `lib/path.ts` | 路径与时间格式化 | `timeAgo`、`shortenPath` |
| `hooks/` | 可复用状态与副作用 | `useFolderList`、`useKeyboardNav`、`useToast` |
| `stores/useAppStore.ts` | 全局状态（Zustand） | 记录、设置、加载与保存 |
| `components/ui/` | 无业务语义的原子组件 | `Switch`、`SettingRow`、`ActionButton` |
| `components/` | 业务组件 | `FolderItem`、`SettingsDrawer`、`ColorPicker`、`TitleBar` |
| `App.tsx` | 装配与渲染 | 列表编排、键盘接线 |

### 列表行的交互能力

`FolderItem` 每行提供 7 个操作，全部有 `aria-label`：

| 操作 | 说明 |
|---|---|
| 在 VS Code 中打开 | 记一次历史并累加 `openCount` |
| 收藏 / 取消收藏 | 切换 `favorite`，影响分组置顶 |
| 重命名 | 双击名称或点编辑图标，仅改展示名，不动磁盘路径 |
| 标记颜色 | 打开 `ColorPicker`，选「默认」可清除 |
| 在资源管理器中显示 | 调用系统 `explorer /select` |
| 复制路径 | 写入剪贴板 |
| 移除记录 | 仅删记录，不删磁盘文件夹 |

### 约定

1. **界面不直接 `invoke`。** 一律走 `lib/commands.ts`，便于统一改参数与加日志。
2. **业务判断不放组件。** 例如「打开后是否隐藏窗口」这类规则放在 `hooks` 或 `store`。
3. **视觉原子先抽 `components/ui/`。** 同一种按钮出现两次以上就应抽取。
4. **新增交互优先写 Hook。** 组件保持「读状态 → 渲染」的简单结构。

### 常见改动指引

| 想做的事 | 改哪里 |
|---|---|
| 新增一个界面区块 | `components/` 下新建组件，在 `App.tsx` 装配 |
| 新增列表行的操作按钮 | `components/FolderItem.tsx` + `App.tsx` 传入回调 |
| 新增设置项 UI | `components/SettingsDrawer.tsx`（配合 `SettingRow`、`Switch`） |
| 新增快捷键 | `hooks/useKeyboardNav.ts`，并在设置面板的速查表补一行 |
| 调整搜索排序/分组 | `hooks/useFolderList.ts` |
| 调整主题色/圆角等全局样式 | `src/styles.css` |
| 新增标记颜色 | `components/ColorPicker.tsx` 的 `FOLDER_COLORS` |
| 新增项目类型识别 | `src-tauri/src/services/project.rs` 的 `RULES` + `src/lib/project.ts` 的 `PROJECT_STYLES` |

---

## 四、开发与构建

```bash
# 前端依赖
pnpm install

# 开发模式（热更新）
pnpm tauri dev

# 仅构建前端（含类型检查）
pnpm build

# 后端测试
cd src-tauri && cargo test

# 打包安装程序（NSIS）
pnpm tauri build
```

构建产物：

- 可执行文件：`src-tauri/target/release/agent-folder.exe`
- 安装包：`src-tauri/target/release/bundle/nsis/`

### 关于托盘图标

`src-tauri/vendor/tray-icon/` 是官方 `tray-icon` 的本地补丁副本，用于修复：

1. 注册失败时静默忽略、无法定位问题；
2. 取不到图标矩形时直接丢弃点击事件，导致托盘点了没反应。

升级 `tray-icon` 时请对照上游同步这两处改动，或确认上游已修复后再移除该补丁。

---

## 五、测试约定

- 后端：`cargo test`，覆盖记录增删与路径归一化等纯逻辑。
- 前端：当前以 `tsc --noEmit` 类型检查 + 手动流程验证为主。
- 涉及托盘/窗口的改动，需实测：最小化到托盘、托盘恢复、托盘退出、关闭到托盘。
