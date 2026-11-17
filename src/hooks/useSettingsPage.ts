/**
 * 设置页的数据与副作用：草稿、持久化、快捷键状态、磁盘索引、CLI 路径。
 *
 * 页面组件只负责布局；这里集中管理「改一行设置要发生什么」，
 * 保证保存失败时回滚、轮询定时器随页面卸载而清理。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../stores/useAppStore";
import * as commands from "../lib/commands";
import * as system from "../lib/system";
import { errorText } from "../lib/errors";
import {
  DEFAULT_SETTINGS,
  EDITOR_LABELS,
  EXPLORER_EDITOR_ID,
  type AppSettings,
  type CliAgentId,
  type CliPaths,
  type EditorInfo,
  type HotkeyStatus,
  type IndexStatus,
} from "../lib/types";

/** 索引状态的轮询间隔：自动索引随时可能在后台开跑。 */
const INDEX_STATUS_POLL_MS = 3000;

/** 编辑器列表为空时的兜底项，避免下拉框空白。 */
const FALLBACK_EDITORS: EditorInfo[] = [
  { id: "vscode", name: "Visual Studio Code", available: true },
];

interface Options {
  /** 结果提示，复用外层 toast。 */
  onToast: (message: string) => void;
}

/** 把后端的原始快捷键错误压成一行可读文案（完整原因放 title）。 */
function hotkeyErrorText(error: string | null | undefined, english: boolean): string {
  if (!error) return english ? "Not registered" : "未注册";
  if (/already registered/i.test(error)) return english ? "In use by another app" : "已被其他程序占用";
  return error.length > 28 ? `${error.slice(0, 28)}…` : error;
}

function cliOverride(paths: CliPaths, agent: CliAgentId): string {
  return String(paths[`${agent}Override` as keyof CliPaths] ?? "");
}

function manualPathsOf(paths: CliPaths): Record<CliAgentId, string> {
  return {
    codex: cliOverride(paths, "codex"),
    claude: cliOverride(paths, "claude"),
    omp: cliOverride(paths, "omp"),
    opencode: cliOverride(paths, "opencode"),
  };
}

