/**
 * 前端共享类型定义。
 *
 * 与 Rust 的 `src-tauri/src/model/` 保持一一对应，
 * 修改任一侧字段时请同步另一侧。
 */

/** 一条文件夹记录。 */
export interface FolderRecord {
  id: string;
  path: string;
  name: string;
  tags: string[];
  color?: string | null;
  favorite: boolean;
  openCount: number;
  lastOpenedAt: number;
  createdAt: number;
  /** 识别出的项目类型（`rust`、`node` 等），普通文件夹为空。 */
  kind?: string | null;
}

/** 磁盘索引的一次命中。 */
export interface SearchHit {
  path: string;
  name: string;
  /** 相对扫描根的层级，越浅越优先。 */
  depth: number;
  /** 相关性分数，由后端计算。 */
  score: number;
}

/** 索引运行状态。 */
export interface IndexStatus {
  ready: boolean;
  building: boolean;
  entries: number;
  scanned: number;
  builtAt: number;
  roots: string[];
  truncated: boolean;
  warnings: string[];
  error?: string | null;
}

/** 索引查询结果（带状态，避免把「未就绪」误读成「没有」）。 */
export interface IndexSearchResult {
  ready: boolean;
  building: boolean;
  scanned: number;
  entries: number;
  hits: SearchHit[];
  truncated: boolean;
  warnings: string[];
}

/** 支持的 CLI 工具标识。 */
export type CliAgentId = "codex" | "claude" | "omp" | "opencode";

/** 快速启动浮窗中按 Enter 的默认动作。 */
export type QuickEnterAction =
  | "defaultEditor"
  | "vscode"
  | "codex"
  | "claude"
  | "omp"
  | "opencode";

/** omp 的启动方式：直接启动 exe，或新开 PowerShell 窗口。 */
export type OmpLaunchStyle = "direct" | "powershell";

/** 一个启动模式预设；`builtin` 为真时不可改名或删除。 */
export interface CliPreset {
  id: string;
  name: string;
  /**
   * 英文界面显示的名字。
   *
   * 只有内置预设提供——它们是代码里写死的，不进 `data.json`；
   * 用户自建预设只有一种语言的名字，留空即可。
   */
  nameEn?: string;
  /** 参数串，语法见 Rust `services::cli_args::split_args`。 */
  args: string;
  builtin: boolean;
}

/** 各 CLI 的用户自建预设（内置预设由代码提供，不在数据里）。 */
export interface CliPresets {
  codex: CliPreset[];
  claude: CliPreset[];
  omp: CliPreset[];
  opencode: CliPreset[];
}

/** 探测到的 CLI 可执行文件路径；空串表示未检测到。 */
export interface CliPaths {
  codex: string;
  claude: string;
  omp: string;
  opencode: string;
  codexOverride?: string | null;
  claudeOverride?: string | null;
  ompOverride?: string | null;
  opencodeOverride?: string | null;
  /** 探测时间戳（毫秒），0 表示从未探测。 */
  probedAt: number;
}

/** 用户设置。 */
export interface AppSettings {
  language: "zh-CN" | "en-US";
  theme: "dark" | "light" | "system";
  defaultEditor: string;
  globalHotkey: string;
  closeToTray: boolean;
  launchOnStartup: boolean;
  hideAfterOpen: boolean;
  trustFolders: boolean;
  searchRoots: string[];
  scanEnabled: boolean;
  editorPathOverride?: string | null;
  /** 各 CLI 当前选中的预设 id。 */
  codexMode: string;
  claudeMode: string;
  ompMode: string;
  opencodeMode: string;
  /** 用户自建的 CLI 启动模式预设。 */
  cliPresets: CliPresets;
  /** 旧字段，仅用于一次性迁移到 `cliPresets`。 */
  codexExtraArgs: string;
  claudeExtraArgs: string;
  ompExtraArgs: string;
  opencodeExtraArgs: string;
  ompLaunchStyle: OmpLaunchStyle;
  cliPaths: CliPaths;
  quickEnterAction: QuickEnterAction;
  quickOpenWith: boolean;
  /** 快速启动浮窗的全局快捷键；空串表示主动禁用。 */
  quickHotkey: string;
}

/** CLI 工具可用性。 */
export interface CliAgentStatus {
  codex: boolean;
  claude: boolean;
  omp: boolean;
  opencode: boolean;
}

