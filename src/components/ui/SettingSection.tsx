/**
 * 设置分组：一个标题 + 若干设置行。
 *
 * 组内不再有常驻说明段——分组含义通过标题的悬停提示给出，
 * 行内说明同理（见 `SettingRow` 的 `hint`）。
 */
import type { ReactNode } from "react";
import Hint from "./Hint";

interface Props {
  /** 锚点 id，供左侧目录跳转与滚动高亮定位。 */
  id?: string;
  title: string;
  /** 分组说明，悬停标题时显示。 */
  hint?: string;
  children: ReactNode;
}

export default function SettingSection({ id, title, hint, children }: Props) {
  return (
    <section data-section={id} className="pb-6">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Hint text={hint}>
          <span
            className={`text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase ${
              hint ? "cursor-help" : ""
            }`}
          >
            {title}
          </span>
        </Hint>
      </div>
      <div className="divide-y divide-[var(--glass-border)] border-t border-[var(--glass-border)]">
        {children}
      </div>
    </section>
  );
}
