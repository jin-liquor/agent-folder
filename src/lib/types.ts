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

/** 快速启动浮窗中按 Enter 的默认动作。 */
export type QuickEnterAction = "defaultEditor" | "vscode" | "codex" | "claude";

/** 用户设置。 */
export interface AppSettings {
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
  codexMode: "default" | "danger-full-access" | "yolo";
  claudeMode: "default" | "acceptEdits" | "dangerously-skip-permissions";
  quickEnterAction: QuickEnterAction;
  quickOpenWith: boolean;
}

/** CLI 工具可用性。 */
export interface CliAgentStatus {
  codex: boolean;
  claude: boolean;
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

/** 默认设置：与 Rust `AppSettings::default()` 保持一致。 */
export const DEFAULT_SETTINGS: AppSettings = {
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
  quickEnterAction: "defaultEditor",
  quickOpenWith: true,
};
