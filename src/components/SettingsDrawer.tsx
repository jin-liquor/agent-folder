/**
 * 设置抽屉：外观、编辑器、快捷键与行为开关。
 *
 * 每个改动立即持久化；失败时回滚草稿并提示原因。
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useAppStore } from "../stores/useAppStore";
import { errorText } from "../lib/errors";
import * as commands from "../lib/commands";
import type { AppSettings, EditorInfo, HotkeyStatus, IndexStatus } from "../lib/types";
import { ArrowLeftIcon, CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "./Icons";
import SettingRow from "./ui/SettingRow";
import Switch from "./ui/Switch";
import ScanRootsEditor from "./ScanRootsEditor";
import DataPortControls from "./DataPortControls";
import HotkeyInput from "./HotkeyInput";

/** 主题选项。 */
const THEME_OPTIONS = [
  { value: "light", title: "浅色", Icon: SunIcon },
  { value: "dark", title: "深色", Icon: MoonIcon },
  { value: "system", title: "跟随系统", Icon: MonitorIcon },
] as const;

/** 快捷键速查表。 */
const SHORTCUTS: [string, string][] = [
  ["Ctrl K", "聚焦搜索框"],
  ["↑ ↓", "选择条目"],
  ["Enter", "在编辑器中打开"],
  ["Ctrl D", "收藏 / 取消收藏"],
  ["Delete", "移除记录"],
  ["Ctrl Shift Space", "显示 / 隐藏快速启动浮窗"],
];

/** 把后端的原始快捷键错误压成一行可读文案（完整原因放 title）。 */
function hotkeyErrorText(error?: string | null): string {
  if (!error) return "未注册";
  if (/already registered/i.test(error)) return "已被其他程序占用";
  return error.length > 28 ? `${error.slice(0, 28)}…` : error;
}

