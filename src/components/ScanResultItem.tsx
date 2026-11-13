/**
 * 磁盘索引结果行：尚未保存到记录，点击即用默认方式打开。
 */
import type { ReactNode } from "react";
import { t, type Language } from "../lib/i18n";
import { CodeIcon } from "./Icons";

interface Props {
  path: string;
  name: string;
  selected: boolean;
  /** 界面语言；来源标签「磁盘 / Disk」要跟着它走。 */
  language: Language;
  highlight: (text: string) => ReactNode;
  onOpen: () => void;
}

export default function ScanResultItem({
  path,
  name,
  selected,
  language,
  highlight,
  onOpen,
}: Props) {
  return (
    <div
      onClick={onOpen}
      className={`group mx-2 flex h-[52px] cursor-pointer items-center gap-2.5 rounded-md px-2.5 transition-colors row-hover ${
        selected ? "row-selected" : ""
      }`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--glass-border)] bg-[var(--canvas-subtle)] text-[var(--success)]">
        <CodeIcon size={15} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
          {highlight(name)}
        </span>
        <span className="truncate text-[11px] text-[var(--text-secondary)]">{highlight(path)}</span>
      </div>
      <span className="shrink-0 rounded-md border border-[var(--glass-border)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
        {t(language, "disk")}
      </span>
    </div>
  );
}