export interface StorageStatus {
  warning: string | null;
  backupPath: string | null;
  readOnly: boolean;
}

export interface HotkeyStatus {
  toggleHotkey: string;
  toggleRegistered: boolean;
  toggleError: string | null;
  quickHotkey: string;
  quickRegistered: boolean;
  quickError: string | null;
}

/** 探测到的编辑器。 */
export interface EditorInfo {
  id: string;
  name: string;
  available: boolean;
  command?: string | null;
}

/** 空的 CLI 路径缓存。 */
export const EMPTY_CLI_PATHS: CliPaths = {
  codex: "",
  claude: "",
  omp: "",
  opencode: "",
  codexOverride: null,
  claudeOverride: null,
  ompOverride: null,
  opencodeOverride: null,
  probedAt: 0,
};

/** 空的用户预设集合。 */
export const EMPTY_CLI_PRESETS: CliPresets = {
  codex: [],
  claude: [],
  omp: [],
  opencode: [],
};

/**
 * 内置预设，必须与 Rust `model::settings::builtin_presets` 保持一致。
 *
 * 前端需要它们来渲染下拉栏（内置项不存进 `data.json`）。
 */
export const BUILTIN_PRESETS: Record<CliAgentId, CliPreset[]> = {
  codex: [
    { id: "default", name: "默认", nameEn: "Default", args: "", builtin: true },
    {
      id: "danger-full-access",
      name: "danger-full-access（高风险）",
      nameEn: "danger-full-access (high risk)",
      args: "--sandbox danger-full-access",
      builtin: true,
    },
    { id: "yolo", name: "yolo（高风险）", nameEn: "yolo (high risk)", args: "--yolo", builtin: true },
  ],
  claude: [
    { id: "default", name: "默认", nameEn: "Default", args: "", builtin: true },
    {
      id: "acceptEdits",
      name: "acceptEdits",
      nameEn: "acceptEdits",
      args: "--permission-mode acceptEdits",
      builtin: true,
    },
    {
      id: "dangerously-skip-permissions",
      name: "跳过权限确认（高风险）",
      nameEn: "Skip permission prompts (high risk)",
      args: "--dangerously-skip-permissions",
      builtin: true,
    },
  ],
  omp: [
    { id: "default", name: "默认", nameEn: "Default", args: "", builtin: true },
    {
      id: "yolo",
      name: "yolo（自动批准）",
      nameEn: "yolo (auto-approve)",
      args: "--auto-approve",
      builtin: true,
    },
  ],
  opencode: [
    { id: "default", name: "默认", nameEn: "Default", args: "", builtin: true },
    {
      id: "auto",
      name: "auto（自动批准）",
      nameEn: "auto (auto-approve)",
      args: "--auto",
      builtin: true,
    },
  ],
};

/** 快速启动快捷键的默认值，与 Rust `DEFAULT_QUICK_HOTKEY` 保持一致。 */
export const DEFAULT_QUICK_HOTKEY = "Ctrl+Space";

/** 1.1.1 及更早版本的默认值，用于一次性迁移，与 Rust 端保持一致。 */
export const LEGACY_QUICK_HOTKEYS: readonly string[] = ["Ctrl+Shift+Space", "Super+Space"];

/** 默认设置：与 Rust `AppSettings::default()` 保持一致。 */
export const DEFAULT_SETTINGS: AppSettings = {
  language: "zh-CN",
  theme: "dark",
  defaultEditor: "vscode",
  globalHotkey: "Ctrl+Alt+V",
  closeToTray: true,
  launchOnStartup: false,
  hideAfterOpen: true,
  trustFolders: false,
  searchRoots: [],
  scanEnabled: true,
  editorPathOverride: null,
  codexMode: "default",
  claudeMode: "default",
  ompMode: "default",
  opencodeMode: "default",
  cliPresets: EMPTY_CLI_PRESETS,
  codexExtraArgs: "",
  claudeExtraArgs: "",
  ompExtraArgs: "",
  opencodeExtraArgs: "",
  ompLaunchStyle: "direct",
  cliPaths: EMPTY_CLI_PATHS,
  quickEnterAction: "defaultEditor",
  quickOpenWith: true,
  quickHotkey: DEFAULT_QUICK_HOTKEY,
};
