/**
 * 设置页：主窗口内的独立页面（不新开窗口）。
 *
 * 左侧是目录（点击跳转、滚动高亮，说明文字悬停才显示），
 * 右侧按分区排列设置行；每个改动立即持久化，失败时回滚并提示原因。
 */
import { Fragment, useMemo } from "react";
import { LANGUAGE_OPTIONS } from "../lib/i18n";
import {
  BUILTIN_PRESETS,
  INDEX_REFRESH_MINUTES,
  indexIntervalLabel,
  type AppSettings,
  type CliAgentId,
  type QuickEnterAction,
} from "../lib/types";
import { useSectionNav } from "../hooks/useSectionNav";
import { useSettingsPage } from "../hooks/useSettingsPage";
import CliPresetEditor from "./CliPresetEditor";
import DataPortControls from "./DataPortControls";
import HotkeyInput from "./HotkeyInput";
import ScanRootsEditor from "./ScanRootsEditor";
import { ArrowLeftIcon, CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "./Icons";
import SectionNav, { type SectionNavItem } from "./ui/SectionNav";
import SettingRow from "./ui/SettingRow";
import SettingSection from "./ui/SettingSection";
import Switch from "./ui/Switch";

/** 主题选项。 */
const THEME_OPTIONS = [
  { value: "light", zh: "浅色", en: "Light", Icon: SunIcon },
  { value: "dark", zh: "深色", en: "Dark", Icon: MoonIcon },
  { value: "system", zh: "跟随系统", en: "System", Icon: MonitorIcon },
] as const;

/** 左侧目录的分区定义；说明文本只出现在悬停提示里。 */
const SECTIONS = [
  {
    id: "appearance",
    zh: "外观",
    en: "Appearance",
    hintZh: "主题与界面语言，切换后立即生效",
    hintEn: "Theme and interface language; applied immediately",
  },
  {
    id: "editor",
    zh: "编辑器",
    en: "Editor",
    hintZh: "打开文件夹时使用的默认程序",
    hintEn: "The program used when opening a folder",
  },
  {
    id: "quick",
    zh: "快速启动",
    en: "Quick launch",
    hintZh: "浮窗里按 Enter 的默认动作与行内图标",
    hintEn: "Default Enter action and inline icons in the quick-launch palette",
  },
  {
    id: "cli",
    zh: "CLI",
    en: "CLI",
    hintZh: "Codex / Claude / omp / opencode 的启动模式、可执行文件路径与探测",
    hintEn: "Launch modes, executable paths, and detection for the CLI tools",
  },
  {
    id: "shortcut",
    zh: "快捷键",
    en: "Shortcuts",
    hintZh: "两处全局快捷键与键盘速查",
    hintEn: "Both global shortcuts and the keyboard reference",
  },
  {
    id: "behavior",
    zh: "行为",
    en: "Behavior",
    hintZh: "托盘、自启动与打开后的窗口行为",
    hintEn: "Tray, startup, and window behavior after opening",
  },
  {
    id: "index",
    zh: "磁盘索引",
    en: "Disk index",
    hintZh: "本机磁盘搜索、自动索引与扫描范围",
    hintEn: "Disk search, automatic indexing, and scan roots",
  },
  {
    id: "data",
    zh: "数据",
    en: "Data",
    hintZh: "记录备份的导出与导入",
    hintEn: "Export and import backups of saved folders",
  },
] as const;

/** 稳定的分区 id 列表（滚动高亮使用，引用必须保持不变）。 */
const SECTION_IDS: string[] = SECTIONS.map((section) => section.id);

/** 快速启动浮窗里 Enter 可执行的动作。 */
const QUICK_ACTION_OPTIONS: { value: QuickEnterAction; zh: string; en: string }[] = [
  { value: "defaultEditor", zh: "跟随默认编辑器", en: "Use default editor" },
  { value: "explorer", zh: "文件资源管理器", en: "File Explorer" },
  { value: "vscode", zh: "Visual Studio Code", en: "Visual Studio Code" },
  { value: "codex", zh: "Codex", en: "Codex" },
  { value: "claude", zh: "Claude Code", en: "Claude Code" },
  { value: "omp", zh: "omp", en: "omp" },
  { value: "opencode", zh: "opencode", en: "opencode" },
];

/** 各 CLI 的展示信息，避免设置页出现四段重复 JSX。 */
interface CliConfig {
  id: CliAgentId;
  name: string;
  /** 该 CLI 的预设字段名（`codexMode` 等）。 */
  modeKey: keyof AppSettings;
  /** 附加参数占位示例。 */
  placeholder: string;
}

const CLI_CONFIGS: CliConfig[] = [
  { id: "codex", name: "codex", modeKey: "codexMode", placeholder: "--model gpt-5-codex" },
  { id: "claude", name: "Claude Code", modeKey: "claudeMode", placeholder: "--model sonnet" },
  { id: "omp", name: "omp", modeKey: "ompMode", placeholder: "--model opus" },
  {
    id: "opencode",
    name: "opencode",
    modeKey: "opencodeMode",
    placeholder: "--model anthropic/claude-sonnet",
  },
];

/** 快捷键速查表（不含可配置的两处全局快捷键）。 */
const SHORTCUTS: [string, string, string][] = [
  ["Ctrl K", "聚焦搜索框", "Focus search"],
  ["↑ ↓", "选择条目", "Move selection"],
  ["Enter", "在编辑器中打开", "Open in editor"],
  ["Ctrl D", "收藏 / 取消收藏", "Toggle favorite"],
  ["Delete", "移除记录", "Remove record"],
  ["Ctrl ,", "打开设置", "Open settings"],
  ["Esc", "返回列表 / 清空搜索", "Back to list / clear search"],
  ["右键 / Shift F10", "更多操作菜单", "More actions menu"],
];

/** 只取路径最后一段；完整路径放 `title`，避免状态行被长路径撑成多行。 */
function fileName(path: string): string {
  if (!path) return "—";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

const SELECT_CLASS =
  "h-8 max-w-[210px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[12px] text-[var(--text-primary)] outline-none disabled:opacity-50";
const OPTION_CLASS = "bg-[var(--glass-solid)] text-[var(--text-primary)]";
const TEXT_BUTTON_CLASS =
  "rounded-md border border-[var(--glass-border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50";
const TEXT_INPUT_CLASS =
  "min-w-0 flex-1 rounded border border-[var(--glass-border)] bg-[var(--glass-solid)] px-1.5 py-1 text-[10px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent)]";

interface Props {
  /** 返回主列表。 */
  onBack: () => void;
  /** 导入完成后刷新记录列表。 */
  onImported: () => void;
  /** 结果提示，复用外层 toast。 */
  onToast: (message: string) => void;
}

export default function SettingsPage({ onBack, onImported, onToast }: Props) {
  const {
    draft,
    setDraft,
    update,
    persist,
    saveError,
    english,
    label,
    hotkeyStatus,
    hotkeyConflict,
    retryingHotkeys,
    retryHotkeys,
    indexSummary,
    indexBusy,
    rebuildIndex,
    cliPaths,
    manualPaths,
    setManualPaths,
    cliErrors,
    probing,
    reProbe,
    saveCliPath,
    chooseCliPath,
    editorOptions,
    editorLabel,
  } = useSettingsPage({ onToast });

  const { containerRef, active, jump } = useSectionNav(SECTION_IDS);

  const navItems: SectionNavItem[] = useMemo(
    () =>
      SECTIONS.map((section) => ({
        id: section.id,
        label: english ? section.en : section.zh,
        hint: english ? section.hintEn : section.hintZh,
      })),
    [english],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--glass-border)] px-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={label("返回", "Back")}
          title={label("返回列表（Esc）", "Back to list (Esc)")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeftIcon size={15} />
        </button>
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {label("设置", "Settings")}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <SectionNav
          items={navItems}
          active={active}
          onSelect={jump}
          ariaLabel={label("设置目录", "Settings sections")}
        />

        <div ref={containerRef} className="min-w-0 flex-1 overflow-y-auto px-6 pt-4 pb-8">
          {saveError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-[11px] leading-relaxed break-words text-red-500"
            >
              {label("保存失败", "Save failed")}: {saveError}
            </div>
          )}

          <SettingSection
            id="appearance"
            title={label("外观", "Appearance")}
            hint={label(
              "主题与界面语言，切换后立即生效",
              "Theme and interface language; applied immediately",
            )}
          >
            <SettingRow label={label("主题", "Theme")}>
              <div className="flex gap-1.5">
                {THEME_OPTIONS.map(({ value, zh, en, Icon }) => {
                  const title = label(zh, en);
                  return (
                    <button
                      key={value}
                      type="button"
                      title={title}
                      aria-label={title}
                      aria-pressed={draft.theme === value}
                      onClick={() => update({ theme: value })}
                      className={`flex h-8 w-12 items-center justify-center rounded-md border transition ${
                        draft.theme === value
                          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                          : "border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                      }`}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            </SettingRow>

            <SettingRow label={label("语言", "Language")}>
              <select
                value={draft.language}
                aria-label={label("语言", "Language")}
                onChange={(event) =>
                  update({ language: event.target.value as AppSettings["language"] })
                }
                className={SELECT_CLASS}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className={OPTION_CLASS}>
                    {option.label}
                  </option>
                ))}
              </select>
            </SettingRow>
          </SettingSection>

          <SettingSection
            id="editor"
            title={label("编辑器", "Editor")}
            hint={label(
              "「文件资源管理器」把目标目录直接打开并进入；编辑器在新窗口中打开项目。",
              "File Explorer opens the folder directly; code editors open the project in a new window.",
            )}
          >
            <SettingRow
              label={label("默认编辑器", "Default editor")}
              hint={label(
                "主列表按 Enter 时使用的程序；未检测到的编辑器显示为不可选。",
                "Used when pressing Enter in the main list; editors that were not detected are disabled.",
              )}
            >
              <select
                value={draft.defaultEditor}
                aria-label={label("默认编辑器", "Default editor")}
                onChange={(event) => update({ defaultEditor: event.target.value })}
                className={SELECT_CLASS}
              >
                {editorOptions.map((editor) => (
                  <option
                    key={editor.id}
                    value={editor.id}
                    disabled={!editor.available}
                    className={OPTION_CLASS}
                  >
                    {editorLabel(editor)}
                    {editor.available ? "" : label("（未检测到）", " (not detected)")}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              label={label("编辑器可执行文件路径", "Editor executable path")}
              hint={label(
                "留空则自动检测；仅在需要覆盖自动探测结果时填写。",
                "Leave empty to detect automatically; set it only when overriding detection.",
              )}
            >
              <input
                value={draft.editorPathOverride ?? ""}
                placeholder={label("自动检测", "Auto-detect")}
                spellCheck={false}
                aria-label={label("编辑器可执行文件路径", "Editor executable path")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    editorPathOverride: event.target.value || null,
                  }))
                }
                onBlur={() => persist({ editorPathOverride: draft.editorPathOverride })}
                className="h-8 w-[190px] rounded-md border border-[var(--glass-border)] bg-transparent px-2 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
              />
            </SettingRow>
          </SettingSection>

          <SettingSection
            id="quick"
            title={label("快速启动", "Quick launch")}
            hint={label(
              "浮窗内保留 ↑ ↓ 选择与 Enter 打开，切换打开方式用行内图标。",
              "The palette keeps ↑ ↓ to select and Enter to open; inline icons switch the open method.",
            )}
          >
            <SettingRow
              label={label("Enter 默认动作", "Enter action")}
              hint={label(
                "浮窗里按 Enter 执行的动作；行内图标可随时切换打开方式。",
                "Action executed by Enter in the palette; inline icons can switch it at any time.",
              )}
            >
              <select
                value={draft.quickEnterAction}
                aria-label={label("快速启动默认动作", "Quick-launch default action")}
                onChange={(event) =>
                  update({
                    quickEnterAction: event.target.value as AppSettings["quickEnterAction"],
                  })
                }
                className={SELECT_CLASS}
              >
                {QUICK_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className={OPTION_CLASS}>
                    {label(option.zh, option.en)}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              label={label("显示打开方式图标", "Show open-method icons")}
              hint={label(
                "在结果行右侧显示 VS Code、各 CLI 与资源管理器图标。",
                "Show VS Code, CLI, and File Explorer icons on the right of each result row.",
              )}
            >
              <Switch
                label={label("显示打开方式图标", "Show open-method icons")}
                checked={draft.quickOpenWith}
                onChange={(value) => update({ quickOpenWith: value })}
              />
            </SettingRow>
          </SettingSection>

          <SettingSection
            id="cli"
            title={label("CLI", "CLI")}
            hint={label(
              "首次启动自动探测并保存可执行文件路径；文件被移动或卸载后可重新探测。",
              "Executables are detected and cached on first launch; probe again after a move or uninstall.",
            )}
          >
            {CLI_CONFIGS.map((config) => (
              <SettingRow
                key={`mode-${config.id}`}
                label={label(`${config.name} 启动模式`, `${config.name} launch mode`)}
                hint={label(
                  "启动该 CLI 时附加的参数预设；可新增自己的预设。",
                  "Argument presets appended when launching this CLI; add your own presets freely.",
                )}
              >
                <CliPresetEditor
                  agent={config.id}
                  language={draft.language}
                  builtins={BUILTIN_PRESETS[config.id]}
                  userPresets={draft.cliPresets[config.id] ?? []}
                  selected={String(draft[config.modeKey] ?? "default")}
                  onSelect={(id) => update({ [config.modeKey]: id } as Partial<AppSettings>)}
                  onChange={(presets) =>
                    update({ cliPresets: { ...draft.cliPresets, [config.id]: presets } })
                  }
                  placeholder={config.placeholder}
                />
              </SettingRow>
            ))}

            <SettingRow
              label={label("omp 启动方式", "omp launch mode")}
              hint={label(
                "直接启动 omp.exe；选择 PowerShell 会新开窗口并加载你的 profile。",
                "Launch omp.exe directly; PowerShell opens a new window and loads your profile.",
              )}
            >
              <select
                value={draft.ompLaunchStyle}
                aria-label={label("omp 启动方式", "omp launch mode")}
                onChange={(event) =>
                  update({ ompLaunchStyle: event.target.value as AppSettings["ompLaunchStyle"] })
                }
                className={SELECT_CLASS}
              >
                <option className={OPTION_CLASS} value="direct">
                  {label("直接启动（推荐）", "Launch directly (recommended)")}
                </option>
                <option className={OPTION_CLASS} value="powershell">
                  {label("PowerShell 窗口", "PowerShell window")}
                </option>
              </select>
            </SettingRow>

            {CLI_CONFIGS.map((config) => {
              const detected = String(cliPaths[config.id] ?? "");
              const manual = manualPaths[config.id];
              const effective = manual || detected;
              return (
                <SettingRow
                  key={`path-${config.id}`}
                  label={label(`${config.name} 路径`, `${config.name} path`)}
                  hint={label(
                    "留空表示自动检测；填写的路径优先于探测结果，保存在数据文件中。",
                    "Leave empty to auto-detect; a manual path overrides detection and is stored in the data file.",
                  )}
                  note={
                    <span
                      className={cliErrors[config.id] ? "text-[var(--danger)]" : undefined}
                      title={
                        cliErrors[config.id] ||
                        [detected, effective].filter(Boolean).join("\n") ||
                        label("未检测到可执行文件", "No executable detected")
                      }
                    >
                      {cliErrors[config.id] ||
                        (manual
                          ? label(`手动：${fileName(manual)}`, `Manual: ${fileName(manual)}`)
                          : detected
                            ? label(
                                `自动检测：${fileName(detected)}`,
                                `Detected: ${fileName(detected)}`,
                              )
                            : label("未检测到", "Not detected"))}
                    </span>
                  }
                >
                  <div className="flex w-[250px] items-center gap-1">
                    <input
                      value={manual}
                      onChange={(event) =>
                        setManualPaths((current) => ({
                          ...current,
                          [config.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveCliPath(config.id, manual);
                        }
                      }}
                      placeholder={label("自动检测", "Auto-detect")}
                      aria-label={label(`${config.name} 手动路径`, `${config.name} manual path`)}
                      className={TEXT_INPUT_CLASS}
                    />
                    <button
                      type="button"
                      title={label("选择文件", "Choose file")}
                      aria-label={label(`${config.name} 选择文件`, `Choose ${config.name} file`)}
                      onClick={() => void chooseCliPath(config.id)}
                      className={TEXT_BUTTON_CLASS}
                    >
                      …
                    </button>
                    <button
                      type="button"
                      title={label("保存 CLI 路径", "Save CLI path")}
                      aria-label={label(`${config.name} 保存路径`, `Save ${config.name} path`)}
                      onClick={() => void saveCliPath(config.id, manual)}
                      className={TEXT_BUTTON_CLASS}
                    >
                      {label("保存", "Save")}
                    </button>
                    {manual && (
                      <button
                        type="button"
                        title={label("恢复自动检测", "Restore auto-detection")}
                        aria-label={label(
                          `${config.name} 恢复自动检测`,
                          `Restore ${config.name} auto-detection`,
                        )}
                        onClick={() => {
                          setManualPaths((current) => ({ ...current, [config.id]: "" }));
                          void saveCliPath(config.id, "");
                        }}
                        className={`${TEXT_BUTTON_CLASS} hover:border-[var(--danger)] hover:text-[var(--danger)]`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </SettingRow>
              );
            })}

            <SettingRow
              label={label("重新探测", "Probe again")}
              hint={label(
                "重新扫描系统 PATH 与常见安装位置，更新上面的检测结果。",
                "Rescan the system PATH and common install locations to refresh the results above.",
              )}
              note={
                cliPaths.probedAt > 0
                  ? label(
                      `上次探测：${new Date(cliPaths.probedAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`,
                      `Last probed: ${new Date(cliPaths.probedAt).toLocaleString("en-US", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`,
                    )
                  : label("尚未探测", "Not probed yet")
              }
            >
              <div className="flex items-center gap-2">
                {CLI_CONFIGS.map((config) => {
                  const path = String(cliPaths[config.id] ?? "");
                  const found = path.length > 0;
                  return (
                    <Fragment key={config.id}>
                      <span
                        title={path || label("未检测到", "Not detected")}
                        className={`rounded border border-[var(--glass-border)] px-1.5 py-0.5 text-[10px] ${
                          found
                            ? "text-[var(--text-secondary)]"
                            : "text-[var(--text-secondary)] opacity-50"
                        }`}
                      >
                        {found ? "✓" : "✕"} {config.id}
                      </span>
                    </Fragment>
                  );
                })}
                <button
                  type="button"
                  onClick={() => void reProbe()}
                  disabled={probing}
                  className={TEXT_BUTTON_CLASS}
                >
                  {probing ? label("探测中…", "Probing…") : label("重新探测", "Probe again")}
                </button>
              </div>
            </SettingRow>
          </SettingSection>

          <SettingSection
            id="shortcut"
            title={label("快捷键", "Shortcuts")}
            hint={label(
              "两处快捷键都可以修改；快速启动快捷键清空即视为禁用。",
              "Both shortcuts are configurable. Clearing the quick-launch shortcut disables it.",
            )}
          >
            <SettingRow
              label={label("全局快捷键", "Global shortcut")}
              hint={label("打开 / 隐藏主窗口的全局组合键。", "Global combination that shows or hides the main window.")}
            >
              <HotkeyInput
                value={draft.globalHotkey}
                language={draft.language}
                onChange={(hotkey) => update({ globalHotkey: hotkey })}
                error={saveError}
              />
            </SettingRow>

            <SettingRow
              label={label("快速启动快捷键", "Quick-launch shortcut")}
              hint={label("打开快速启动浮窗；清空即禁用。", "Opens the quick-launch palette; clear it to disable.")}
            >
              <HotkeyInput
                value={draft.quickHotkey}
                language={draft.language}
                onChange={(hotkey) => update({ quickHotkey: hotkey })}
                allowEmpty
              />
            </SettingRow>

            <div className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 text-[11px] leading-relaxed break-words text-[var(--text-secondary)]">
                {hotkeyStatus
                  ? hotkeyConflict
                    ? null
                    : label("两处快捷键均已注册。", "Both shortcuts are registered.")
                  : label("正在读取快捷键状态…", "Reading shortcut status…")}
                {hotkeyConflict && (
                  <span role="alert" className="text-[var(--danger)]">
                    {hotkeyConflict}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void retryHotkeys()}
                disabled={retryingHotkeys}
                className={TEXT_BUTTON_CLASS}
              >
                {retryingHotkeys ? label("重试中…", "Retrying…") : label("重试快捷键", "Retry shortcuts")}
              </button>
            </div>

            <div className="py-3">
              <div className="rounded-md border border-[var(--glass-border)] bg-[var(--canvas-subtle)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                <div className="mb-1.5 flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                  <CheckIcon size={12} className="text-emerald-500" />
                  {label("快捷键速查", "Shortcut reference")}
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {SHORTCUTS.map(([keys, zh, en]) => (
                    <div key={keys} className="contents">
                      <span className="kbd">{keys}</span>
                      <span>{label(zh, en)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SettingSection>

          <SettingSection
            id="behavior"
            title={label("行为", "Behavior")}
            hint={label(
              "窗口、托盘与开机自启的默认行为。",
              "Default window, tray, and startup behavior.",
            )}
          >
            <SettingRow
              label={label("关闭时隐藏到系统托盘", "Hide to system tray on close")}
              hint={label(
                "开启后关闭按钮会隐藏窗口，可从托盘恢复。",
                "When enabled, the close button hides the window; restore it from the tray.",
              )}
            >
              <Switch
                label={label("关闭时隐藏到系统托盘", "Hide to system tray on close")}
                checked={draft.closeToTray}
                onChange={(value) => update({ closeToTray: value })}
              />
            </SettingRow>

            <SettingRow
              label={label("跳过 VS Code 工作区信任确认", "Skip VS Code workspace trust prompt")}
              hint={label(
                "默认关闭；仅对 VS Code 和 Insiders 生效。开启后不再弹出工作区安全确认，建议只用于你信任的项目。",
                "Off by default; applies to VS Code and Insiders. Enabling skips workspace security prompts; use only with trusted projects.",
              )}
            >
              <Switch
                label={label("跳过 VS Code 工作区信任确认", "Skip VS Code workspace trust prompt")}
                checked={draft.trustFolders}
                onChange={(value) => update({ trustFolders: value })}
              />
            </SettingRow>

            <SettingRow
              label={label("打开后隐藏窗口", "Hide window after opening")}
              hint={label(
                "打开文件夹后自动隐藏到托盘。",
                "Automatically hide to the tray after opening a folder.",
              )}
            >
              <Switch
                label={label("打开后隐藏窗口", "Hide window after opening")}
                checked={draft.hideAfterOpen}
                onChange={(value) => update({ hideAfterOpen: value })}
              />
            </SettingRow>

            <SettingRow
              label={label("开机自启动", "Launch at startup")}
              hint={label(
                "登录 Windows 后自动在托盘待命。",
                "Start in the tray when you sign in to Windows.",
              )}
            >
              <Switch
                label={label("开机自启动", "Launch at startup")}
                checked={draft.launchOnStartup}
                onChange={(value) => update({ launchOnStartup: value })}
              />
            </SettingRow>
          </SettingSection>

          <SettingSection
            id="index"
            title={label("磁盘索引", "Disk index")}
            hint={label(
              "启动时在后台建立索引，之后查询只读内存；目录变动可手动重建，也可按间隔自动重建。",
              "An index is built in the background at startup and queries read memory; rebuild manually or on a fixed interval.",
            )}
          >
            <SettingRow
              label={label("本机磁盘搜索", "Disk search")}
              hint={label(
                "开启后会在配置的目录范围内查找未收藏项目。",
                "Search configured roots for projects that are not saved yet.",
              )}
            >
              <Switch
                label={label("本机磁盘搜索", "Disk search")}
                checked={draft.scanEnabled}
                onChange={(value) => update({ scanEnabled: value })}
              />
            </SettingRow>

            <SettingRow
              label={label("定时自动索引", "Scheduled auto indexing")}
              hint={label(
                "按下方间隔在后台自动重建索引；关闭后只在启动时和手动重建时更新。",
                "Rebuild the index in the background at the interval below; when off, it only updates at startup or manually.",
              )}
            >
              <Switch
                label={label("定时自动索引", "Scheduled auto indexing")}
                checked={draft.indexAutoRefresh}
                onChange={(value) => update({ indexAutoRefresh: value })}
              />
            </SettingRow>

            <SettingRow
              label={label("自动索引间隔", "Auto-index interval")}
              hint={label(
                "两次自动重建之间的间隔；间隔越短，磁盘读取越频繁。",
                "Time between automatic rebuilds; shorter intervals read the disk more often.",
              )}
            >
              <select
                value={draft.indexRefreshMinutes}
                aria-label={label("自动索引间隔", "Auto-index interval")}
                disabled={!draft.indexAutoRefresh}
                onChange={(event) =>
                  update({ indexRefreshMinutes: Number(event.target.value) })
                }
                className={SELECT_CLASS}
              >
                {INDEX_REFRESH_MINUTES.map((minutes) => (
                  <option key={minutes} value={minutes} className={OPTION_CLASS}>
                    {indexIntervalLabel(minutes, english)}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              label={label("索引状态", "Index status")}
              hint={label(
                "显示当前索引的条目数与建立时间；「重建」会立即开始一次完整扫描。",
                "Shows entry count and build time; Rebuild starts a full scan immediately.",
              )}
              note={<span title={indexSummary}>{indexSummary}</span>}
            >
              <button
                type="button"
                onClick={() => void rebuildIndex()}
                disabled={indexBusy}
                className={TEXT_BUTTON_CLASS}
              >
                {indexBusy ? label("重建中…", "Rebuilding…") : label("重建", "Rebuild")}
              </button>
            </SettingRow>

            <SettingRow
              label={label("磁盘扫描范围", "Scan roots")}
              hint={label(
                "只在添加的目录下查找项目；默认是当前用户主目录。",
                "Only these directories are searched; the user home directory is the default.",
              )}
              stacked
            >
              <ScanRootsEditor
                roots={draft.searchRoots}
                language={draft.language}
                onChange={(roots) => update({ searchRoots: roots })}
              />
            </SettingRow>
          </SettingSection>

          <SettingSection
            id="data"
            title={label("数据", "Data")}
            hint={label(
              "导出为 JSON 备份；导入时按路径合并，不覆盖已有记录。",
              "Export JSON backups; imports merge by path without overwriting existing records.",
            )}
          >
            <SettingRow
              label={label("数据备份", "Data backup")}
              hint={label(
                "导入只新增未保存过的路径，已存在的记录保持原样。",
                "Imports only add new paths; existing records are left untouched.",
              )}
            >
              <DataPortControls
                language={draft.language}
                onImported={onImported}
                onToast={onToast}
              />
            </SettingRow>
          </SettingSection>
        </div>
      </div>
    </div>
  );
}
