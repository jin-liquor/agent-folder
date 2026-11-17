/**
 * 设置项行：左侧标签（说明改为悬停展示），右侧控件。
 *
 * 设计约定（设置页改版后）：
 * - `hint` 只做悬停提示，不占据版面，保证一屏能扫读所有设置项；
 * - `note` 是必须一直可见的动态信息（保存失败、检测到的路径、索引进度）；
 * - `stacked` 用于控件本身较宽的行（扫描范围编辑器），让控件独占一行。
 */
import type { ReactNode } from "react";
import Hint from "./Hint";

interface Props {
  label: string;
  /** 悬停说明。 */
  hint?: string;
  /** 常驻状态行：错误提示、检测结果等动态信息。 */
  note?: ReactNode;
  children: ReactNode;
  /** 控件放在标签下方整行显示。 */
  stacked?: boolean;
}

export default function SettingRow({ label, hint, note, children, stacked = false }: Props) {
  const title = (
    <Hint text={hint}>
      <span
        className={`text-[13px] font-medium text-[var(--text-primary)] ${
          hint ? "cursor-help decoration-dotted underline-offset-2 hover:underline" : ""
        }`}
      >
        {label}
      </span>
    </Hint>
  );

  const status = note ? (
    <div className="mt-1 text-[11px] leading-relaxed break-words text-[var(--text-secondary)]">
      {note}
    </div>
  ) : null;

  if (stacked) {
    return (
      <div className="py-3">
        {title}
        {status}
        <div className="mt-2">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        {title}
        {status}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
