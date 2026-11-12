/**
 * 应用根组件。
 *
 * 只负责装配：取状态、拼装列表、渲染子组件。
 * 交互细节见 `hooks/`，界面片段见 `components/`。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as system from "./lib/system";
import { openCliAgent, openInEditor, revealInExplorer } from "./lib/commands";
import { errorText } from "./lib/errors";
import { queryTokens } from "./lib/search";
import { useAppStore, applyTheme } from "./stores/useAppStore";
import type { FolderRecord } from "./lib/types";
import TitleBar from "./components/TitleBar";
import SearchBar from "./components/SearchBar";
import FolderItem from "./components/FolderItem";
import SettingsDrawer from "./components/SettingsDrawer";
import EmptyState from "./components/EmptyState";
import AddFolderDialog from "./components/AddFolderDialog";
import Toast from "./components/Toast";
import ScanResultItem from "./components/ScanResultItem";
import SectionTitle from "./components/SectionTitle";
import StorageNotice from "./components/StorageNotice";
import { PlusIcon } from "./components/Icons";
import {
  useDiskIndex,
  useFolderList,
  useKeyboardNav,
  useToast,
  type Row,
} from "./hooks";

export default function App() {
  const {
    folders,
    settings,
    storageStatus,
    loaded,
    missing,
    load,
    scanMissing,
    purgeMissing,
    addFolder,
    removeFolder,
    toggleFavorite,
    renameFolder,
    setFolderColor,
    setFolderTags,
    openPath,
  } = useAppStore();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scanMode = settings.scanEnabled;
  const [addOpen, setAddOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const { hits: diskHits, searching: diskSearching } = useDiskIndex(query, scanMode, 40);
  const { rows, searching } = useFolderList({
    folders,
    query,
    scanMode,
    diskHits,
  });

  // 首次加载：读取数据并应用主题。
  useEffect(() => {
    void load()
      .then(() => {
        setLoadError(null);
        applyTheme(useAppStore.getState().settings.theme);
        // 失效探测放到加载之后，避免拖慢首屏。
        void scanMissing().catch(() => {});
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }, [load, scanMissing]);

  /**
   * 窗口重新获得焦点时刷新数据。
   *
   * 主窗口与快速启动浮窗是两个独立的 WebView，各自持有独立的 store。
   * 在浮窗里打开文件夹会累加 openCount，但主窗口不会自动感知；
   * 切回来时重新拉取一次，避免列表停留在旧状态。
   */
  useEffect(() => {
    const onFocus = () => {
      void load().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const refreshStorage = useCallback(async () => {
    await load();
    applyTheme(useAppStore.getState().settings.theme);
  }, [load]);
  // 查询条件变化时回到第一行，避免选中项越界。
  useEffect(() => {
    setSelected(0);
  }, [query, scanMode]);


  const openRecord = useCallback(
    async (record: FolderRecord) => {
      try {
        const result = await openPath(record.path);
        if (!result.command) throw new Error("编辑器没有返回启动结果");
        toast.show(
          result.historySaved
            ? `已打开「${record.name}」`
            : `已打开「${record.name}」，但历史记录未保存：${result.historyError ?? "请稍后重试"}`,
        );
        if (settings.hideAfterOpen) void system.hideWindow();
        setQuery("");
      } catch (error: unknown) {
        toast.show(`打开失败：${errorText(error)}`);
      }
    },
    [openPath, settings.hideAfterOpen, toast],
  );

  const openInVSCode = useCallback(
    async (record: FolderRecord) => {
      try {
        const result = await openInEditor(record.path, "vscode");
        if (!result.command) throw new Error("Visual Studio Code 没有返回启动结果");
        toast.show(
          result.historySaved
            ? `已在 Visual Studio Code 中打开「${record.name}」`
            : `已在 Visual Studio Code 中打开「${record.name}」，但历史记录未保存：${result.historyError ?? "请稍后重试"}`,
        );
        if (settings.hideAfterOpen) void system.hideWindow();
        setQuery("");
      } catch (error: unknown) {
        toast.show(`VS Code 打开失败：${errorText(error)}`);
      }
    },
    [settings.hideAfterOpen, toast],
  );

  const openScanPath = useCallback(
    async (path: string) => {
      try {
        const result = await openPath(path);
        toast.show(
          result.historySaved
            ? `已打开 ${path}`
            : `已打开 ${path}，但历史记录未保存：${result.historyError ?? "请稍后重试"}`,
        );
        if (settings.hideAfterOpen) void system.hideWindow();
        setQuery("");
      } catch (error: unknown) {
        toast.show(`打开失败：${errorText(error)}`);
      }
    },
    [openPath, settings.hideAfterOpen, toast],
  );

  const launchAgent = useCallback(
    async (path: string, agent: "codex" | "claude", name: string) => {
      try {
        const command = await openCliAgent(path, agent);
        toast.show(`${name} 已启动：${command}`);
        setQuery("");
        if (settings.hideAfterOpen) void system.hideWindow();
      } catch (error: unknown) {
        toast.show(`启动${name}失败：${errorText(error)}`);
      }
    },
    [settings.hideAfterOpen, toast],
  );

  const handleRemove = useCallback(
    async (record: FolderRecord) => {
      try {
        await removeFolder(record.id);
        toast.show(`已移除「${record.name}」`);
      } catch (error: unknown) {
        toast.show(`移除失败：${errorText(error)}`);
      }
    },
    [removeFolder, toast],
  );

  const changeFavorite = useCallback(
    async (record: FolderRecord) => {
      try {
        await toggleFavorite(record.id);
        toast.show(record.favorite ? "已取消收藏" : "已收藏");
      } catch (error: unknown) {
        toast.show(`收藏状态更新失败：${errorText(error)}`);
      }
    },
    [toggleFavorite, toast],
  );

  /** 添加指定路径（目录树选中或对话框返回）。 */
  const addPath = useCallback(
    async (path: string) => {
      try {
        const record = await addFolder(path);
        if (record) toast.show(`已添加「${record.name}」`);
      } catch (error: unknown) {
        toast.show(`添加失败：${errorText(error)}`);
      }
    },
    [addFolder, toast],
  );

  /** 通过系统对话框添加；取消则什么都不做。 */
  const addViaDialog = useCallback(async () => {
    try {
      const record = await addFolder();
      if (record) {
        toast.show(`已添加「${record.name}」`);
        setAddOpen(false);
      }
    } catch (error: unknown) {
      toast.show(`添加失败：${errorText(error)}`);
    }
  }, [addFolder, toast]);

  const handleRename = useCallback(
    async (record: FolderRecord, name: string) => {
      try {
        await renameFolder(record.id, name);
        toast.show(`已重命名为「${name}」`);
      } catch (error: unknown) {
        toast.show(`重命名失败：${errorText(error)}`);
      }
    },
    [renameFolder, toast],
  );

  const handleColor = useCallback(
    async (record: FolderRecord, color: string | null) => {
      try {
        await setFolderColor(record.id, color);
      } catch (error: unknown) {
        toast.show(`标记颜色失败：${errorText(error)}`);
      }
    },
    [setFolderColor, toast],
  );

  const handleTags = useCallback(
    async (record: FolderRecord, tags: string[]) => {
      try {
        await setFolderTags(record.id, tags);
        toast.show(tags.length > 0 ? `已更新标签（${tags.length} 个）` : "已清除标签");
      } catch (error: unknown) {
        toast.show(`更新标签失败：${errorText(error)}`);
      }
    },
    [setFolderTags, toast],
  );

  const highlight = useCallback(
    (text: string) => {
      const tokens = queryTokens(query);
      if (tokens.length === 0) return text;
      const re = new RegExp(`(${tokens.join("|")})`, "gi");
      return text
        .split(re)
        .map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
    },
    [query],
  );

  const focusSearch = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useKeyboardNav({
    rows,
    selected,
    onSelect: setSelected,
    onOpen: (row) => {
      if (row.kind === "record") void openRecord(row.record);
      else void openScanPath(row.hit.path);
    },
    onFavorite: (row) => {
      if (row.kind === "record") void changeFavorite(row.record);
    },
    onRemove: (row) => {
      if (row.kind === "record") void handleRemove(row.record);
    },
    onFocusSearch: focusSearch,
    onOpenSettings: () => setSettingsOpen(true),
    settingsOpen,
    onCloseSettings: () => setSettingsOpen(false),
    query,
    onClearQuery: () => setQuery(""),
    isSearchFocused: () => document.activeElement === inputRef.current,
  });

  const favoriteRows = rows.filter((r) => r.kind === "record" && r.record.favorite);
  const normalRows = rows.filter((r) => !(r.kind === "record" && r.record.favorite));
  const searchRoots = settings.searchRoots ?? [];

  const renderRow = (row: Row, index: number) => {
    if (row.kind === "record") {
      return (
        <FolderItem
          key={row.record.id}
          record={row.record}
          selected={index === selected}
          missing={missing.has(row.record.id)}
          highlight={highlight}
          onOpen={() => void openRecord(row.record)}
          onOpenVisualStudioCode={() => void openInVSCode(row.record)}
          onLaunchCodex={() => void launchAgent(row.record.path, "codex", "Codex")}
          onLaunchClaude={() => void launchAgent(row.record.path, "claude", "Claude Code")}
          onFavorite={() => void changeFavorite(row.record)}
          onReveal={() =>
            void revealInExplorer(row.record.path)
              .then(() => toast.show("已在资源管理器中显示"))
              .catch((error: unknown) => toast.show(`定位失败：${errorText(error)}`))
          }
          onCopy={() =>
            void system
              .copyText(row.record.path)
              .then(() => toast.show("已复制路径"))
              .catch((error: unknown) => toast.show(`复制失败：${errorText(error)}`))
          }
          onRemove={() => void handleRemove(row.record)}
          onRename={(name) => void handleRename(row.record, name)}
          onColor={(color) => void handleColor(row.record, color)}
          onTags={(tags) => void handleTags(row.record, tags)}
        />
      );
    }
    return (
      <ScanResultItem
        key={`disk-${row.hit.path}`}
        path={row.hit.path}
        name={row.hit.name}
        selected={index === selected}
        highlight={highlight}
        onOpen={() => void openScanPath(row.hit.path)}
      />
    );
  };

  if (!loaded) {
    if (loadError) {
      return (
        <div className="window-glass flex h-full flex-col items-center justify-center gap-3 rounded-xl px-8 text-center">
          <div className="text-[13px] font-medium text-[var(--text-primary)]">数据加载失败</div>
          <div className="max-w-[520px] break-words text-[11px] text-[var(--text-secondary)]">
            {loadError}
          </div>
          <button
            onClick={() => {
              setLoadError(null);
              void load().catch((error: unknown) => setLoadError(errorText(error)));
            }}
            className="rounded-lg border border-[var(--glass-border)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            重试
          </button>
        </div>
      );
    }
    return (
      <div className="window-glass flex h-full items-center justify-center rounded-xl">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="window-glass relative flex h-full flex-col overflow-hidden rounded-xl">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <StorageNotice status={storageStatus} onChanged={refreshStorage} />

      <SearchBar
        ref={inputRef}
        value={query}
        onChange={setQuery}
        scanning={diskSearching}
      />

      <div className="flex-1 overflow-y-auto pb-2">
        {rows.length === 0 ? (
          searching ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 pt-16 text-center">
              <div className="text-[13px] text-[var(--text-secondary)]">
                没有找到匹配「{query}」的文件夹
              </div>
              {scanMode && searchRoots.length === 0 && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="text-[11px] text-[var(--accent)] opacity-80 transition hover:opacity-100"
                >
                  磁盘扫描需要先设置扫描范围 → 去设置
                </button>
              )}
              {scanMode && searchRoots.length > 0 && (
                <div className="text-[11px] text-[var(--text-secondary)] opacity-70">
                  已在 {searchRoots.length} 个目录下扫描完成
                </div>
              )}
            </div>
          ) : (
            <EmptyState onAdd={() => setAddOpen(true)} />
          )
        ) : (
          <AnimatePresence initial={false}>
            {!searching && favoriteRows.length > 0 && (
              <motion.div key="fav" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                <SectionTitle text="⭐ 收藏" extra={`${favoriteRows.length} 个`} />
                {favoriteRows.map((row) => renderRow(row, rows.indexOf(row)))}
              </motion.div>
            )}
            {!searching && normalRows.length > 0 && (
              <motion.div
                key="recent"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <SectionTitle text="🕘 最近使用" extra={`${normalRows.length} 个`} />
                {normalRows.map((row) => renderRow(row, rows.indexOf(row)))}
              </motion.div>
            )}
            {searching && (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <SectionTitle text="搜索结果" extra={`${rows.length} 个`} />
                {rows.map((row, i) => renderRow(row, i))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <div className="flex h-12 shrink-0 items-center justify-between border-t border-[var(--glass-border)] bg-[var(--canvas-subtle)] px-4">
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-[var(--glass-border)] bg-[var(--canvas-default)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <PlusIcon size={13} />
          添加文件夹
        </button>

        <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)]">
          {missing.size > 0 && (
            <button
              aria-label={`清理 ${missing.size} 条失效记录`}
              title={`清理 ${missing.size} 条失效记录`}
              onClick={() => {
                void purgeMissing()
                  .then((n) => toast.show(`已清理 ${n} 条失效记录`))
                  .catch((error: unknown) => toast.show(`清理失败：${errorText(error)}`));
              }}
              className="flex items-center gap-1 rounded-md border border-[var(--danger)]/40 px-2 py-1 text-[var(--danger)] transition hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
            >
              清理 {missing.size} 条失效记录
            </button>
          )}
          <span>{searching ? `${rows.length} 个结果` : `${folders.length} 个文件夹`}</span>
          <span className="kbd">Ctrl K 搜索</span>
        </div>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onImported={() => {
          void load().catch((error: unknown) => toast.show(`刷新失败：${errorText(error)}`));
        }}
        onToast={toast.show}
      />

      <AddFolderDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPickPath={(path) => {
          setAddOpen(false);
          void addPath(path);
        }}
        onBrowse={() => {
          setAddOpen(false);
          void addViaDialog();
        }}
      />

      <Toast message={toast.message} />
    </div>
  );
}
