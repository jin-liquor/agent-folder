/**
 * 内置目录树。
 *
 * 逐层懒加载：只有展开某个节点时才向后端请求它的子目录，
 * 因此打开一个磁盘根节点不会遍历整棵树。
 */
import { useCallback, useEffect, useState } from "react";
import * as commands from "../lib/commands";
import { errorText } from "../lib/errors";
import type { Language } from "../lib/i18n";
import { ChevronIcon, FolderIcon } from "./Icons";

interface Props {
  /** 选中某个目录时回调，用于添加记录。 */
  onPick: (path: string) => void;
  language: Language;
}

/** 单个节点的展开状态与子项。 */
interface NodeState {
  loading: boolean;
  error: string | null;
  children: commands.DirEntry[] | null;
}

export default function DirectoryTree({ onPick, language }: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
  const [drives, setDrives] = useState<commands.DirEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const [rootError, setRootError] = useState<string | null>(null);

  // 首次挂载时加载磁盘列表。
  useEffect(() => {
    void commands
      .listDrives()
      .then(setDrives)
      .catch((err: unknown) => setRootError(errorText(err, language)));
  }, []);

  const toggle = useCallback(
    async (entry: commands.DirEntry) => {
      const path = entry.path;
      const isOpen = expanded.has(path);

      // 收起：只改状态，不重新请求。
      if (isOpen) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }

      setExpanded((prev) => new Set(prev).add(path));

      // 已加载过就直接复用缓存。
      if (nodes[path]?.children) return;

      setNodes((prev) => ({ ...prev, [path]: { loading: true, error: null, children: null } }));
      try {
        const children = await commands.listSubdirs(path);
        setNodes((prev) => ({ ...prev, [path]: { loading: false, error: null, children } }));
      } catch (err) {
        setNodes((prev) => ({
          ...prev,
          [path]: { loading: false, error: errorText(err, language), children: null },
        }));
      }
    },
    [expanded, nodes],
  );

  /** 递归渲染某一层的节点。 */
  const renderLevel = (entries: commands.DirEntry[], depth: number) =>
    entries.map((entry) => {
      const isOpen = expanded.has(entry.path);
      const state = nodes[entry.path];

      return (
        <div key={entry.path}>
          <div
            className="group flex h-7 items-center gap-1 rounded-md pr-1 hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]"
            style={{ paddingLeft: `${depth * 14 + 4}px` }}
          >
            <button
              type="button"
              aria-label={isOpen ? `${text("收起", "Collapse")} ${entry.name}` : `${text("展开", "Expand")} ${entry.name}`}
              title={isOpen ? text("收起", "Collapse") : text("展开", "Expand")}
              disabled={!entry.hasChildren}
              onClick={() => void toggle(entry)}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] transition ${
                entry.hasChildren ? "hover:text-[var(--accent)]" : "opacity-0"
              }`}
            >
              <ChevronIcon size={12} open={isOpen} />
            </button>

            <FolderIcon size={13} className="shrink-0 text-[var(--text-secondary)]" />

            <button
              type="button"
              aria-label={`${text("选择", "Select")} ${entry.name}`}
              title={entry.path}
              onClick={() => onPick(entry.path)}
              className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--text-primary)] hover:text-[var(--accent)]"
            >
              {entry.name}
            </button>
          </div>

          {isOpen && state?.loading && (
            <div
              className="py-1 text-[11px] text-[var(--text-secondary)] opacity-70"
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              {text("加载中…", "Loading…")}
            </div>
          )}
          {isOpen && state?.error && (
            <div
              role="alert"
              className="py-1 text-[11px] text-red-500"
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              {state.error}
            </div>
          )}
          {isOpen && state?.children && state.children.length === 0 && (
            <div
              className="py-1 text-[11px] text-[var(--text-secondary)] opacity-60"
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              {text("没有子目录", "No subdirectories")}
            </div>
          )}
          {isOpen && state?.children && renderLevel(state.children, depth + 1)}
        </div>
      );
    });

  if (rootError) {
    return (
      <div role="alert" className="px-2 py-3 text-[11px] text-red-500">
        {rootError}
      </div>
    );
  }

  if (drives.length === 0) {
    return (
      <div className="px-2 py-3 text-[11px] text-[var(--text-secondary)] opacity-70">{text("加载磁盘…", "Loading disks…")}</div>
    );
  }

  return <div className="max-h-[280px] overflow-y-auto">{renderLevel(drives, 0)}</div>;
}
