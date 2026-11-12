/**
 * 应用级状态：记录列表、设置与派生操作。
 *
 * 组件不直接调用 `api`，统一经由这里，保证「改状态」与「落盘」
 * 总是成对发生。
 */
import { create } from "zustand";
import * as commands from "../lib/commands";
import * as system from "../lib/system";
import {
  BUILTIN_PRESETS,
  DEFAULT_QUICK_HOTKEY,
  DEFAULT_SETTINGS,
  EMPTY_CLI_PATHS,
  EMPTY_CLI_PRESETS,
  LEGACY_QUICK_HOTKEYS,
  type AppSettings,
  type CliAgentId,
  type CliAgentStatus,
  type CliPreset,
  type EditorInfo,
  type FolderRecord,
  type StorageStatus,
} from "../lib/types";

/** 各 CLI 允许的启动模式；新增模式时必须同步 Rust 的 `*_MODES` 常量。 */
const OMP_LAUNCH_STYLES: readonly string[] = ["direct", "powershell"];
const QUICK_ACTIONS: readonly string[] = [
  "defaultEditor",
  "vscode",
  "codex",
  "claude",
  "omp",
  "opencode",
];

/** 某个 CLI 的全部预设（内置 + 用户自建）。 */
export function presetsOf(settings: AppSettings, agent: CliAgentId): CliPreset[] {
  return [...BUILTIN_PRESETS[agent], ...(settings.cliPresets?.[agent] ?? [])];
}

/** 校验选中的预设 id 是否存在；不存在时回落到 `default`。 */
function validMode(settings: AppSettings, agent: CliAgentId, value: string): string {
  const found = presetsOf(settings, agent).some((preset) => preset.id === value);
  return found ? value : "default";
}

/** 从后端读到的设置补齐缺失字段，并纠正越界的预设与开关值。 */
export function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    cliPaths: { ...EMPTY_CLI_PATHS, ...(settings.cliPaths ?? {}) },
    cliPresets: {
      ...EMPTY_CLI_PRESETS,
      ...(settings.cliPresets ?? {}),
    },
  };

  return {
    ...merged,
    // 旧默认值一次性升级；用户改过的组合与主动禁用保持原样。
    quickHotkey: LEGACY_QUICK_HOTKEYS.includes(merged.quickHotkey)
      ? DEFAULT_QUICK_HOTKEY
      : merged.quickHotkey,
    codexMode: validMode(merged, "codex", merged.codexMode),
    claudeMode: validMode(merged, "claude", merged.claudeMode),
    ompMode: validMode(merged, "omp", merged.ompMode),
    opencodeMode: validMode(merged, "opencode", merged.opencodeMode),
    ompLaunchStyle: (OMP_LAUNCH_STYLES.includes(merged.ompLaunchStyle)
      ? merged.ompLaunchStyle
      : DEFAULT_SETTINGS.ompLaunchStyle) as AppSettings["ompLaunchStyle"],
    quickEnterAction: (QUICK_ACTIONS.includes(merged.quickEnterAction)
      ? merged.quickEnterAction
      : DEFAULT_SETTINGS.quickEnterAction) as AppSettings["quickEnterAction"],
  };
}

let settingsWrite: Promise<void> = Promise.resolve();

interface AppState {
  folders: FolderRecord[];
  settings: AppSettings;
  editors: EditorInfo[];
  /** CLI 可用性；`null` 表示尚未探测。 */
  cliStatus: CliAgentStatus | null;
  loaded: boolean;
  /** 目录已不存在的记录 id 集合。 */
  missing: Set<string>;
  storageStatus: StorageStatus | null;

  load: () => Promise<void>;
  refreshEditors: () => Promise<void>;
  /** 重新探测 CLI 可用性（浮窗挂载时调用）。 */
  refreshCliStatus: () => Promise<void>;
  /** 重新探测 CLI 可执行文件路径，返回是否全部成功。 */
  refreshCliPaths: () => Promise<CliAgentStatus>;
  /** 后台探测失效记录，不阻塞列表加载。 */
  scanMissing: () => Promise<void>;
  /** 批量清理失效记录，返回删除数量。 */
  purgeMissing: () => Promise<number>;
  addFolder: (path?: string) => Promise<FolderRecord | null>;
  removeFolder: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<FolderRecord>;
  setFolderColor: (id: string, color: string | null) => Promise<FolderRecord>;
  setFolderTags: (id: string, tags: string[]) => Promise<FolderRecord>;
  openPath: (path: string) => Promise<commands.OpenResult>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  syncFolder: (record: FolderRecord) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  folders: [],
  settings: normalizeSettings(DEFAULT_SETTINGS),
  editors: [],
  cliStatus: null,
  loaded: false,
  missing: new Set<string>(),
  storageStatus: null,

