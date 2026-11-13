/**
 * 添加文件夹的弹层。
 *
 * 提供两种方式，覆盖不同习惯：
 * - 浏览磁盘：适合不记得路径、需要逐层找的情况
 * - 系统对话框：适合已知路径、或需要粘贴路径的情况
 */
import { useEffect } from "react";
import type { Language } from "../lib/i18n";
import DirectoryTree from "./DirectoryTree";
import { FolderIcon } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 通过目录树选中了某个路径。 */
  onPickPath: (path: string) => void;
  /** 打开系统目录选择对话框。 */
  onBrowse: () => void;
  language: Language;
}

export default function AddFolderDialog({ open, onClose, onPickPath, onBrowse, language }: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
  // Esc 关闭。
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="flex w-[380px] flex-col overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-solid)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={text("添加文件夹", "Add folder")}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--glass-border)] px-3">
          <FolderIcon size={15} className="text-[var(--accent)]" />
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{text("添加文件夹", "Add folder")}</span>
        </div>

        <div className="px-1.5 py-1.5">
          <DirectoryTree onPick={onPickPath} language={language} />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--glass-border)] px-3 py-2">
          <button
            type="button"
            onClick={onBrowse}
            className="rounded-md border border-[var(--glass-border)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {text("用系统对话框选择…", "Choose with system dialog…")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
          >
            {text("取消", "Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
