/**
 * 一条已保存的文件夹记录行。
 *
 * 行内只保留 6 个高频动作：VS Code / Codex / Claude / omp / opencode / 收藏。
 * 收藏、重命名、颜色、标签、资源管理器、复制路径、移除等低频操作
 * 统一收进右键菜单（`Shift+F10` 为键盘等价入口）。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Language } from "../lib/i18n";
import type { FolderRecord } from "../lib/types";
import { shortenPath, timeAgo } from "../lib/path";
import { projectStyle } from "../lib/project";
import ActionButton from "./ui/ActionButton";
import ColorPicker from "./ColorPicker";
import TagEditor from "./TagEditor";
import ContextMenu, { type MenuEntry } from "./ContextMenu";
import {
  ClaudeIcon,
  CodexIcon,
  CopyIcon,
  EditIcon,
  FolderIcon,
  OmpIcon,
  OpencodeIcon,
  PaletteIcon,
  RevealIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  VisualStudioCodeIcon,
} from "./Icons";

interface Props {
  record: FolderRecord;
  language: Language;
  selected: boolean;
  /** 目录是否已不存在（改名或删除）。 */
  missing?: boolean;
  highlight: (text: string) => ReactNode;
  onOpen: () => void;
  onOpenVisualStudioCode: () => void;
  onLaunchCodex: () => void;
  onLaunchClaude: () => void;
  onLaunchOmp: () => void;
  onLaunchOpencode: () => void;
  onFavorite: () => void;
  onReveal: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  onColor: (color: string | null) => void;
  onTags: (tags: string[]) => void;
  /** 外部要求打开操作菜单（键盘 Shift+F10 触发）。 */
  forceMenu?: boolean;
  /** 菜单关闭后通知外层复位。 */
  onMenuClosed?: () => void;
}

