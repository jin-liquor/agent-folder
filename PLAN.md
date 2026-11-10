# Agent Folder — 开发计划与技术栈

> 一个 Windows 桌面小工具：搜索/浏览文件夹、维护常用文件夹历史记录、一键在 VS Code 中打开，UI 美观，支持最小化到系统托盘。

---

## 1. 产品目标

**核心价值**：把"找到文件夹 → 在 VS Code 中打开"这件事变成 1~2 次点击/按键完成。

### 功能清单

> 状态：全部已实现（0.1.0）。实现细节见 [README.md](./README.md) 与 [STRUCTURE.md](./STRUCTURE.md)。

| 优先级 | 功能 | 说明 | 状态 |
|---|---|---|---|
| P0 | 文件夹搜索 | 关键词模糊搜索已记录的文件夹；支持全盘/指定根目录的快速扫描搜索 | ✅ |
| P0 | 历史记录 | 自动记录每次打开的文件夹，按最近使用排序 | ✅ |
| P0 | 常用收藏 | 手动置顶/收藏文件夹，支持自定义名称和颜色标签 | ✅ |
| P0 | 一键打开 VS Code | 点击条目直接 `code <folder>` 打开 | ✅ |
| P0 | 系统托盘 | 关闭/最小化到托盘，托盘菜单可快速打开最近文件夹 | ✅ |
| P0 | 美观 UI | 现代化设计：圆角、毛玻璃/亚克力、暗色/亮色主题、流畅动效 | ✅ |
| P1 | 全局快捷键 | 全局热键（如 `Ctrl+Alt+V`）呼出主界面 | ✅ |
| P1 | 多编辑器支持 | 可选 VS Code / VS Code Insiders / Cursor / Windsurf 等 | ✅ |
| P1 | 文件夹浏览 | 原生目录选择对话框 + 内置目录树浏览 | ✅ |
| P1 | 静默启动 | 开机自启（可选）、启动时最小化到托盘 | ✅ |
| P2 | 命令面板式交互 | 类 Spotlight 的快速启动浮窗 | ✅ |
| P2 | 项目识别 | 显示文件夹图标/类型（Node/Python/Rust 等，按标记文件识别） | ✅ |
| P2 | 导入/导出 | 历史与收藏数据的 JSON 导入导出 | ✅ |

---

## 2. 技术栈（推荐方案）

### 首选：Tauri 2 + React + TypeScript

| 层 | 选型 | 理由 |
|---|---|---|
| 桌面框架 | **Tauri 2** | 体积小（~5-10 MB）、内存占用低、Rust 后端性能好、原生支持托盘/全局快捷键/自定义标题栏 |
| 前端框架 | **React 18 + TypeScript** | 生态成熟，组件丰富 |
| 构建工具 | **Vite** | 开发体验好，HMR 快 |
| 样式 | **Tailwind CSS 4 + shadcn/ui** | 快速做出精致 UI；shadcn/ui 组件质量高、可定制 |
| 动效 | **Framer Motion** | 列表进出、页面切换动画流畅自然 |
| 状态管理 | **Zustand** | 轻量，适合中小应用 |
| 本地存储 | **SQLite（tauri-plugin-sql）** 或 JSON 文件 | 历史/收藏数据持久化；数据量小用 JSON 也够，推荐 SQLite 便于搜索排序 |
| 模糊搜索 | **Fuse.js**（前端） 或 Rust 侧 **nucleo/fuzzy-matcher** | 中英文混合模糊搜索、拼音首字母搜索（P2） |
| 托盘/热键 | Tauri 内置 `tray-icon` + `global-shortcut` 插件 | 原生能力，无需额外依赖 |
| 打包 | Tauri bundler → **NSIS 安装包** | 单 exe 安装包，支持卸载器 |

### 备选方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|---|---|---|---|
| **Tauri 2**（推荐） | 体积小、性能好、Rust 系统调用方便 | 需要 Rust 工具链；WebView2 依赖 | 追求轻量精致 |
| Electron + React | 生态最大、Node API 直接用、无 Rust | 体积 80MB+、内存高 | 团队只熟 JS、要快速迭代 |
| WPF / WinUI 3 | 纯原生、系统融合最好 | UI 精致化成本高、仅 Windows | 明确只要 Windows 原生 |
| Flutter Desktop | UI 一致性好、动效强 | 桌面插件生态弱、调用系统 API 麻烦 | 已有 Flutter 经验 |

> 如果你没有 Rust 经验且想最快出成品，选 **Electron + React + Tailwind**（electron-builder 打包 + electron-traywindow 做托盘），其余设计不变。