export function useSettingsPage({ onToast }: Options) {
  const { settings, saveSettings, editors, refreshEditors, refreshCliPaths, setCliPath } =
    useAppStore();

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus | null>(null);
  const [retryingHotkeys, setRetryingHotkeys] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexBusy, setIndexBusy] = useState(false);
  const [cliPaths, setCliPaths] = useState<CliPaths>(settings.cliPaths);
  const [manualPaths, setManualPaths] = useState<Record<CliAgentId, string>>(
    manualPathsOf(settings.cliPaths),
  );
  const [cliErrors, setCliErrors] = useState<Partial<Record<CliAgentId, string>>>({});
  const [probing, setProbing] = useState(false);

  /** 索引重建的轮询定时器；页面卸载时必须清掉，否则会一直空转写状态。 */
  const rebuildTimerRef = useRef<number | undefined>(undefined);

  const lang = draft.language;
  const english = lang === "en-US";
  const label = useCallback(
    (zh: string, en: string) => (draft.language === "en-US" ? en : zh),
    [draft.language],
  );

  useEffect(() => {
    return () => {
      if (rebuildTimerRef.current !== undefined) {
        window.clearInterval(rebuildTimerRef.current);
      }
    };
  }, []);

  /**
   * 仅在页面首次挂载时同步一次草稿。
   *
   * 保存过程中若跟着 store 更新草稿，会覆盖用户正在输入的内容
   * （例如连续修改两个文本框）；失败时通过 `persist` 主动回滚。
   */
  useEffect(() => {
    setDraft(settings);
    setCliPaths(settings.cliPaths);
    setManualPaths(manualPathsOf(settings.cliPaths));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void commands.getHotkeyStatus().then(setHotkeyStatus).catch(() => setHotkeyStatus(null));
    void commands.getIndexStatus().then(setIndexStatus).catch(() => setIndexStatus(null));
    if (editors.length === 0) void refreshEditors();
    // 只在进入设置页时探测一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 语言可能与草稿不同步：标题栏的「EN / 中」按钮直接改 store，
   * 而草稿只在挂载时同步一次。语言不是用户正在输入的文本框，
   * 直接跟随 store 即可，否则设置页会停在旧语言直到重新进入。
   */
  useEffect(() => {
    setDraft((current) =>
      current.language === settings.language ? current : { ...current, language: settings.language },
    );
  }, [settings.language]);

  /**
   * 索引状态轮询：自动索引可能在后台开跑，页面上的摘要要跟着变，
   * 否则用户会看到「未就绪」一直不动。
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      void commands
        .getIndexStatus()
        .then(setIndexStatus)
        .catch(() => {});
    }, INDEX_STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  /** 保存单个字段；失败时用最新服务端状态回滚。 */
  const persist = useCallback(
    (patch: Partial<AppSettings>) => {
      setSaveError(null);
      void saveSettings(patch).catch((error: unknown) => {
        setDraft(useAppStore.getState().settings);
        setSaveError(errorText(error, useAppStore.getState().settings.language));
      });
    },
    [saveSettings],
  );

  const update = useCallback(
    (patch: Partial<AppSettings>) => {
      setDraft((current) => ({ ...current, ...patch }));
      persist(patch);
    },
    [persist],
  );

  /** 重新探测全部 CLI 路径，并刷新界面上的路径表。 */
  const reProbe = useCallback(async () => {
    setProbing(true);
    try {
      const status = await refreshCliPaths();
      const next = useAppStore.getState().settings.cliPaths;
      setCliPaths(next);
      setManualPaths(manualPathsOf(next));
      const found = [status.codex, status.claude, status.omp, status.opencode].filter(
        Boolean,
      ).length;
      onToast(
        label(`已重新探测：${found} / 4 个 CLI 可用`, `Re-probed: ${found} / 4 CLIs available`),
      );
    } catch (error) {
      onToast(label(`探测失败：${errorText(error, lang)}`, `Probe failed: ${errorText(error, lang)}`));
    } finally {
      setProbing(false);
    }
  }, [label, lang, onToast, refreshCliPaths]);

  const saveCliPath = useCallback(
    async (agent: CliAgentId, value: string) => {
      const path = value.trim();
      try {
        const next = await setCliPath(agent, path || null);
        setCliPaths(next);
        setManualPaths((current) => ({ ...current, [agent]: cliOverride(next, agent) }));
        setCliErrors((current) => ({ ...current, [agent]: undefined }));
        onToast(
          path
            ? label(`${agent} 路径已保存`, `${agent} path saved`)
            : label(`${agent} 已恢复自动检测`, `${agent} automatic detection restored`),
        );
      } catch (error) {
        setCliErrors((current) => ({ ...current, [agent]: errorText(error, lang) }));
      }
    },
    [label, lang, onToast, setCliPath],
  );

  const chooseCliPath = useCallback(
    async (agent: CliAgentId) => {
      const picked = await system.pickCliPath();
      if (!picked) return;
      setManualPaths((current) => ({ ...current, [agent]: picked }));
      await saveCliPath(agent, picked);
    },
    [saveCliPath],
  );

  const retryHotkeys = useCallback(async () => {
    setRetryingHotkeys(true);
    try {
      const status = await commands.retryHotkeys();
      setHotkeyStatus(status);
      onToast(
        status.toggleRegistered
          ? label("快捷键注册已刷新", "Shortcut registration refreshed")
          : label(
              "主窗口快捷键仍未注册，请更换组合键",
              "Main window shortcut is still unregistered; choose another combination",
            ),
      );
    } catch (error) {
      setHotkeyStatus(await commands.getHotkeyStatus().catch(() => null));
      onToast(label(`快捷键重试失败：${errorText(error, lang)}`, `Shortcut retry failed: ${errorText(error, lang)}`));
    } finally {
      setRetryingHotkeys(false);
    }
  }, [label, lang, onToast]);

  /** 手动重建磁盘索引，并轮询到构建结束。 */
  const rebuildIndex = useCallback(async () => {
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
      onToast(
        label(`重建索引失败：${errorText(error, lang)}`, `Index rebuild failed: ${errorText(error, lang)}`),
      );
    }
  }, [label, lang, onToast]);

  /** 索引状态的一行摘要（设置行里常驻显示）。 */
  const indexSummary = useMemo(() => {
    if (!indexStatus) return label("读取中…", "Loading…");
    if (indexStatus.error) return label(`失败：${indexStatus.error}`, `Failed: ${indexStatus.error}`);
    if (indexStatus.building) {
      return label(
        `正在建立 · 已扫描 ${indexStatus.scanned} 个目录`,
        `Building · scanned ${indexStatus.scanned} directories`,
      );
    }
    if (!indexStatus.ready) return label("未就绪", "Not ready");
    const time = new Date(indexStatus.builtAt).toLocaleTimeString(english ? "en-US" : "zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return label(`${indexStatus.entries} 个目录 · ${time}`, `${indexStatus.entries} directories · ${time}`);
  }, [english, indexStatus, label]);

  /** 快捷键冲突只在真正失败时提示；注册成功不显示任何文字。 */
  const hotkeyConflict = useMemo(() => {
    const problems: string[] = [];
    if (hotkeyStatus && !hotkeyStatus.toggleRegistered) {
      problems.push(
        `${label("主窗口快捷键", "Main window shortcut")}: ${hotkeyErrorText(hotkeyStatus.toggleError, english)}`,
      );
    }
    if (hotkeyStatus?.quickHotkey && !hotkeyStatus.quickRegistered) {
      problems.push(
        `${label("快速启动快捷键", "Quick-launch shortcut")}: ${hotkeyErrorText(hotkeyStatus.quickError, english)}`,
      );
    }
    return problems.length > 0 ? problems.join(english ? "; " : "；") : null;
  }, [english, hotkeyStatus, label]);

  /** 编辑器下拉项：后端探测结果 + 必定存在的「文件资源管理器」。 */
  const editorOptions = useMemo(() => {
    const list = editors.length > 0 ? editors : FALLBACK_EDITORS;
    if (list.some((editor) => editor.id === EXPLORER_EDITOR_ID)) return list;
    return [
      ...list,
      { id: EXPLORER_EDITOR_ID, name: "File Explorer", available: true, command: null },
    ];
  }, [editors]);

  const editorLabel = useCallback(
    (editor: EditorInfo) => EDITOR_LABELS[editor.id]?.[english ? "en" : "zh"] ?? editor.name,
    [english],
  );

  return {
    draft,
    setDraft,
    settings,
    defaultSettings: DEFAULT_SETTINGS,
    saveError,
    update,
    persist,
    english,
    label,
    hotkeyStatus,
    hotkeyConflict,
    retryingHotkeys,
    retryHotkeys,
    indexStatus,
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
  };
}
