/**
 * 设置页左侧目录。
 *
 * 每个条目只显示名称：说明文字改为悬停提示，避免目录被小字撑成两行。
 * 当前分区用左侧竖条 + 主题色文字标出，滚动和点击共用同一份状态。
 */
import Hint from "./Hint";

export interface SectionNavItem {
  id: string;
  label: string;
  /** 悬停说明。 */
  hint?: string;
}

interface Props {
  items: SectionNavItem[];
  active: string | null;
  onSelect: (id: string) => void;
  /** 无障碍标签（例如「设置目录」）。 */
  ariaLabel: string;
}

export default function SectionNav({ items, active, onSelect, ariaLabel }: Props) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex w-[168px] shrink-0 flex-col gap-0.5 overflow-x-hidden overflow-y-auto border-r border-[var(--glass-border)] px-2 py-3"
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <Hint key={item.id} text={item.hint} block>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={selected ? "true" : undefined}
              className={`relative flex h-8 w-full items-center rounded-md px-2.5 text-left text-[12.5px] transition-colors ${
                selected
                  ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] font-medium text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:text-[var(--text-primary)]"
              }`}
            >
              {selected && (
                <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-[var(--accent)]" />
              )}
              <span className="truncate">{item.label}</span>
            </button>
          </Hint>
        );
      })}
    </nav>
  );
}
