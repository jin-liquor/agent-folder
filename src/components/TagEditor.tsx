/**
 * 标签编辑弹层。
 *
 * 用逗号或回车分隔标签；提交时由后端统一去重与规范化。
 * 标签会参与模糊搜索，所以这里的输入体验要尽量轻。
 */
import { useEffect, useRef, useState } from "react";

import type { Language } from "../lib/i18n";

interface Props {
  /** 当前标签，用于初始化输入框。 */
  tags: string[];
  onSubmit: (tags: string[]) => void;
  onClose: () => void;
  language: Language;
}

/** 把输入串拆成标签数组，支持中英文逗号与顿号。 */
export function parseTags(input: string): string[] {
  return input
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function TagEditor({ tags, onSubmit, onClose, language }: Props) {
  const english = language === "en-US";
  const text = (zh: string, en: string) => (english ? en : zh);
  const [draft, setDraft] = useState(tags.join(", "));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    onSubmit(parseTags(draft));
    onClose();
  };

  return (
    <div
      className="absolute right-2 z-40 mt-1 w-[220px] rounded-xl border border-[var(--glass-border)] bg-[var(--glass-solid)] p-2.5 shadow-2xl"
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-label={text("编辑标签", "Edit tags")}
    >
      <div className="mb-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
        {text("标签（逗号分隔）", "Tags (comma-separated)")}
      </div>
      <input
        ref={inputRef}
        value={draft}
        aria-label={text("标签输入", "Tag input")}
        placeholder={text("例如：rust, 工具", "e.g. rust, tools")}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        className="h-7 w-full rounded-md border border-[var(--glass-border)] bg-transparent px-2 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
      />
      <div className="mt-2 flex justify-end gap-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
        >
          {text("取消", "Cancel")}
        </button>
        <button
          type="button"
          onClick={commit}
          className="rounded-md border border-[var(--accent)] px-2 py-1 text-[10px] text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
        >
          {text("保存", "Save")}
        </button>
      </div>
    </div>
  );
}
