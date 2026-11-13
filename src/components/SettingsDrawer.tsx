/**
 * 设置抽屉：外观、编辑器、快捷键与行为开关。
 *
 * 每个改动立即持久化；失败时回滚草稿并提示原因。
 */
import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/useAppStore";
import * as system from "../lib/system";
import { LANGUAGE_OPTIONS } from "../lib/i18n";
import { errorText } from "../lib/errors";
import * as commands from "../lib/commands";
import type {
  AppSettings,
  CliAgentId,
  CliPaths,
  EditorInfo,
  HotkeyStatus,
  IndexStatus,
} from "../lib/types";
import { BUILTIN_PRESETS } from "../lib/types";
import CliPresetEditor from "./CliPresetEditor";
import { ArrowLeftIcon, CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "./Icons";
import SettingRow from "./ui/SettingRow";
import SettingSection from "./ui/SettingSection";
import Switch from "./ui/Switch";
import ScanRootsEditor from "./ScanRootsEditor";
import DataPortControls from "./DataPortControls";
import HotkeyInput from "./HotkeyInput";

/** 主题选项。 */
const THEME_OPTIONS = [
  { value: "light", zh: "浅色", en: "Light", Icon: SunIcon },
  { value: "dark", zh: "深色", en: "Dark", Icon: MoonIcon },
  { value: "system", zh: "跟随系统", en: "System", Icon: MonitorIcon },
] as const;

/** 快捷键速查表（不含可配置的全局快捷键，那两项单独展示）。 */
const SHORTCUTS: [string, string, string][] = [
  ["Ctrl K", "聚焦搜索框", "Focus search"],
  ["↑ ↓", "选择条目", "Move selection"],
  ["Enter", "在编辑器中打开", "Open in editor"],
  ["Ctrl D", "收藏 / 取消收藏", "Toggle favorite"],
  ["Delete", "移除记录", "Remove record"],
  ["右键 / Shift F10", "更多操作菜单", "More actions menu"],
];

/** 各 CLI 的展示元数据，避免设置页出现六段重复 JSX。 */
/** 把后端的原始快捷键错误压成一行可读文案（完整原因放 title）。 */
function hotkeyErrorText(error?: string | null, english = false): string {
  if (!error) return english ? "Not registered" : "未注册";
  if (/already registered/i.test(error)) return english ? "In use by another app" : "已被其他程序占用";
  return error.length > 28 ? `${error.slice(0, 28)}…` : error;
}

/** 编辑器列表为空时的兜底项，避免下拉框空白。 */
const FALLBACK_EDITORS: EditorInfo[] = [
  { id: "vscode", name: "Visual Studio Code", available: true },
];

interface CliConfig {
  id: CliAgentId;
  name: string;
  /** 该 CLI 的预设字段名（`codexMode` 等）。 */
  modeKey: keyof AppSettings;
  /** 附加参数占位示例。 */
  placeholder: string;
}

const CLI_OVERRIDE_KEY: Record<CliAgentId, keyof CliPaths> = {
  codex: "codexOverride",
  claude: "claudeOverride",
  omp: "ompOverride",
  opencode: "opencodeOverride",
};

function cliOverride(paths: CliPaths, agent: CliAgentId): string {
  return String(paths[CLI_OVERRIDE_KEY[agent]] ?? "");
}

const CLI_CONFIGS: CliConfig[] = [
  {
    id: "codex",
    name: "codex",
    modeKey: "codexMode",
    placeholder: "--model gpt-5-codex",
  },
  {
    id: "claude",
    name: "Claude Code",
    modeKey: "claudeMode",
    placeholder: "--model sonnet",
  },
  {
    id: "omp",
    name: "omp",
    modeKey: "ompMode",
    placeholder: "--model opus",
  },
  {
    id: "opencode",
    name: "opencode",
    modeKey: "opencodeMode",
    placeholder: "--model anthropic/claude-sonnet",
  },
];

export default function SettingsDrawer({
  open,
  onClose,
  onImported,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  /** 导入完成后刷新列表。 */
  onImported: () => void;
  /** 结果提示，复用外层 toast。 */
  onToast: (message: string) => void;
}) {
  const { settings, saveSettings, editors, refreshEditors, refreshCliPaths, setCliPath } = useAppStore();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus | null>(null);
  const [retryingHotkeys, setRetryingHotkeys] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexBusy, setIndexBusy] = useState(false);
  const [cliPaths, setCliPaths] = useState<CliPaths>(settings.cliPaths);
  const [manualPaths, setManualPaths] = useState<Record<CliAgentId, string>>({
    codex: cliOverride(settings.cliPaths, "codex"),
    claude: cliOverride(settings.cliPaths, "claude"),
    omp: cliOverride(settings.cliPaths, "omp"),
    opencode: cliOverride(settings.cliPaths, "opencode"),
  });
  const [cliErrors, setCliErrors] = useState<Partial<Record<CliAgentId, string>>>({});
  const [probing, setProbing] = useState(false);
  /**
   * 索引重建的轮询定时器。
   *
   * 抽屉收起时组件会卸载，定时器若不清理就会一直空转并写状态。
   */
  const rebuildTimerRef = useRef<number | undefined>(undefined);
  const label = (zh: string, en: string) => (draft.language === "en-US" ? en : zh);

  useEffect(() => {
    return () => {
      if (rebuildTimerRef.current !== undefined) {
        window.clearInterval(rebuildTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setCliPaths(settings.cliPaths);
    setManualPaths({
      codex: cliOverride(settings.cliPaths, "codex"),
      claude: cliOverride(settings.cliPaths, "claude"),
      omp: cliOverride(settings.cliPaths, "omp"),
      opencode: cliOverride(settings.cliPaths, "opencode"),
    });
    setCliErrors({});
    setSaveError(null);
    void commands.getHotkeyStatus().then(setHotkeyStatus).catch(() => setHotkeyStatus(null));
    void commands.getIndexStatus().then(setIndexStatus).catch(() => setIndexStatus(null));
    if (editors.length === 0) void refreshEditors();
    // 仅在打开时同步草稿，避免保存过程中被覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 重新探测全部 CLI 路径，并刷新界面上的路径表。 */
  const reProbe = async () => {
    setProbing(true);
    try {
      const status = await refreshCliPaths();
      const next = useAppStore.getState().settings.cliPaths;
      setCliPaths(next);
      const found = [status.codex, status.claude, status.omp, status.opencode].filter(
        Boolean,
      ).length;
      onToast(label(`已重新探测：${found} / 4 个 CLI 可用`, `Re-probed: ${found} / 4 CLIs available`));
    } catch (error) {
      onToast(label(`探测失败：${errorText(error, draft.language)}`, `Probe failed: ${errorText(error, draft.language)}`));
    } finally {
      setProbing(false);
    }
  };

  const saveCliPath = async (agent: CliAgentId, value: string) => {
    const path = value.trim();
    try {
      const next = await setCliPath(agent, path || null);
      setCliPaths(next);
      setManualPaths((current) => ({ ...current, [agent]: cliOverride(next, agent) }));
      setCliErrors((current) => ({ ...current, [agent]: undefined }));
      onToast(path ? label(`${agent} 路径已保存`, `${agent} path saved`) : label(`${agent} 已恢复自动检测`, `${agent} automatic detection restored`));
    } catch (error) {
      setCliErrors((current) => ({ ...current, [agent]: errorText(error, draft.language) }));
    }
  };

  const chooseCliPath = async (agent: CliAgentId) => {
    const picked = await system.pickCliPath();
    if (!picked) return;
    setManualPaths((current) => ({ ...current, [agent]: picked }));
    await saveCliPath(agent, picked);
  };

  /** 保存单个字段；失败时用最新服务端状态回滚。 */
  const persist = (patch: Partial<AppSettings>) => {
    setSaveError(null);
    void saveSettings(patch).catch((error: unknown) => {
      setDraft(useAppStore.getState().settings);
      setSaveError(errorText(error, draft.language));
    });
  };

  const update = (patch: Partial<AppSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
    persist(patch);
  };

  const retryHotkeys = async () => {
    setRetryingHotkeys(true);
    try {
      const status = await commands.retryHotkeys();
      setHotkeyStatus(status);
      onToast(status.toggleRegistered ? label("快捷键注册已刷新", "Shortcut registration refreshed") : label("主窗口快捷键仍未注册，请更换组合键", "Main window shortcut is still unregistered; choose another combination"));
    } catch (error) {
      setHotkeyStatus(await commands.getHotkeyStatus().catch(() => null));
      onToast(label(`快捷键重试失败：${errorText(error, draft.language)}`, `Shortcut retry failed: ${errorText(error, draft.language)}`));
    } finally {
      setRetryingHotkeys(false);
    }
  };

  /** 手动重建磁盘索引，并轮询到构建结束。 */
  const rebuildIndex = async () => {
    setIndexBusy(true);
    try {
      setIndexStatus(await commands.rebuildIndex());
      onToast(label("已开始重建磁盘索引", "Disk index rebuild started"));
      const timer = window.setInterval(() => {
        void commands
          .getIndexStatus()
          .then((next) => {
            setIndexStatus(next);
            if (!next.building) {
              window.clearInterval(timer);
              rebuildTimerRef.current = undefined;
              setIndexBusy(false);
            }
          })
          .catch(() => {
            window.clearInterval(timer);
            rebuildTimerRef.current = undefined;
            setIndexBusy(false);
          });
      }, 1200);
      rebuildTimerRef.current = timer;
    } catch (error) {
      setIndexBusy(false);
      onToast(label(`重建索引失败：${errorText(error, draft.language)}`, `Index rebuild failed: ${errorText(error, draft.language)}`));
    }
  };

  const indexSummary = indexStatus
    ? indexStatus.error
      ? label(`失败：${indexStatus.error}`, `Failed: ${indexStatus.error}`)
      : indexStatus.building
        ? label(`正在建立 · 已扫描 ${indexStatus.scanned} 个目录`, `Building · scanned ${indexStatus.scanned} directories`)
        : indexStatus.ready
          ? label(
              `${indexStatus.entries} 个目录 · ${new Date(indexStatus.builtAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}`,
              `${indexStatus.entries} directories · ${new Date(indexStatus.builtAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}`,
            )
          : label("未就绪", "Not ready")
    : label("读取中…", "Loading…");

  const editorOptions = editors.length > 0 ? editors : FALLBACK_EDITORS;

  /**
   * 只在真正有冲突时提示；注册成功不显示任何文字。
   *
   * 两组快捷键分别判断：快速启动允许为空（已禁用），那不是错误。
   */
  const hotkeyConflict = (() => {
    const problems: string[] = [];
    const english = draft.language === "en-US";
    if (hotkeyStatus && !hotkeyStatus.toggleRegistered) {
      problems.push(
        `${label("主窗口快捷键", "Main window shortcut")}: ${hotkeyErrorText(hotkeyStatus.toggleError, english)}`,
      );
    }
    if (hotkeyStatus?.quickHotkey && hotkeyStatus && !hotkeyStatus.quickRegistered) {
      problems.push(
        `${label("快速启动快捷键", "Quick-launch shortcut")}: ${hotkeyErrorText(hotkeyStatus.quickError, english)}`,
      );
    }
    return problems.length > 0 ? problems.join(english ? "; " : "；") : null;
  })();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-20 bg-black/25"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className="absolute top-0 right-0 z-30 flex h-full w-[440px] max-w-[90%] flex-col border-l border-[var(--glass-border)] bg-[var(--glass-solid)] shadow-2xl"
          >
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--glass-border)] px-4">
              <button
                onClick={onClose}
                aria-label={label("返回", "Back")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
              >
                <ArrowLeftIcon size={15} />
              </button>
              <span className="text-[13px] font-semibold">{label("设置", "Settings")}</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <div className="divide-y divide-[var(--glass-border)]">
                <SettingSection title={label("外观", "Appearance")}>
                <SettingRow label={label("主题", "Theme")}>

                  <div className="flex gap-1.5">
                    {THEME_OPTIONS.map(({ value, zh, en, Icon }) => {
                      const title = label(zh, en);
                      return (
                      <button
                        key={value}
                        title={title}
                        aria-label={title}
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

                <SettingRow label={label("语言", "Language")} desc={label("应用界面语言，切换后立即生效", "Interface language, applied immediately")}>
                  <select
                    value={draft.language}
                    aria-label={label("语言", "Language")}
                    onChange={(event) =>
                      update({ language: event.target.value as AppSettings["language"] })
                    }
                    className="h-8 w-[120px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                </SettingSection>
                <SettingSection title={label("编辑器", "Editor")}>
                <SettingRow label={label("默认编辑器", "Default editor")}>

                  <select
                    value={draft.defaultEditor}
                    aria-label={label("默认编辑器", "Default editor")}
                    onChange={(event) => update({ defaultEditor: event.target.value })}
                    className="h-8 max-w-[190px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[12px] text-[var(--text-primary)] outline-none"
                  >
                    {editorOptions.map((editor) => (
                      <option key={editor.id} value={editor.id} disabled={!editor.available} className="bg-[var(--glass-solid)] text-[var(--text-primary)]">
                        {editor.name}
                        {editor.available ? "" : label("（未检测到）", " (not detected)")}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                </SettingSection>

                <SettingSection
                  title={label("快速启动浮窗", "Quick launch")}
                  desc={label(
                    "浮窗内只保留 ↑ ↓ 选择与 Enter 打开，切换打开方式用行内图标按钮。",
                    "Use ↑ ↓ to select and Enter to open; inline icons switch the open method.",
                  )}
                >
                <SettingRow label={label("Enter 默认动作", "Enter action")}
                  desc={label("浮窗里按 Enter 执行的动作；行内图标可随时切换打开方式", "Action executed by Enter; inline icons can switch it anytime")}
                >
                  <select
                    value={draft.quickEnterAction}
                    aria-label={label("快速启动默认动作", "Quick-launch default action")}
                    onChange={(event) =>
                      update({
                        quickEnterAction: event.target.value as AppSettings["quickEnterAction"],
                      })
                    }
                    className="h-8 max-w-[170px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="defaultEditor">{label("跟随默认编辑器", "Use default editor")}</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="vscode">Visual Studio Code</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="codex">Codex</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="claude">Claude Code</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="omp">omp</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="opencode">opencode</option>
                  </select>
                </SettingRow>

                <SettingRow label={label("显示打开方式图标", "Show open-method icons")}>
                  <Switch
                    label={label("显示打开方式图标", "Show open-method icons")}
                    checked={draft.quickOpenWith}
                    onChange={(value) => update({ quickOpenWith: value })}
                  />
                </SettingRow>

{CLI_CONFIGS.map((config) => (
                  <SettingRow key={config.id} label={label(`${config.name} 启动模式`, `${config.name} launch mode`)}>
                    <CliPresetEditor
                      agent={config.id}
                      language={draft.language}
                      builtins={BUILTIN_PRESETS[config.id]}
                      userPresets={draft.cliPresets[config.id] ?? []}
                      selected={String(draft[config.modeKey] ?? "default")}
                      onSelect={(id) => update({ [config.modeKey]: id } as Partial<AppSettings>)}
                      onChange={(presets) =>
                        update({
                          cliPresets: { ...draft.cliPresets, [config.id]: presets },
                        })
                      }
                      placeholder={config.placeholder}
                    />
                  </SettingRow>
                ))}

                </SettingSection>

                <SettingSection
                  title={label("CLI 检测", "CLI detection")}
                  desc={label(
                    "首次启动自动探测并保存各 CLI 的可执行文件路径；文件被移动或卸载后可重新探测。",
                    "Detect and cache CLI executables on first launch; probe again after a move or uninstall.",
                  )}
                >
                <SettingRow
                  label={label("omp 启动方式", "omp launch mode")}
                  desc={label("默认直接启动 omp.exe；选 PowerShell 会新开窗口并加载你的 profile", "Launch omp.exe directly by default; PowerShell opens a new window and loads your profile")}
                >
                  <select
                    value={draft.ompLaunchStyle}
                    aria-label={label("omp 启动方式", "omp launch mode")}
                    onChange={(event) =>
                      update({
                        ompLaunchStyle: event.target.value as AppSettings["ompLaunchStyle"],
                      })
                    }
                    className="h-8 max-w-[170px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="direct">
                      {label("直接启动（推荐）", "Launch directly (recommended)")}
                    </option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="powershell">
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
                      desc={
                        cliErrors[config.id] ||
                        label(
                          `检测：${detected || "未找到"}；生效：${effective || "未配置"}`,
                          `Detected: ${detected || "Not found"}; active: ${effective || "Not configured"}`,
                        )
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
                          className="min-w-0 flex-1 rounded border border-[var(--glass-border)] bg-[var(--glass-solid)] px-1.5 py-1 text-[10px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          title={label("选择文件", "Choose file")}
                          aria-label={label(`${config.name} 选择文件`, `Choose ${config.name} file`)}
                          onClick={() => void chooseCliPath(config.id)}
                          className="rounded border border-[var(--glass-border)] px-1.5 py-1 text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          …
                        </button>
                        <button
                          type="button"
                          title={label("保存 CLI 路径", "Save CLI path")}
                          aria-label={label(`${config.name} 保存路径`, `Save ${config.name} path`)}
                          onClick={() => void saveCliPath(config.id, manual)}
                          className="rounded border border-[var(--glass-border)] px-1.5 py-1 text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {label("保存", "Save")}
                        </button>
                        {manual && (
                          <button
                            type="button"
                            title={label("恢复自动检测", "Restore auto-detection")}
                            aria-label={label(`${config.name} 恢复自动检测`, `Restore ${config.name} auto-detection`)}
                            onClick={() => {
                              setManualPaths((current) => ({ ...current, [config.id]: "" }));
                              void saveCliPath(config.id, "");
                            }}
                            className="rounded border border-[var(--glass-border)] px-1.5 py-1 text-[10px] text-[var(--text-secondary)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </SettingRow>
                  );
                })}
                <SettingRow label={label("CLI 可执行文件", "CLI executables")}
                  desc={
                    cliPaths.probedAt > 0
                      ? label(
                          `检测于 ${new Date(cliPaths.probedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
                          `Probed ${new Date(cliPaths.probedAt).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
                        )
                      : label("尚未探测", "Not probed yet")
                  }
                >
                  <div className="flex w-[210px] flex-col items-stretch gap-1.5">
                    <button
                      type="button"
                      onClick={() => void reProbe()}
                      disabled={probing}
                      className="self-end rounded-md border border-[var(--glass-border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                    >
                      {probing ? label("探测中…", "Probing…") : label("重新探测", "Probe again")}
                    </button>
                    <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-[10px]">
                      {CLI_CONFIGS.map((config) => {
                        const path = String(cliPaths[config.id] ?? "");
                        const found = path.length > 0;
                        return (
                          <Fragment key={config.id}>
                            <span className="text-[var(--text-secondary)]">{config.id}</span>
                            <span
                              title={path || label("未检测到", "Not detected")}
                              className="truncate text-right text-[var(--text-secondary)]"
                            >
                              {found ? path.split(/[\\/]/).pop() : label("未找到", "Not found")}
                            </span>
                          </Fragment>
                        );
                      })}
                    </div>
                  </div>
                </SettingRow>

                </SettingSection>

                <SettingSection
                  title={label("快捷键", "Shortcuts")}
                  desc={label("两处快捷键都可以改；快速启动快捷键清空即视为禁用。", "Both shortcuts are configurable. Clear the quick-launch shortcut to disable it.")}
                >
                <SettingRow label={label("全局快捷键", "Global shortcut")} desc={label("点击后按下组合键即可修改", "Click and press a key combination to change it")}>
                  <HotkeyInput
                    value={draft.globalHotkey}
                    language={draft.language}
                    onChange={(hotkey) => update({ globalHotkey: hotkey })}
                    error={saveError}
                  />
                </SettingRow>

                <SettingRow
                  label={label("快速启动快捷键", "Quick-launch shortcut")}
                  desc={label("清空即禁用；点击后按下组合键即可修改", "Clear to disable; click and press a key combination to change it")}
                >
                  <HotkeyInput
                    value={draft.quickHotkey}
                    language={draft.language}
                    onChange={(hotkey) => update({ quickHotkey: hotkey })}
                    allowEmpty
                  />
                </SettingRow>
                <div className="-mt-1 mb-3 ml-auto flex w-[180px] max-w-full flex-col gap-1.5 text-[10px] leading-relaxed">
                  <button
                    type="button"
                    onClick={() => void retryHotkeys()}
                    disabled={retryingHotkeys}
                    className="self-end rounded-md border border-[var(--glass-border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                  >
                    {retryingHotkeys ? label("重试中…", "Retrying…") : label("重试快捷键", "Retry shortcuts")}
                  </button>
                  {hotkeyConflict && (
                    <div
                      role="alert"
                      className="text-right text-[10px] leading-relaxed break-words text-[var(--danger)]"
                    >
                      {hotkeyConflict}
                    </div>
                  )}
                </div>

                </SettingSection>

                <SettingSection title={label("行为", "Behavior")}>
                <SettingRow label={label("关闭时隐藏到系统托盘", "Hide to system tray on close")} desc={label("开启后关闭按钮会隐藏窗口，可从托盘恢复", "When enabled, closing hides the window; restore it from the tray")}>
                  <Switch
                    label={label("关闭时隐藏到系统托盘", "Hide to system tray on close")}
                    checked={draft.closeToTray}
                    onChange={(value) => update({ closeToTray: value })}
                  />
                </SettingRow>

                <SettingRow
                  label={label("跳过 VS Code 工作区信任确认", "Skip VS Code workspace trust prompt")}
                  desc={label("默认关闭；仅对 VS Code 和 Insiders 生效。开启后不再弹出工作区安全确认，建议只用于你信任的项目", "Off by default; applies to VS Code and Insiders. Enabling skips workspace security prompts; use only with trusted projects.")}
                >
                  <Switch
                    label={label("跳过 VS Code 工作区信任确认", "Skip VS Code workspace trust prompt")}
                    checked={draft.trustFolders}
                    onChange={(value) => update({ trustFolders: value })}
                  />
                </SettingRow>

                <SettingRow label={label("打开后隐藏窗口", "Hide window after opening")} desc={label("打开文件夹后自动隐藏到托盘", "Automatically hide to the tray after opening a folder")}>
                  <Switch
                    label={label("打开后隐藏窗口", "Hide window after opening")}
                    checked={draft.hideAfterOpen}
                    onChange={(value) => update({ hideAfterOpen: value })}
                  />
                </SettingRow>

                <SettingRow label={label("开机自启动", "Launch at startup")} desc={label("登录 Windows 后自动在托盘待命", "Start minimized to the tray when you sign in to Windows")}>
                  <Switch
                    label={label("开机自启动", "Launch at startup")}
                    checked={draft.launchOnStartup}
                    onChange={(value) => update({ launchOnStartup: value })}
                  />
                </SettingRow>

                <SettingRow label={label("编辑器可执行文件路径", "Editor executable path")} desc={label("留空则自动检测（可选覆盖）", "Leave empty to detect automatically (optional override)")}>
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
                    className="h-8 w-[150px] rounded-md border border-[var(--glass-border)] bg-transparent px-2 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
                  />
                </SettingRow>

                </SettingSection>

                <SettingSection
                  title={label("磁盘索引", "Disk index")}
                  desc={label(
                    "启动时后台建立一次索引，之后查询只读内存；目录变动可手动重建。",
                    "Build once in the background at startup; searches read memory. Rebuild after directory changes.",
                  )}
                >
                <SettingRow label={label("本机磁盘搜索", "Disk search")} desc={label("开启后会在配置的目录范围内查找未收藏项目", "Search configured directories for projects not already saved")}>
                  <Switch
                    label={label("本机磁盘搜索", "Disk search")}
                    checked={draft.scanEnabled}
                    onChange={(value) => update({ scanEnabled: value })}
                  />
                </SettingRow>

                <SettingRow label={label("磁盘索引", "Disk index")} desc={label("启动时后台建立一次，之后查询只读内存；目录变动可手动重建", "Build once in the background at startup; searches read memory. Rebuild after directory changes.")}>
                  <div className="flex items-center gap-2">
                    <span
                      className="max-w-[190px] truncate text-[10px] text-[var(--text-secondary)]"
                      title={indexSummary}
                    >
                      {indexSummary}
                    </span>
                    <button
                      type="button"
                      onClick={() => void rebuildIndex()}
                      disabled={indexBusy}
                      className="rounded-md border border-[var(--glass-border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                    >
                      {indexBusy ? label("重建中…", "Rebuilding…") : label("重建", "Rebuild")}
                    </button>
                  </div>
                </SettingRow>

                <SettingRow label={label("磁盘扫描范围", "Scan roots")} desc={label("搜不到项目时，先把所在磁盘目录加进来", "Add the parent directory here if a project is not found")}>
                  <ScanRootsEditor
                    roots={draft.searchRoots}
                    language={draft.language}
                    onChange={(roots) => update({ searchRoots: roots })}
                  />
                </SettingRow>

                </SettingSection>

                <SettingSection title={label("数据", "Data")}>
                <SettingRow label={label("数据备份", "Data backup")} desc={label("导出为 JSON 文件；导入时按路径合并，不覆盖已有记录", "Export JSON backups; imports merge by path without overwriting existing records")}>
                  <DataPortControls language={draft.language} onImported={onImported} onToast={onToast} />
                </SettingRow>
                </SettingSection>
              </div>

              {saveError && (
                <div
                  role="alert"
                  className="mt-4 rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-[11px] leading-relaxed break-words text-red-500"
                >
                  {label("保存失败", "Save failed")}: {saveError}
                </div>
              )}

              <div className="mt-6 rounded-md border border-[var(--glass-border)] bg-[var(--canvas-subtle)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