---

## 3. 系统架构

```
┌─────────────────────────────────────────────┐
│                  UI 层 (React)               │
│  搜索栏 │ 文件夹列表(最近/收藏/搜索结果) │ 设置页  │
├─────────────────────────────────────────────┤
│            状态层 (Zustand stores)           │
│   foldersStore │ settingsStore │ uiStore    │
├─────────────────────────────────────────────┤
│          Tauri Commands (Rust 后端)          │
│  open_in_vscode │ scan_folders │ detect_    │
│  editors │ history CRUD │ tray │ hotkey     │
├─────────────────────────────────────────────┤
│  系统层：文件系统 │ 进程启动 │ 注册表(探测VSCode) │
│          SQLite/JSON 持久化                  │
└─────────────────────────────────────────────┘
```

### 模块划分

1. **folder-service**：文件夹扫描、存在性校验、路径规范化
2. **editor-service**：探测已安装的 VS Code 系编辑器（PATH 中的 `code`、注册表 `HKCU\Software\Classes\Applications\Code.exe`、默认安装路径 `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd`），执行打开命令
3. **history-service**：历史/收藏的增删改查、排序、去重、上限裁剪（如保留 500 条）
4. **tray-service**：托盘图标、右键菜单（显示最近 5 个文件夹 + 打开主界面 + 退出）、单击行为配置
5. **settings-service**：主题、热键、默认编辑器、自启动等配置

---

## 4. UI 设计方案

### 整体风格
- **参考**：Raycast / uTools / PowerToys Run 的现代简洁风
- **窗口**：无边框自定义标题栏（`decorations: false`），圆角 12px，背景亚克力/毛玻璃（Windows Mica/Acrylic，Tauri 2 支持 `windowEffects`）
- **主题**：暗色为默认 + 亮色切换，跟随系统；主色调建议 VS Code 蓝 `#007ACC` 或渐变紫蓝
- **字号**：Inter / 思源黑体，列表项 14px，行高舒适

### 页面布局（单主窗口 + 设置抽屉）

```
┌──────────────────────────────────────────┐
│  ◉ Agent Folder          ─ □ ✕  │  ← 自定义标题栏
├──────────────────────────────────────────┤
│  🔍 搜索文件夹...                    ⌘K  │  ← 搜索框（自动聚焦）
├──────────────────────────────────────────┤
│  ⭐ 收藏                                 │
│  📁 my-awesome-project        [VSCode ▾] │
│  📁 dotfiles                   [VSCode ▾]│
├──────────────────────────────────────────┤
│  🕘 最近使用                             │
│  📁 workspace\frontend        2 分钟前   │
│  📁 D:\projects\api-server    1 小时前   │
│  📁 E:\workspace\ml-notes     昨天       │
├──────────────────────────────────────────┤
│  [+ 添加文件夹]            [⚙ 设置] [—] │  ← 最小化到托盘按钮
└──────────────────────────────────────────┘
```

### 交互细节
- 输入即搜索：模糊匹配名称和路径，支持拼音首字母（P2）
- 键盘导航：`↑/↓` 选择、`Enter` 打开、`Ctrl+D` 收藏/取消、`Delete` 移除记录
- 打开成功后窗口自动隐藏到托盘（可配置）
- 列表项 hover 显示操作按钮：打开 / 在资源管理器中显示 / 复制路径 / 移除
- 空状态：插画 + 引导文案"添加你的第一个文件夹"
- 动效：列表项 stagger 入场、搜索结果淡入、收藏星标弹跳

---

## 5. 数据模型

```ts
interface FolderRecord {
  id: string;              // uuid
  path: string;            // 绝对路径（唯一键）
  name: string;            // 显示名（默认取目录名，可自定义）
  tags: string[];          // 标签
  color?: string;          // 颜色标签
  favorite: boolean;       // 是否收藏
  openCount: number;       // 打开次数（用于智能排序）
  lastOpenedAt: number;    // 时间戳
  createdAt: number;
}

interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  defaultEditor: 'vscode' | 'insiders' | 'cursor' | 'windsurf';
  globalHotkey: string;        // 默认 'Ctrl+Alt+V'
  closeToTray: boolean;        // 关闭即最小化到托盘
  launchOnStartup: boolean;
  hideAfterOpen: boolean;      // 打开文件夹后隐藏窗口
  searchRoots: string[];       // 全盘搜索的根目录范围
}
```

持久化：SQLite 两张表 `folders` / `settings`，或单个 `app-data.json`（`%APPDATA%/agent-folder/`）。

---

