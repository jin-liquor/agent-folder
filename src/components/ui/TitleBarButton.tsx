/**
 * 无边框窗口标题栏上的图标按钮（设置 / 最小化 / 关闭）。
 */
import type { ReactNode } from "react";

interface Props {
  /** 无障碍名称，同时作为 tooltip。 */
  label: string;
  onClick: () => void;
  children: ReactNode;
  /** 关闭按钮使用红色悬停反馈。 */
  danger?: boolean;
}

export default function TitleBarButton({ label, onClick, children, danger }: Props) {
  const hover = danger
    ? "hover:bg-red-500 hover:text-white"
    : "hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] hover:text-[var(--text-primary)]";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition ${hover}`}
    >
      {children}
    </button>
  );
}
