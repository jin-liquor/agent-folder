/**
 * 全局键盘导航：搜索聚焦、设置开关、上下选择、回车打开等。
 */
import { useEffect } from "react";
import type { Row } from "./useFolderList";

interface Options {
  rows: Row[];
  selected: number;
  onSelect: (index: number) => void;
  onOpen: (row: Row) => void;
  onFavorite: (row: Row) => void;
  onRemove: (row: Row) => void;
  onFocusSearch: () => void;
  onOpenSettings: () => void;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  query: string;
  onClearQuery: () => void;
  /** 只有搜索框自身获得焦点时，回车才应打开当前行。 */
  isSearchFocused: () => boolean;
}

export function useKeyboardNav({
  rows,
  selected,
  onSelect,
  onOpen,
  onFavorite,
  onRemove,
  onFocusSearch,
  onOpenSettings,
  settingsOpen,
  onCloseSettings,
  query,
  onClearQuery,
  isSearchFocused,
}: Options) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "SELECT";
      const key = event.key.toLowerCase();

      // 全局快捷键优先，且不受设置面板状态影响。
      if (event.ctrlKey && key === "k") {
        event.preventDefault();
        onFocusSearch();
        return;
      }
      if (event.ctrlKey && event.key === ",") {
        event.preventDefault();
        onOpenSettings();
        return;
      }
      if (event.key === "Escape") {
        if (settingsOpen) onCloseSettings();
        else if (query) onClearQuery();
        return;
      }
      if (settingsOpen) return;

      if (event.key === "ArrowDown") {
        if (rows.length === 0) return;
        event.preventDefault();
        onSelect(Math.min(selected + 1, rows.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        if (rows.length === 0) return;
        event.preventDefault();
        onSelect(Math.max(selected - 1, 0));
        return;
      }
      if (event.key === "Enter" && (!typing || isSearchFocused())) {
        const row = rows[selected];
        if (!row) return;
        event.preventDefault();
        onOpen(row);
        return;
      }

      const row = rows[selected];
      if (!row || row.kind !== "record") return;
      if (event.ctrlKey && key === "d") {
        event.preventDefault();
        onFavorite(row);
      } else if (event.key === "Delete" && !typing) {
        event.preventDefault();
        onRemove(row);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    rows,
    selected,
    onSelect,
    onOpen,
    onFavorite,
    onRemove,
    onFocusSearch,
    onOpenSettings,
    settingsOpen,
    onCloseSettings,
    query,
    onClearQuery,
    isSearchFocused,
  ]);
}
