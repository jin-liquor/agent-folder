/**
 * 一条已保存的文件夹记录行。
 *
 * 支持原地重命名（双击名称或点编辑）与颜色标记，两者都会立即持久化。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FolderRecord } from "../lib/types";
import { shortenPath, timeAgo } from "../lib/path";
import { projectStyle } from "../lib/project";
import ActionButton from "./ui/ActionButton";
import ColorPicker from "./ColorPicker";
import TagEditor from "./TagEditor";
import {
  ClaudeIcon,
  CodexIcon,
  CopyIcon,
  EditIcon,
  FolderIcon,
  PaletteIcon,
  RevealIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  VisualStudioCodeIcon,
} from "./Icons";

interface Props {
  record: FolderRecord;
  selected: boolean;
  /** 目录是否已不存在（改名或删除）。 */
  missing?: boolean;
  highlight: (text: string) => ReactNode;
  onOpen: () => void;
  onOpenVisualStudioCode: () => void;
  onLaunchCodex: () => void;
  onLaunchClaude: () => void;
  onFavorite: () => void;
  onReveal: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  onColor: (color: string | null) => void;
  onTags: (tags: string[]) => void;
}

export default function FolderItem({
  record,
  selected,
  missing = false,
  highlight,
  onOpen,
  onOpenVisualStudioCode,
  onLaunchCodex,
  onLaunchClaude,
  onFavorite,
  onReveal,
  onCopy,
  onRemove,
  onRename,
  onColor,
  onTags,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(record.name);
  const [colorOpen, setColorOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      onClick={() => {
        if (!editing) onOpen();
      }}
      className={`group relative mx-2 flex h-[52px] cursor-pointer items-center gap-2.5 rounded-md px-2.5 transition-colors row-hover ${
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
              aria-label="重命名文件夹"
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
              title="双击重命名"
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
              title="该目录已不存在，可能被改名或删除"
              className="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-1 py-px text-[9px] leading-[13px] font-medium text-red-500"
            >
              路径失效
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
        <ActionButton title="使用 Visual Studio Code 打开" onClick={onOpenVisualStudioCode}>
          <VisualStudioCodeIcon size={14} />
        </ActionButton>
        <ActionButton title="启动 Codex" onClick={onLaunchCodex}>
          <CodexIcon size={14} />
        </ActionButton>
        <ActionButton title="启动 Claude Code" onClick={onLaunchClaude}>
          <ClaudeIcon size={14} />
        </ActionButton>
        <ActionButton title={record.favorite ? "取消收藏" : "收藏"} onClick={onFavorite}>
          <StarIcon size={14} filled={record.favorite} />
        </ActionButton>
        <ActionButton title="重命名" onClick={beginEdit}>
          <EditIcon size={14} />
        </ActionButton>
        <ActionButton title="标记颜色" onClick={() => setColorOpen((open) => !open)}>
          <PaletteIcon size={14} />
        </ActionButton>
        <ActionButton title="编辑标签" onClick={() => setTagsOpen((open) => !open)}>
          <TagIcon size={14} />
        </ActionButton>
        <ActionButton title="在资源管理器中显示" onClick={onReveal}>
          <RevealIcon size={14} />
        </ActionButton>
        <ActionButton title="复制路径" onClick={onCopy}>
          <CopyIcon size={14} />
        </ActionButton>
        <ActionButton title="移除记录" onClick={onRemove} danger>
          <TrashIcon size={14} />
        </ActionButton>
      </div>

      {colorOpen && (
        <ColorPicker
          current={record.color}
          onPick={onColor}
          onClose={() => setColorOpen(false)}
        />
      )}

      {tagsOpen && (
        <TagEditor
          tags={record.tags}
          onSubmit={onTags}
          onClose={() => setTagsOpen(false)}
        />
      )}
    </div>
  );
}
