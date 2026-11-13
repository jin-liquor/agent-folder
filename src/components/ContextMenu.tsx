/**
 * 通用右键菜单。
 *
 * 主窗口的行内空间有限，低频动作（收藏、重命名、颜色、标签、复制路径、
 * 资源管理器、移除）统一收进右键菜单，行内只保留高频的 CLI 启动。
 *
 * 交互约定：
 * - 右键 / `Shift+F10` 打开，`Esc`、点击外部、滚动、窗口失焦关闭；
 * - 靠近视口右/下边界时自动翻转，避免被裁掉；
 * - 完整键盘可达：`↑`/`↓` 移动，`Enter` 触发。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Language } from "../lib/i18n";

/** 菜单里的一项。 */
export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** 危险操作（如移除记录）用红色强调。 */
  danger?: boolean;
  disabled?: boolean;
  /** 次级说明，显示在右侧（例如快捷键提示）。 */
  hint?: string;
}

/** 一条分隔线。 */
export interface MenuSeparator {
  sep: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

interface Props {
  /** 菜单位置（视口坐标）。 */
  x: number;
  y: number;
  entries: MenuEntry[];
  language: Language;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return "sep" in entry;
}

/** 菜单宽度与高度的估算值，用于边界翻转。 */
const MENU_WIDTH = 208;
const MENU_MIN_HEIGHT = 40;

/**
 * 计算菜单最终位置，保证完整落在视口内。
 *
 * 抽成纯函数以便单测：右边界贴边时向左翻，下边界贴底时向上抬。
 */
export function placeMenu(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  estimatedHeight = 260,
): { left: number; top: number } {
  const left = x + MENU_WIDTH > viewportWidth ? Math.max(0, x - MENU_WIDTH) : x;
  const height = Math.max(estimatedHeight, MENU_MIN_HEIGHT);
  const top = y + height > viewportHeight ? Math.max(0, viewportHeight - height - 8) : y;
  return { left, top };
}

export default function ContextMenu({ x, y, entries, language, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() =>
    placeMenu(x, y, window.innerWidth, window.innerHeight),
  );
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectable = entries.filter((entry): entry is MenuItem => !isSeparator(entry));

  // 先按估算定位，渲染出真实高度后再校正一次，避免菜单被裁切。
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const height = element.offsetHeight;
    setPosition(placeMenu(x, y, window.innerWidth, window.innerHeight, height));
  }, [x, y, entries]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // 菜单打开期间键盘归菜单所有。
      //
      // 这里在 window 的**捕获阶段**监听，事件随后仍会冒泡到 window
      // 上的全局键盘导航。若不在这里拦下，菜单里按回车会在触发菜单动作
      // 的同时，顺带用默认编辑器打开选中的文件夹；按 Esc 会顺带清空
      // 搜索框；上下键会同时移动菜单高亮与列表选中条。
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (selectable.length > 0) {
          setActiveIndex((index) => (index + 1) % selectable.length);
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (selectable.length > 0) {
          setActiveIndex((index) => (index <= 0 ? selectable.length - 1 : index - 1));
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        // 键盘打开菜单时还没有高亮项，此时回车等同选中第一项。
        const item = selectable[activeIndex] ?? selectable[0];
        if (item && !item.disabled) {
          onSelect(item.id);
        }
      }
    };

    // 捕获阶段监听，保证在页面其它处理器之前关闭。
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, onSelect, activeIndex, selectable]);

  const handleSelect = useCallback(
    (item: MenuItem) => {
      if (item.disabled) return;
      onSelect(item.id);
    },
    [onSelect],
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={language === "en-US" ? "Folder actions" : "文件夹操作"}
      style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
      className="fixed z-50 overflow-hidden rounded-md border border-[var(--glass-border)] bg-[var(--glass-solid)] py-1 shadow-xl"
      // 菜单渲染在列表行内部，而行的容器有 onClick=打开。
      // 不阻断冒泡的话，点任何一个菜单项都会额外触发一次「打开」。
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry, index) => {
        if (isSeparator(entry)) {
          return (
            <div
              key={`sep-${index}`}
              role="separator"
              className="my-1 h-px bg-[var(--glass-border)]"
            />
          );
        }
        const itemIndex = selectable.indexOf(entry);
        const isActive = itemIndex === activeIndex;
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            title={entry.hint}
            onMouseEnter={() => setActiveIndex(itemIndex)}
            onClick={() => handleSelect(entry)}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              entry.danger
                ? "text-[var(--danger)]"
                : "text-[var(--text-primary)]"
            } ${isActive ? "bg-[var(--hover-subtle)]" : ""}`}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-80">
              {entry.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.hint && (
              <span className="shrink-0 text-[10px] text-[var(--text-secondary)]">
                {entry.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
