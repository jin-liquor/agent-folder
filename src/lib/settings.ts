/**
 * 设置的纯逻辑：字段补齐与越界值归一化。
 *
 * 单独放在 `lib/` 而不是 store 里，是为了能在 node 环境下直接单元测试
 * （store 依赖 Tauri 的 JS API，测试环境拿不到）。
 * 这里必须与 Rust `model::settings::AppSettings::normalize` 保持一致。
 */
import {
  BUILTIN_PRESETS,
  DEFAULT_QUICK_HOTKEY,
  DEFAULT_SETTINGS,
  EMPTY_CLI_PATHS,
  EMPTY_CLI_PRESETS,
  LEGACY_QUICK_HOTKEYS,
  normalizeIndexRefreshMinutes,
  type AppSettings,
  type CliAgentId,
  type CliPreset,
} from "./types";

/** omp 允许的启动方式；新增模式时必须同步 Rust 的 `OMP_LAUNCH_STYLES`。 */
export const OMP_LAUNCH_STYLES: readonly string[] = ["direct", "powershell"];

/** 快速启动浮窗允许的 Enter 动作；新增动作时必须同步 Rust 的 `QUICK_ACTIONS`。 */
export const QUICK_ACTIONS: readonly string[] = [
  "defaultEditor",
  "vscode",
  "explorer",
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
    // 间隔必须落在白名单内，否则下拉框会出现空白项。
    indexRefreshMinutes: normalizeIndexRefreshMinutes(merged.indexRefreshMinutes),
  };
}
