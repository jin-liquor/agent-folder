/**
 * 快速启动浮窗。
 *
 * 类 Spotlight 的极简界面：输入即搜，回车打开，Esc 关闭。
 * 结果分两段：已保存记录（模糊匹配）→ 磁盘索引命中（去重后）。
 * 打开方式图标见 [`OpenWithBar`]，快捷键映射与设置项保持同步。
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { errorText } from "./lib/errors";
import * as system from "./lib/system";
import { t } from "./lib/i18n";
import { createFolderSearch, hasQuery } from "./lib/search";
import { shortenPath } from "./lib/path";
import { excludeKnownPaths, folderPathSet } from "./lib/disk";
import { projectStyle } from "./lib/project";
import { useDiskIndex } from "./hooks/useDiskIndex";
import { useAppStore } from "./stores/useAppStore";
import { openCliAgent, openInEditor, revealInExplorer } from "./lib/commands";
import OpenWithBar from "./components/OpenWithBar";
import type { FolderRecord, QuickEnterAction, SearchHit } from "./lib/types";
import { SearchIcon } from "./components/Icons";

const quickWindow = () => getCurrentWindow();

/**
 * 浮窗空闲多久后自动收起（毫秒）。
 *
 * 8 秒足够扫一眼列表再决定，又不会长时间占据屏幕中央。
 */
const IDLE_DISMISS_MS = 8000;

/** 隐藏浮窗并清空输入。 */
async function dismiss() {
  await quickWindow().hide();
}

type QuickRow =
  | { kind: "record"; record: FolderRecord }
  | { kind: "disk"; hit: SearchHit };

function enterLabel(action: QuickEnterAction, english: boolean): string {
  if (english) {
    return {
      defaultEditor: "Open",
      vscode: "Open in VS Code",
      codex: "Launch Codex",
      claude: "Launch Claude",
      omp: "Launch omp",
      opencode: "Launch opencode",
    }[action];
  }
  return {
    defaultEditor: "打开",
    vscode: "VS Code 打开",
    codex: "启动 Codex",
    claude: "启动 Claude",
    omp: "启动 omp",
    opencode: "启动 opencode",
  }[action];
}

