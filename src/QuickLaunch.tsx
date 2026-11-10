/**
 * 快速启动浮窗。
 *
 * 类 Spotlight 的极简界面：输入即搜，回车打开，Esc 关闭。
 * 与主窗口共用同一份数据与打开逻辑，但界面只保留「搜索 + 结果」。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { errorText } from "./lib/errors";
import { createFolderSearch, hasQuery } from "./lib/search";
import { shortenPath } from "./lib/path";
import { projectStyle } from "./lib/project";
import { useAppStore } from "./stores/useAppStore";
import type { FolderRecord } from "./lib/types";
import { SearchIcon } from "./components/Icons";

const quickWindow = () => getCurrentWindow();

/** 隐藏浮窗并清空输入。 */
async function dismiss() {
  await quickWindow().hide();
}

export default function QuickLaunch() {
  const { folders, loaded, load, openPath } = useAppStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 首次挂载：加载数据并聚焦输入框。
  useEffect(() => {
    void load().catch(() => {});
    inputRef.current?.focus();
  }, [load]);

  /**
   * 每次窗口重新获得焦点时刷新数据。
   *
   * 浮窗与主窗口是两个独立的 WebView，各自持有独立的 store。
   * 窗口隐藏时组件并不会卸载，所以只在挂载时 `load()` 会导致：
   * 在主窗口新增/删除记录后，浮窗里仍是旧列表。
   */
  useEffect(() => {
    const unlisten = quickWindow().onFocusChanged(({ payload }) => {
      if (!payload) return;
      inputRef.current?.focus();
      inputRef.current?.select();
      void load().catch(() => {});
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [load]);

  const fuse = useMemo(() => createFolderSearch(folders), [folders]);

  /** 结果：有查询时模糊匹配，否则按最近使用列出前 8 条。 */
  const results: FolderRecord[] = useMemo(() => {
    if (hasQuery(query)) {
      return fuse
        .search(query.trim())
        .slice(0, 20)
        .map((r) => r.item);
    }
    return [...folders]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 8);
  }, [fuse, folders, query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const openRecord = useCallback(
    async (record: FolderRecord) => {
      try {
        const result = await openPath(record.path);
        if (!result.historySaved) {
          setError(`已打开，但历史记录未保存：${result.historyError ?? "请稍后重试"}`);
          return;
        }
        await dismiss();
        setQuery("");
      } catch (err) {
        setError(errorText(err));
      }
    },
    [openPath],
  );

  /**
   * 键盘处理挂在 window 上而非容器 div。
   *
   * 焦点始终在 input 内，而 WebView 对 Escape 等按键的默认行为
   * 会干扰容器级的 onKeyDown；挂到 window 并显式 preventDefault 更可靠。
   */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery("");
        void dismiss();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((s) => Math.min(s + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const target = results[selected];
        if (target) void openRecord(target);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [results, selected, openRecord]);

  return (
    <div className="window-glass flex h-full flex-col overflow-hidden rounded-xl">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-4">
        <SearchIcon size={16} className="shrink-0 text-[var(--text-secondary)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          placeholder="搜索文件夹…"
          aria-label="快速搜索文件夹"
          spellCheck={false}
          className="h-full flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
        />
        <span className="kbd shrink-0">Esc</span>
      </div>

      <div className="flex-1 overflow-y-auto pb-1">
        {!loaded ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-secondary)]">
            {hasQuery(query) ? `没有匹配「${query}」的文件夹` : "还没有记录，先在主界面添加"}
          </div>
        ) : (
          results.map((record, index) => {
            const project = projectStyle(record.kind);
            return (
              <div
                key={record.id}
                onClick={() => void openRecord(record)}
                onMouseEnter={() => setSelected(index)}
                className={`mx-2 flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 transition-colors ${
                  index === selected ? "row-selected" : "row-hover"
                }`}
              >
                <span
                  className="h-6 w-1 shrink-0 rounded-full"
                  style={{ background: record.color ?? "var(--accent)" }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {record.name}
                </span>
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
                <span className="shrink-0 truncate text-[11px] text-[var(--text-secondary)] opacity-70">
                  {shortenPath(record.path, 34)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div role="alert" className="shrink-0 px-4 pb-2 text-[11px] text-red-500">
          {error}
        </div>
      )}

      <div className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--glass-border)] px-4 text-[10px] text-[var(--text-secondary)]">
        <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
        <span>{folders.length} 个文件夹</span>
      </div>
    </div>
  );
}