## 6. 关键技术实现要点

### 6.1 VS Code 探测与打开
按优先级探测编辑器可执行文件：
1. `where code`（PATH）
2. 注册表 `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Code.exe`
3. 默认安装路径探测：
   - `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd`
   - `%ProgramFiles%\Microsoft VS Code\bin\code.cmd`
4. 兜底方案：`vscode://file/<path>` URI 协议（`open::that` 调起）

打开命令：`code.cmd -n <folder>`（`-n` 新窗口，可配置复用窗口 `-r`）。

### 6.2 文件夹搜索
- **记录内搜索**（P0）：Fuse.js 模糊匹配 `name` + `path`
- **文件系统搜索**（P0-P1）：Rust 侧 `walkdir` / `ignore` crate（自动跳过 node_modules、.git），按 searchRoots 扫描，结果流式推送到前端；扫描结果缓存 5 分钟
- 中文路径注意：全程 UTF-8 处理

### 6.3 系统托盘（Tauri 2）
```rust
// tray-icon 插件：图标 + 菜单（最近文件夹动态生成）+ 事件
// 左键单击 → 显示/隐藏主窗口；右键 → 菜单
```
- 托盘图标提供 ico 多尺寸资源
- `RunEvent::ExitRequested` 拦截关闭 → 隐藏窗口（配合 `closeToTray` 设置）

### 6.4 自定义标题栏 + 窗口特效
- `tauri.conf.json`：`decorations: false`, `transparent: true`, `windowEffects: { effects: ["acrylic"|"mica"] }`
- 前端自绘最小化/最大化/关闭按钮，调用 `window.startDragging()` 实现拖拽

### 6.5 全局快捷键
`tauri-plugin-global-shortcut` 注册 `Ctrl+Alt+V`：呼出/隐藏主窗口并置顶聚焦。

---

## 7. 开发里程碑

| 阶段 | 内容 | 预估工时 |
|---|---|---|
| **M1 骨架** | 项目脚手架、窗口/无边框/托盘、空 UI 布局 | 0.5-1 天 |
| **M2 核心功能** | 文件夹记录 CRUD、搜索、一键打开 VS Code、历史排序 | 1-2 天 |
| **M3 UI 精修** | shadcn/ui 集成、主题、动效、键盘导航、空状态 | 1-2 天 |
| **M4 打磨** | 全局热键、设置页、文件系统扫描搜索、自启动 | 1-2 天 |
| **M5 发布** | 图标、NSIS 打包、安装测试、README | 0.5-1 天 |

**总计约 4-7 个工作日**（MVP：M1-M3 可在 2-3 天内完成）。

---

## 8. 项目结构（Tauri + React）

```
agent-folder/
├── src/                        # React 前端
│   ├── components/
│   │   ├── TitleBar.tsx
│   │   ├── SearchBar.tsx
│   │   ├── FolderList.tsx
│   │   ├── FolderItem.tsx
│   │   ├── SettingsDrawer.tsx
│   │   └── EmptyState.tsx
│   ├── stores/                 # Zustand
│   ├── hooks/
│   ├── lib/                    # tauri invoke 封装
│   └── App.tsx
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── commands.rs         # tauri commands
│   │   ├── editor.rs           # VS Code 探测/打开
│   │   ├── scanner.rs          # 文件夹扫描
│   │   ├── store.rs            # SQLite/JSON 持久化
│   │   ├── tray.rs
│   │   └── main.rs
│   ├── tauri.conf.json
│   └── icons/
├── package.json
└── PLAN.md
```

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| VS Code 安装位置多样（便携版/绿色版） | 多级探测 + 设置页手动指定 code 路径 + URI 兜底 |
| 全盘扫描慢/卡 UI | Rust 后台线程 + 流式推送 + 目录黑名单 + 结果缓存 |
| 中文/长路径显示问题 | UTF-8 全程、路径中间省略显示（`a\...\b`） |
| WebView2 缺失（Win10 老系统） | NSIS 安装器内置 WebView2 bootstrapper |
| 托盘图标 DPI 模糊 | 提供 16/24/32/48/256 多尺寸 ico |
| Rust 上手成本 | 后端逻辑简单（都是现成 crate）；若卡壳可降级 Electron 方案 |

---

## 10. 后续可扩展方向

- 多工作区支持：一个条目同时用 VS Code 打开多个文件夹（`.code-workspace` 生成）
- 远程/WSL 路径支持（`vscode-remote://`）
- 自动监听最近项目：扫描 VS Code 自身的 `storage.json` 导入最近打开历史
- 团队共享收藏列表