export default function FolderItem({
  record,
  language,
  selected,
  missing = false,
  highlight,
  onOpen,
  onOpenVisualStudioCode,
  onLaunchCodex,
  onLaunchClaude,
  onLaunchOmp,
  onLaunchOpencode,
  onFavorite,
  onReveal,
  onCopy,
  onRemove,
  onRename,
  onColor,
  onTags,
  forceMenu = false,
  onMenuClosed,
}: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(record.name);
  const [colorOpen, setColorOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  /** 进入编辑态时同步一次最新名称，避免陈旧草稿。 */
  const beginEdit = () => {
    setDraft(record.name);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== record.name) onRename(next);
  };

  const cancel = () => {
    setDraft(record.name);
    setEditing(false);
  };

  const project = projectStyle(record.kind);

  /** 右键菜单项：低频动作全部收在这里。 */
  const menuEntries: MenuEntry[] = [
    { id: "reveal", label: text("在资源管理器中显示", "Show in File Explorer"), icon: <RevealIcon size={12} /> },
    { id: "copy", label: text("复制路径", "Copy path"), icon: <CopyIcon size={12} /> },
    { sep: true },
    {
      id: "favorite",
      label: record.favorite ? text("取消收藏", "Remove from favorites") : text("收藏", "Add to favorites"),
      icon: <StarIcon size={12} filled={record.favorite} />,
    },
    { id: "rename", label: text("重命名", "Rename"), icon: <EditIcon size={12} /> },
    { id: "color", label: text("标记颜色", "Label color"), icon: <PaletteIcon size={12} /> },
    { id: "tags", label: text("编辑标签", "Edit tags"), icon: <TagIcon size={12} /> },
    { sep: true },
    { id: "remove", label: text("移除记录", "Remove record"), icon: <TrashIcon size={12} />, danger: true },
  ];

  const handleMenuSelect = (id: string) => {
    setMenu(null);
    switch (id) {
      case "reveal":
        onReveal();
        break;
      case "copy":
        onCopy();
        break;
      case "favorite":
        onFavorite();
        break;
      case "rename":
        beginEdit();
        break;
      case "color":
        setColorOpen(true);
        break;
      case "tags":
        setTagsOpen(true);
        break;
      case "remove":
        onRemove();
        break;
      default:
        break;
    }
  };

  const openMenuAt = (x: number, y: number) => {
    setColorOpen(false);
    setTagsOpen(false);
    setMenu({ x, y });
  };

  // 键盘触发（Shift+F10）时没有鼠标坐标，用行自身位置打开。
  useEffect(() => {
    if (!forceMenu) return;
    const element = rowRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    openMenuAt(rect.left + 48, rect.top + rect.height / 2);
  }, [forceMenu]);

  return (
    <div
      ref={rowRef}
      onClick={() => {
        if (!editing) onOpen();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenuAt(event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        // Shift+F10 是 Windows 上打开上下文菜单的键盘等价操作。
        if (event.key === "F10" && event.shiftKey) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          openMenuAt(rect.left + 48, rect.top + rect.height / 2);
        }
      }}
      tabIndex={0}
      className={`group relative mx-2 flex h-[52px] cursor-pointer items-center gap-2.5 rounded-md px-2.5 transition-colors row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
        selected ? "row-selected" : ""
      }`}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{
          background: missing
            ? "color-mix(in srgb, #ef4444 14%, transparent)"
            : record.color
              ? `color-mix(in srgb, ${record.color} 22%, transparent)`
              : "color-mix(in srgb, var(--accent) 12%, transparent)",
          color: missing ? "#ef4444" : (record.color ?? "var(--accent)"),
        }}
      >
        <FolderIcon size={16} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-1.5">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              aria-label={text("重命名文件夹", "Rename folder")}
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={commit}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-[var(--accent)] bg-transparent px-1 py-0.5 text-[13px] font-medium text-[var(--text-primary)] outline-none"
            />
          ) : (
            <span
              onDoubleClick={(event) => {
                event.stopPropagation();
                beginEdit();
              }}
              title={text("双击重命名", "Double-click to rename")}
              className="truncate text-[13px] font-medium text-[var(--text-primary)]"
            >
              {highlight(record.name)}
            </span>
          )}
          {project && (
            <span
              className="shrink-0 rounded border px-1 py-px text-[9px] leading-[13px] font-medium"
              style={{
                color: project.color,
                borderColor: `color-mix(in srgb, ${project.color} 45%, transparent)`,
                background: `color-mix(in srgb, ${project.color} 12%, transparent)`,
              }}
            >
              {project.label}
            </span>
          )}
          {record.favorite && (
            <StarIcon size={11} filled className="shrink-0 text-amber-400" />
          )}
          {missing && (
            <span
              title={text("该目录已不存在，可能被改名或删除", "This directory no longer exists; it may have been renamed or deleted")}
              className="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-1 py-px text-[9px] leading-[13px] font-medium text-red-500"
            >
              {text("路径失效", "Path unavailable")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 truncate text-[11px] text-[var(--text-secondary)]">
          <span className={`truncate ${missing ? "line-through opacity-60" : ""}`}>
            {highlight(shortenPath(record.path))}
          </span>
          {record.tags.length > 0 && (
            <span className="flex shrink-0 items-center gap-1">
              {record.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] px-1 py-px text-[9px] leading-[12px]"
                >
                  {tag}
                </span>
              ))}
              {record.tags.length > 3 && (
                <span className="text-[9px] opacity-60">+{record.tags.length - 3}</span>
              )}
            </span>
          )}
        </div>
      </div>

      <span className="w-[72px] shrink-0 text-right text-[11px] text-[var(--text-secondary)] opacity-70">
        {timeAgo(record.lastOpenedAt)}
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        <ActionButton title={text("使用 Visual Studio Code 打开", "Open with Visual Studio Code")} onClick={onOpenVisualStudioCode}>
          <VisualStudioCodeIcon size={14} />
        </ActionButton>
        <ActionButton title={text("启动 Codex", "Launch Codex")} onClick={onLaunchCodex}>
          <CodexIcon size={14} />
        </ActionButton>
        <ActionButton title={text("启动 Claude Code", "Launch Claude Code")} onClick={onLaunchClaude}>
          <ClaudeIcon size={14} />
        </ActionButton>
        <ActionButton title={text("启动 omp", "Launch omp")} onClick={onLaunchOmp}>
          <OmpIcon size={14} />
        </ActionButton>
        <ActionButton title={text("启动 opencode", "Launch opencode")} onClick={onLaunchOpencode}>
          <OpencodeIcon size={14} />
        </ActionButton>
        <ActionButton title={record.favorite ? text("取消收藏", "Remove from favorites") : text("收藏", "Add to favorites")} onClick={onFavorite}>
          <StarIcon size={14} filled={record.favorite} />
        </ActionButton>
      </div>

      {colorOpen && (
        <ColorPicker
          current={record.color}
          language={language}
          onPick={onColor}
          onClose={() => setColorOpen(false)}
        />
      )}

      {tagsOpen && (
        <TagEditor
          tags={record.tags}
          language={language}
          onSubmit={onTags}
          onClose={() => setTagsOpen(false)}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menuEntries}
          language={language}
          onSelect={handleMenuSelect}
          onClose={() => {
            setMenu(null);
            onMenuClosed?.();
          }}
        />
      )}
    </div>
  );
}