  load: async () => {
    const [folders, settings, storageStatus] = await Promise.all([
      commands.listFolders(),
      commands.getSettings(),
      commands.getStorageStatus(),
    ]);
    set({ folders, settings: normalizeSettings(settings), storageStatus, loaded: true });
  },

  scanMissing: async () => {
    const ids = await commands.checkMissingFolders();
    set({ missing: new Set(ids) });
  },

  purgeMissing: async () => {
    const removed = await commands.removeMissingFolders();
    // 后端已删除，重新拉取以保持与磁盘一致。
    set({ folders: await commands.listFolders(), missing: new Set<string>() });
    return removed;
  },

  refreshEditors: async () => {
    set({ editors: await commands.detectEditors() });
  },

  refreshCliStatus: async () => {
    set({ cliStatus: await commands.detectCliAgents() });
  },

  refreshCliPaths: async () => {
    const [paths, status] = await commands.refreshCliPaths();
    set({
      // 后端已把结果写进 settings，这里同步到前端，避免两处不一致。
      settings: { ...get().settings, cliPaths: paths },
      cliStatus: status,
    });
    return status;
  },

  addFolder: async (path) => {
    const picked = path ?? (await system.pickFolder());
    if (!picked) return null;
    const record = await commands.addFolder(picked);
    set({ folders: await commands.listFolders() });
    return record;
  },

  removeFolder: async (id) => {
    await commands.removeFolder(id);
    set({ folders: get().folders.filter((f) => f.id !== id) });
  },

  toggleFavorite: async (id) => {
    const updated = await commands.toggleFavorite(id);
    set({ folders: get().folders.map((f) => (f.id === id ? updated : f)) });
  },

  renameFolder: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("名称不能为空");
    const updated = await commands.renameFolder(id, trimmed);
    set({ folders: get().folders.map((f) => (f.id === id ? updated : f)) });
    return updated;
  },

  setFolderColor: async (id, color) => {
    const updated = await commands.setFolderColor(id, color);
    set({ folders: get().folders.map((f) => (f.id === id ? updated : f)) });
    return updated;
  },

  setFolderTags: async (id, tags) => {
    const updated = await commands.setFolderTags(id, tags);
    set({ folders: get().folders.map((f) => (f.id === id ? updated : f)) });
    return updated;
  },

  openPath: async (path) => {
    const result = await commands.openInEditor(path);
    if (result.historySaved) get().syncFolder(result.record);
    return result;
  },

  saveSettings: (patch) => {
    const operation = settingsWrite.catch(() => {}).then(async () => {
      const previous = get().settings;
      const next = { ...previous, ...patch };

      try {
        if (patch.launchOnStartup !== undefined) {
          await system.setAutostart(patch.launchOnStartup);
        }
        const saved = await commands.saveSettings(next);
        set({ settings: saved });
        applyTheme(saved.theme);
      } catch (error) {
        // 自启动开关由系统管理，保存失败时要把它一起还原。
        if (patch.launchOnStartup !== undefined) {
          await system.setAutostart(previous.launchOnStartup).catch(() => {});
        }
        throw error;
      }
    });

    settingsWrite = operation.then(
      () => {},
      () => {},
    );
    return operation;
  },

  /** 把更新后的记录提到列表最前，保持「最近打开」语义。 */
  syncFolder: (record) => {
    const rest = get().folders.filter(
      (f) => f.path.toLowerCase() !== record.path.toLowerCase(),
    );
    set({ folders: [record, ...rest] });
  },
}));

/** 应用主题：`system` 跟随系统配色。 */
export function applyTheme(theme: AppSettings["theme"]) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
