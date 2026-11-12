/**
 * 列表行内的图标按钮：默认隐藏，悬停或聚焦时显现。
 */
import type { ReactNode } from "react";

interface Props {
  title: string;
  onClick: () => void;
  children: ReactNode;
  /** 危险操作使用红色悬停反馈。 */
  danger?: boolean;
}

export default function ActionButton({ title, onClick, children, danger }: Props) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${
        danger
          ? "text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--hover-subtle)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}
