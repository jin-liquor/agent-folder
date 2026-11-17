/**
 * 设置页目录导航：点击跳转 + 滚动高亮（scrollspy）。
 *
 * 之所以放在 hook 里：跳转与高亮共享同一份「分区 id → 滚动位置」计算，
 * 拆成两个实现必然出现滚动后高亮与点击结果不一致。
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 判定「已经滚到某个分区」时的容差（像素）。 */
const SPY_TOLERANCE = 24;

/** 跳转后分区标题与容器顶部的间距（像素），避免标题贴边。 */
const SCROLL_PADDING = 12;

/** 一个分区及其相对滚动容器内容顶部的偏移。 */
export interface SectionOffset {
  id: string;
  offset: number;
}

/**
 * 从分区偏移列表里挑出当前分区（纯函数，便于单元测试）。
 *
 * 规则：取「顶部已越过视口上方容差」的最后一个分区；都还没到就取第一个，
 * 这样刚进入页面时高亮不会为空。
 */
export function pickActiveSection(
  sections: readonly SectionOffset[],
  scrollTop: number,
  tolerance: number = SPY_TOLERANCE,
): string | null {
  let current: string | null = null;
  for (const section of sections) {
    if (section.offset <= scrollTop + tolerance) current = section.id;
  }
  return current ?? sections[0]?.id ?? null;
}

/** 计算分区相对于滚动容器内容顶部的偏移。 */
function sectionOffset(container: HTMLElement, section: HTMLElement): number {
  return (
    section.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
  );
}

/** 读出容器里所有分区的偏移。 */
function measureSections(container: HTMLElement, ids: readonly string[]): SectionOffset[] {
  return ids.flatMap((id) => {
    const section = container.querySelector<HTMLElement>(`[data-section="${id}"]`);
    return section ? [{ id, offset: sectionOffset(container, section) }] : [];
  });
}

/** 根据当前滚动位置找出所在分区。 */
export function activeSectionAt(container: HTMLElement, ids: readonly string[]): string | null {
  return pickActiveSection(measureSections(container, ids), container.scrollTop);
}

export function useSectionNav(ids: readonly string[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sync = () => {
      const next = activeSectionAt(container, ids);
      setActive((prev) => (prev === next ? prev : next));
    };

    sync();
    container.addEventListener("scroll", sync, { passive: true });
    return () => container.removeEventListener("scroll", sync);
  }, [ids]);

  const jump = useCallback((id: string) => {
    const container = containerRef.current;
    if (!container) return;
    const section = container.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!section) return;
    container.scrollTo({
      top: Math.max(sectionOffset(container, section) - SCROLL_PADDING, 0),
      behavior: "smooth",
    });
    setActive(id);
  }, []);

  return { containerRef, active, jump };
}
