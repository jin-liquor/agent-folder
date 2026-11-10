/**
 * 与 Rust 后端命令一一对应的调用封装。
 *
 * 约定：
 * - 每个函数只负责「调用 + 返回类型」，不放业务判断；
 * - 新增后端命令时，在此追加同名导出，界面层不直接使用 `invoke`。
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  EditorInfo,
  FolderRecord,
  HotkeyStatus,
  StorageStatus,
} from "./types";

/** 打开文件夹命令的返回值。 */
export interface OpenResult {
  record: FolderRecord;
  command: string;
  historySaved: boolean;
  historyError: string | null;
}

// ---------------------------------------------------------------- 文件夹记录
export const listFolders = () => invoke<FolderRecord[]>("list_folders");
export const addFolder = (path: string) => invoke<FolderRecord>("add_folder", { path });
export const removeFolder = (id: string) => invoke<void>("remove_folder", { id });
export const toggleFavorite = (id: string) => invoke<FolderRecord>("toggle_favorite", { id });
export const renameFolder = (id: string, name: string) =>
  invoke<FolderRecord>("rename_folder", { id, name });
export const setFolderColor = (id: string, color: string | null) =>
  invoke<FolderRecord>("set_folder_color", { id, color });
export const setFolderTags = (id: string, tags: string[]) =>
  invoke<FolderRecord>("set_folder_tags", { id, tags });

/** 返回目录已不存在的记录 id 列表。 */
export const checkMissingFolders = () => invoke<string[]>("check_missing_folders");
/** 批量移除失效记录，返回删除数量。 */
export const removeMissingFolders = () => invoke<number>("remove_missing_folders");

// ------------------------------------------------------------------ 目录浏览
/** 目录树节点。 */
export interface DirEntry {
  path: string;
  name: string;
  hasChildren: boolean;
}

/** 列出可用磁盘（目录树根节点）。 */
export const listDrives = () => invoke<DirEntry[]>("list_drives");
/** 列出指定目录的子目录。 */
export const listSubdirs = (path: string) => invoke<DirEntry[]>("list_subdirs", { path });

// -------------------------------------------------------------------- 启动器
export const openInEditor = (path: string, editor?: string) =>
  invoke<OpenResult>("open_in_editor", { path, editor: editor ?? null });
export const revealInExplorer = (path: string) => invoke<void>("reveal_in_explorer", { path });
export const detectEditors = () => invoke<EditorInfo[]>("detect_editors");

// ---------------------------------------------------------------------- 设置
export const getSettings = () => invoke<AppSettings>("get_settings");
export const getStorageStatus = () => invoke<StorageStatus>("get_storage_status");
export const recoverStorageBackup = () => invoke<number>("recover_storage_backup");
export const reloadStorageData = () => invoke<number>("reload_storage_data");
export const exportStorageBackup = (path: string) =>
  invoke<void>("export_storage_backup", { path });
export const getHotkeyStatus = () => invoke<HotkeyStatus>("get_hotkey_status");
export const retryHotkeys = () => invoke<HotkeyStatus>("retry_hotkeys");
export const saveSettings = (settings: AppSettings) =>
  invoke<AppSettings>("save_settings", { settings });

// -------------------------------------------------------------------- 磁盘扫描
export const scanFolders = (query: string) => invoke<string[]>("scan_folders", { query });

// ------------------------------------------------------------------ 导入导出
/** 导出全部记录，返回写入的记录条数。 */
export const exportData = (path: string) => invoke<number>("export_data", { path });
/** 导入记录，返回新增与跳过的数量。 */
export const importData = (path: string) =>
  invoke<{ added: number; skipped: number; trimmed: number }>("import_data", { path });
