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
  editorPathOverride?: string | null;
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
  trustFolders: true,
  searchRoots: [],
  editorPathOverride: null,
};
