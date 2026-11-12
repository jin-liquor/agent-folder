/**
 * 设置分组：一个标题 + 一段说明 + 若干设置行。
 *
 * 说明只在组首出现一次，避免每一行都重复同样的提示文字。
 */
import type { ReactNode } from "react";

interface Props {
  title: string;
  desc?: string;
  children: ReactNode;
}

export default function SettingSection({ title, desc, children }: Props) {
  return (
    <section className="pt-1 pb-2">
      <div className="pb-1">
        <div className="text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
          {title}
        </div>
        {desc && (
          <div className="mt-1 text-[10.5px] leading-relaxed text-[var(--text-secondary)] opacity-80">
            {desc}
          </div>
        )}
      </div>
      <div className="divide-y divide-[var(--glass-border)] border-t border-[var(--glass-border)]">
        {children}
      </div>
    </section>
  );
}