/** 编辑器列表为空时的兜底项，避免下拉框空白。 */
const FALLBACK_EDITORS: EditorInfo[] = [
  { id: "vscode", name: "Visual Studio Code", available: true },
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
  const { settings, saveSettings, editors, refreshEditors } = useAppStore();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus | null>(null);
  const [retryingHotkeys, setRetryingHotkeys] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexBusy, setIndexBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setSaveError(null);
    void commands.getHotkeyStatus().then(setHotkeyStatus).catch(() => setHotkeyStatus(null));
    void commands.getIndexStatus().then(setIndexStatus).catch(() => setIndexStatus(null));
    if (editors.length === 0) void refreshEditors();
    // 仅在打开时同步草稿，避免保存过程中被覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 保存单个字段；失败时用最新服务端状态回滚。 */
  const persist = (patch: Partial<AppSettings>) => {
    setSaveError(null);
    void saveSettings(patch).catch((error: unknown) => {
      setDraft(useAppStore.getState().settings);
      setSaveError(errorText(error));
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
      onToast(status.toggleRegistered ? "快捷键注册已刷新" : "主窗口快捷键仍未注册，请更换组合键");
    } catch (error) {
      setHotkeyStatus(await commands.getHotkeyStatus().catch(() => null));
      onToast(`快捷键重试失败：${errorText(error)}`);
    } finally {
      setRetryingHotkeys(false);
    }
  };

  /** 手动重建磁盘索引，并轮询到构建结束。 */
  const rebuildIndex = async () => {
    setIndexBusy(true);
    try {
      setIndexStatus(await commands.rebuildIndex());
      onToast("已开始重建磁盘索引");
      const timer = window.setInterval(() => {
        void commands
          .getIndexStatus()
          .then((next) => {
            setIndexStatus(next);
            if (!next.building) {
              window.clearInterval(timer);
              setIndexBusy(false);
            }
          })
          .catch(() => {
            window.clearInterval(timer);
            setIndexBusy(false);
          });
      }, 1200);
    } catch (error) {
      setIndexBusy(false);
      onToast(`重建索引失败：${errorText(error)}`);
    }
  };

  const indexSummary = indexStatus
    ? indexStatus.error
      ? `失败：${indexStatus.error}`
      : indexStatus.building
        ? `正在建立 · 已扫描 ${indexStatus.scanned} 个目录`
        : indexStatus.ready
          ? `${indexStatus.entries} 个目录 · ${new Date(indexStatus.builtAt).toLocaleTimeString(
              "zh-CN",
              { hour: "2-digit", minute: "2-digit" },
            )}`
          : "未就绪"
    : "读取中…";

  const editorOptions = editors.length > 0 ? editors : FALLBACK_EDITORS;

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
                aria-label="返回"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
              >
                <ArrowLeftIcon size={15} />
              </button>
              <span className="text-[13px] font-semibold">设置</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <div className="divide-y divide-[var(--glass-border)]">
                <SettingRow label="外观" desc="选择界面主题">
                  <div className="flex gap-1.5">
                    {THEME_OPTIONS.map(({ value, title, Icon }) => (
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
                    ))}
                  </div>
                </SettingRow>

                <SettingRow label="默认编辑器" desc="点击文件夹时使用的编辑器">
                  <select
                    value={draft.defaultEditor}
                    aria-label="默认编辑器"
                    onChange={(event) => update({ defaultEditor: event.target.value })}
                    className="h-8 max-w-[190px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[12px] text-[var(--text-primary)] outline-none"
                  >
                    {editorOptions.map((editor) => (
                      <option key={editor.id} value={editor.id} disabled={!editor.available} className="bg-[var(--glass-solid)] text-[var(--text-primary)]">
                        {editor.name}
                        {editor.available ? "" : "（未检测到）"}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                <SettingRow
                  label="快速启动默认动作"
                  desc="浮窗里按 Enter 执行的动作；行内图标可随时切换打开方式"
                >
                  <select
                    value={draft.quickEnterAction}
                    aria-label="快速启动默认动作"
                    onChange={(event) =>
                      update({
                        quickEnterAction: event.target.value as AppSettings["quickEnterAction"],
                      })
                    }
                    className="h-8 max-w-[170px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="defaultEditor">跟随默认编辑器</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="vscode">Visual Studio Code</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="codex">Codex</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="claude">Claude Code</option>
                  </select>
                </SettingRow>

                <SettingRow
                  label="显示打开方式图标"
                  desc="在浮窗结果行右侧显示 VS Code / Codex / Claude 图标"
                >
                  <Switch
                    label="显示打开方式图标"
                    checked={draft.quickOpenWith}
                    onChange={(value) => update({ quickOpenWith: value })}
                  />
                </SettingRow>

                <SettingRow label="Codex CLI 启动模式" desc="在项目目录打开交互式 Codex 会话">
                  <select
                    value={draft.codexMode}
                    aria-label="Codex CLI 启动模式"
                    onChange={(event) =>
                      update({ codexMode: event.target.value as AppSettings["codexMode"] })
                    }
                    className="h-8 max-w-[170px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="default">默认</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="danger-full-access">danger-full-access（高风险）</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="yolo">yolo（高风险）</option>
                  </select>
                </SettingRow>

                <SettingRow label="Claude Code 启动模式" desc="在项目目录打开交互式 Claude Code 会话">
                  <select
                    value={draft.claudeMode}
                    aria-label="Claude Code 启动模式"
                    onChange={(event) =>
                      update({ claudeMode: event.target.value as AppSettings["claudeMode"] })
                    }
                    className="h-8 max-w-[190px] rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
                  >
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="default">默认</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="acceptEdits">acceptEdits</option>
                    <option className="bg-[var(--glass-solid)] text-[var(--text-primary)]" value="dangerously-skip-permissions">dangerously-skip-permissions（高风险）</option>
                  </select>
                </SettingRow>

                <SettingRow label="全局快捷键" desc="点击后按下组合键即可修改">
                  <HotkeyInput
                    value={draft.globalHotkey}
                    onChange={(hotkey) => update({ globalHotkey: hotkey })}
                    error={saveError}
                  />
                </SettingRow>
                <div className="-mt-1 mb-3 ml-auto flex w-[180px] max-w-full flex-col gap-1.5 text-[10px] leading-relaxed">
                  <button
                    type="button"
                    onClick={() => void retryHotkeys()}
                    disabled={retryingHotkeys}
                    className="self-end rounded-md border border-[var(--glass-border)] px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                  >
                    {retryingHotkeys ? "重试中…" : "重试快捷键"}
                  </button>
                  <div className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
                    <span className="text-[var(--text-secondary)]">主窗口</span>
                    <span
                      title={hotkeyStatus?.toggleError ?? undefined}
                      className={`truncate text-right ${hotkeyStatus?.toggleRegistered ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                    >
                      {hotkeyStatus?.toggleRegistered
                        ? `${hotkeyStatus.toggleHotkey} 已生效`
                        : hotkeyErrorText(hotkeyStatus?.toggleError)}
                    </span>
                    <span className="text-[var(--text-secondary)]">快速启动</span>
                    <span
                      title={hotkeyStatus?.quickError ?? undefined}
                      className={`truncate text-right ${hotkeyStatus?.quickRegistered ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                    >
                      {hotkeyStatus?.quickRegistered
                        ? `${hotkeyStatus.quickHotkey} 已生效`
                        : hotkeyErrorText(hotkeyStatus?.quickError)}
                    </span>
                  </div>
                </div>

                <SettingRow label="关闭时最小化到托盘" desc="点关闭按钮不退出，仅隐藏窗口">
                  <Switch
                    label="关闭时最小化到托盘"
                    checked={draft.closeToTray}
                    onChange={(value) => update({ closeToTray: value })}
                  />
                </SettingRow>

                <SettingRow
                  label="跳过 VS Code 工作区信任确认"
                  desc="默认关闭；仅对 VS Code 和 Insiders 生效。开启后不再弹出工作区安全确认，建议只用于你信任的项目"
                >
                  <Switch
                    label="跳过 VS Code 工作区信任确认"
                    checked={draft.trustFolders}
                    onChange={(value) => update({ trustFolders: value })}
                  />
                </SettingRow>

                <SettingRow label="打开后隐藏窗口" desc="打开文件夹后自动隐藏到托盘">
                  <Switch
                    label="打开后隐藏窗口"
                    checked={draft.hideAfterOpen}
                    onChange={(value) => update({ hideAfterOpen: value })}
                  />
                </SettingRow>

                <SettingRow label="开机自启动" desc="登录 Windows 后自动在托盘待命">
                  <Switch
                    label="开机自启动"
                    checked={draft.launchOnStartup}
                    onChange={(value) => update({ launchOnStartup: value })}
                  />
                </SettingRow>

                <SettingRow label="编辑器可执行文件路径" desc="留空则自动检测（可选覆盖）">
                  <input
                    value={draft.editorPathOverride ?? ""}
                    placeholder="自动检测"
                    spellCheck={false}
                    aria-label="编辑器可执行文件路径"
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

                <SettingRow label="本机磁盘搜索" desc="开启后会在配置的目录范围内查找未收藏项目">
                  <Switch
                    label="本机磁盘搜索"
                    checked={draft.scanEnabled}
                    onChange={(value) => update({ scanEnabled: value })}
                  />
                </SettingRow>

                <SettingRow label="磁盘索引" desc="启动时后台建立一次，之后查询只读内存；目录变动可手动重建">
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
                      {indexBusy ? "重建中…" : "重建"}
                    </button>
                  </div>
                </SettingRow>

                <SettingRow label="磁盘扫描范围" desc="搜不到项目时，先把所在磁盘目录加进来">
                  <ScanRootsEditor
                    roots={draft.searchRoots}
                    onChange={(roots) => update({ searchRoots: roots })}
                  />
                </SettingRow>

                <SettingRow label="数据备份" desc="导出为 JSON 文件；导入时按路径合并，不覆盖已有记录">
                  <DataPortControls onImported={onImported} onToast={onToast} />
                </SettingRow>
              </div>

              {saveError && (
                <div
                  role="alert"
                  className="mt-4 rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-[11px] leading-relaxed break-words text-red-500"
                >
                  保存失败：{saveError}
                </div>
              )}

              <div className="mt-6 rounded-md border border-[var(--glass-border)] bg-[var(--canvas-subtle)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                  <CheckIcon size={12} className="text-emerald-500" />
                  快捷键速查
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {SHORTCUTS.map(([keys, desc]) => (
                    <div key={keys} className="contents">
                      <span className="kbd">{keys}</span>
                      <span>{desc}</span>
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
