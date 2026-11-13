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
  /** Shift+F10 打开当前行的操作菜单。 */
  onContextMenu: (row: Row) => void;
  onFocusSearch: () => void;
  onOpenSettings: () => void;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  query: string;
  onClearQuery: () => void;
  /** 只有搜索框自身获得焦点时，回车才应打开当前行。 */
  isSearchFocused: () => boolean;
}

/** 事件目标里与键盘归属相关的最小信息。 */
export interface KeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

/**
 * 目标是否是文本输入类控件。
 *
 * 输入框里的按键属于用户正在输入的内容，全局导航不能抢。
 */
export function isTextInput(target: KeyTarget | null | undefined): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  return (
    tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable === true
  );
}

/**
 * 回车是否应交给焦点所在的控件自己处理。
 *
 * 行内的图标按钮（启动 Codex、收藏等）也是 `<button>`：聚焦后按回车
 * 应该触发按钮本身，而不是被全局导航改成「用默认编辑器打开」。
 * 搜索框是例外——那里的回车本就该打开当前行，由调用方另行放行。
 */
export function enterBelongsToControl(target: KeyTarget | null | undefined): boolean {
  if (isTextInput(target)) return true;
  return ((target?.tagName ?? "").toUpperCase()) === "BUTTON";
}

export function useKeyboardNav({
  rows,
  selected,
  onSelect,
  onOpen,
  onFavorite,
  onRemove,
  onContextMenu,
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

      // 弹出层（右键菜单、添加文件夹对话框等）在**捕获阶段**监听按键，
      // 处理完只调用了 preventDefault，事件仍会冒泡到这里。
      // 这里必须让路：在右键菜单里按回车不该顺带用默认编辑器打开文件夹，
      // 按 Esc 也不该顺带清空搜索框。
      if (event.defaultPrevented) return;

      const typing = isTextInput(target);
      const controlOwnsEnter = enterBelongsToControl(target);

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
      if (event.key === "Enter" && (!controlOwnsEnter || isSearchFocused())) {
        const row = rows[selected];
        if (!row) return;
        event.preventDefault();
        onOpen(row);
        return;
      }
      // Shift+F10 是 Windows 上「打开上下文菜单」的键盘等价操作。
      if (event.key === "F10" && event.shiftKey) {
        const row = rows[selected];
        if (!row || row.kind !== "record") return;
        event.preventDefault();
        onContextMenu(row);
        return;
      }

      const row = rows[selected];
      if (!row || row.kind !== "record") return;
      if (event.ctrlKey && key === "d" && !typing) {
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
    onContextMenu,
    onFocusSearch,
    onOpenSettings,
    settingsOpen,
    onCloseSettings,
    query,
    onClearQuery,
    isSearchFocused,
  ]);
}