export default function QuickLaunch() {
  const { folders, settings, loaded, load, openPath, cliStatus, refreshCliStatus } = useAppStore();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void system
      .onSettingsChanged(() => void useAppStore.getState().reloadSettings())
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // 首次挂载：加载数据、探测 CLI 可用性并聚焦输入框。
  useEffect(() => {
    void load().catch(() => {});
    void refreshCliStatus().catch(() => {});
    inputRef.current?.focus();
  }, [load, refreshCliStatus]);

  /**
   * 窗口焦点变化：获得焦点时刷新数据，失去焦点时自动收起。
   *
   * 浮窗与主窗口是两个独立的 WebView，各自持有独立的 store。
   * 窗口隐藏时组件并不会卸载，所以只在挂载时 `load()` 会导致：
   * 在主窗口新增/删除记录后，浮窗里仍是旧列表。
   *
   * 「点击界面之外自动关闭」依靠失焦事件实现：用户点任何别的地方，
   * 浮窗都会立刻收起，不需要再按 Esc。
   */
  useEffect(() => {
    const unlisten = quickWindow().onFocusChanged(({ payload }) => {
      if (!payload) {
        // 失效即收起；dismiss 是幂等的（已隐藏时再隐藏无副作用）。
        void dismiss();
        return;
      }
      inputRef.current?.focus();
      inputRef.current?.select();
      void load().catch(() => {});
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [load]);

  /**
   * 空闲自动关闭。
   *
   * 浮窗弹出后如果一直没人管，就会挡在屏幕中央；这里在最后一次
   * 键盘/鼠标操作之后倒计时，超时就收起。任何交互都会重置计时。
   */
  useEffect(() => {
    let timer: number | undefined;

    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void dismiss();
      }, IDLE_DISMISS_MS);
    };

    const events: (keyof WindowEventMap)[] = [
      "keydown",
      "mousemove",
      "mousedown",
      "wheel",
      "input",
      // 重新呼出浮窗时也会触发 focus，计时器随之重新开始；
      // 否则关掉一次之后，下次打开就不会再自动收起了。
      "focus",
    ];
    events.forEach((name) => window.addEventListener(name, reset, true));
    reset();

    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset, true));
    };
  }, []);

  const { hits, status } = useDiskIndex(query, settings.scanEnabled, 6);
  const fuse = useMemo(() => createFolderSearch(folders), [folders]);

  /** 结果：有查询时模糊匹配 + 磁盘命中，否则按最近使用列出前 8 条。 */
  const rows: QuickRow[] = useMemo(() => {
    if (!hasQuery(query)) {
      return [...folders]
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
        .slice(0, 8)
        .map((record) => ({ kind: "record" as const, record }));
    }

    const records: QuickRow[] = fuse
      .search(query.trim())
      .slice(0, 12)
      .map((result) => ({ kind: "record" as const, record: result.item }));
    const disks: QuickRow[] = excludeKnownPaths(hits, folderPathSet(folders)).map((hit) => ({
      kind: "disk" as const,
      hit,
    }));

    return [...records, ...disks];
  }, [folders, fuse, hits, query]);

  const firstDiskIndex = rows.findIndex((row) => row.kind === "disk");

  useEffect(() => {
    setSelected(0);
  }, [query]);

  /** 按指定方式打开一行；`Enter` 用设置里的默认动作。 */
  const perform = useCallback(
    async (row: QuickRow, action: QuickEnterAction) => {
      const path = row.kind === "record" ? row.record.path : row.hit.path;
      try {
        if (action === "codex" || action === "claude" || action === "omp" || action === "opencode") {
          // record=true：磁盘结果打开后立即进入历史，下次直接出现在第一段。
          await openCliAgent(path, action, true);
        } else {
          const result =
            action === "vscode" ? await openInEditor(path, "vscode") : await openPath(path);
          if (!result.historySaved) {
            setError(
              settings.language === "en-US"
                ? `Opened, but history was not saved: ${result.historyError ?? "Please try again later"}`
                : `已打开，但历史记录未保存：${result.historyError ?? "请稍后重试"}`,
            );
            return;
          }
        }
        setError(null);
        setQuery("");
        setDraft("");
        await dismiss();
      } catch (err) {
        setError(errorText(err, settings.language));
      }
    },
    [openPath, settings.language],
  );

  /**
   * 键盘处理挂在 window 上而非容器 div。
   *
   * 焦点始终在 input 内，而 WebView 对 Escape 等按键的默认行为
   * 会干扰容器级的 onKeyDown；挂到 window 并显式 preventDefault 更可靠。
   * `isComposing` 用于避免中文输入法选词时误触发打开。
   */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setQuery("");
        setDraft("");
        void dismiss();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((s) => Math.min(s + 1, Math.max(rows.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        return;
      }

      const target = rows[selected];
      if (event.key === "Enter") {
        event.preventDefault();
        if (!target) return;
        void perform(target, settings.quickEnterAction);
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [rows, selected, perform, settings.quickEnterAction]);

  const showIcons = settings.quickOpenWith;

  return (
    <div className="window-glass flex h-full flex-col overflow-hidden rounded-xl">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[var(--glass-border)] px-3">
        <SearchIcon size={15} className="shrink-0 text-[var(--text-secondary)]" />
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            // 输入法拼写过程中不触发查询，避免拼音串抖动。
            if (!composing.current) setQuery(event.target.value);
            setError(null);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            setQuery(event.currentTarget.value);
          }}
          placeholder={t(settings.language, "searchPlaceholder")}
          aria-label={t(settings.language, "searchAria")}
          spellCheck={false}
          className="h-full flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
        />
        <span className="kbd shrink-0">Esc</span>
      </div>

      {settings.scanEnabled && status && !status.ready && status.building && (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[var(--glass-border)] bg-[var(--canvas-subtle)] px-3 text-[10px] text-[var(--text-secondary)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          {t(settings.language, "diskIndexing")} · {t(settings.language, "scannedDirectories")} {status.scanned}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {!loaded ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center text-[12px] text-[var(--text-secondary)]">
            {hasQuery(query) ? (
              <>
                <span>
                  {settings.language === "zh-CN"
                    ? `没有匹配「${query}」的文件夹`
                    : `No folders match “${query}”`}
                </span>
                {settings.scanEnabled && status && !status.ready && (
                  <span className="text-[10px]">{t(settings.language, "indexNotReady")}</span>
                )}
              </>
            ) : (
              <span>{t(settings.language, "noRecords")}</span>
            )}
          </div>
        ) : (
          rows.map((row, index) => {
            const isRecord = row.kind === "record";
            const name = isRecord ? row.record.name : row.hit.name;
            const path = isRecord ? row.record.path : row.hit.path;
            const color = isRecord ? (row.record.color ?? "var(--accent)") : "var(--success)";
            const project = isRecord ? projectStyle(row.record.kind) : null;

            return (
              <Fragment key={isRecord ? row.record.id : `disk-${row.hit.path}`}>
                {index === firstDiskIndex && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
                    {t(settings.language, "disk")} · {rows.length - firstDiskIndex} {t(settings.language, "hits")}
                  </div>
                )}
                <div
                  onClick={() => void perform(row, settings.quickEnterAction)}
                  onMouseEnter={() => setSelected(index)}
                  className={`group mx-2 flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-2.5 transition-colors ${
                    index === selected ? "row-selected" : "row-hover"
                  }`}
                >
                  <span
                    className="h-6 w-[3px] shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
                    {name}
                  </span>
                  {!isRecord && (
                    <span className="shrink-0 rounded-md border border-[var(--glass-border)] px-1 py-px text-[9px] leading-[13px] text-[var(--text-secondary)]">
                      {t(settings.language, "disk")}
                    </span>
                  )}
                  {project && (
                    <span
                      className="shrink-0 rounded border px-1 py-px text-[9px] leading-[13px]"
                      style={{
                        color: project.color,
                        borderColor: `color-mix(in srgb, ${project.color} 45%, transparent)`,
                      }}
                    >
                      {project.label}
                    </span>
                  )}
                  <span className="shrink-0 truncate text-[11px] text-[var(--text-secondary)]">
                    {shortenPath(path, 32)}
                  </span>
                  {showIcons && (
                    <OpenWithBar
                      active={index === selected}
                      language={settings.language}
                      available={cliStatus}
                      onVscode={() => void perform(row, "vscode")}
                      onCodex={() => void perform(row, "codex")}
                      onClaude={() => void perform(row, "claude")}
                      onOmp={() => void perform(row, "omp")}
                      onOpencode={() => void perform(row, "opencode")}
                      onReveal={() =>
                        void revealInExplorer(path).catch((err: unknown) =>
                          setError(errorText(err, settings.language)),
                        )
                      }
                    />
                  )}
                </div>
              </Fragment>
            );
          })
        )}
      </div>

      {error && (
        <div role="alert" className="shrink-0 px-4 pb-2 text-[11px] text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-[var(--glass-border)] bg-[var(--canvas-subtle)] px-3 text-[10px] text-[var(--text-secondary)]">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="kbd">↑↓</span>
          <span>
            Enter {enterLabel(settings.quickEnterAction, settings.language === "en-US")}
          </span>
          {showIcons && (
            <span className="truncate opacity-75">· {t(settings.language, "clickToChange")}</span>
          )}
        </span>
        <span className="shrink-0">
          {status?.ready
            ? `${t(settings.language, "indexCount")} ${status.entries}`
            : `${folders.length} ${t(settings.language, "folderCount")}`}
        </span>
      </div>
    </div>
  );
}
