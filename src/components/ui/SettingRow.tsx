/**
 * 设置项行：左侧标题与说明，右侧控件。
 */
import type { ReactNode } from "react";

interface Props {
  label: string;
  desc?: string;
  children: ReactNode;
}

export default function SettingRow({ label, desc, children }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
        {desc && (
          <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{desc}</div>
        )}
      </div>
      {children}
    </div>
  );
}
