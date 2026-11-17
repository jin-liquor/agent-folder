/**
 * 设置页目录的滚动高亮判定。
 *
 * 重点：刚进入页面（scrollTop = 0）时高亮必须落在第一个分区，
 * 否则左侧目录会出现「一个都没选中」的空状态。
 */
import { describe, expect, it } from "vitest";
import { pickActiveSection, type SectionOffset } from "../useSectionNav";

const SECTIONS: SectionOffset[] = [
  { id: "appearance", offset: 0 },
  { id: "editor", offset: 320 },
  { id: "index", offset: 900 },
];

describe("pickActiveSection", () => {
  it("highlights the first section at the top", () => {
    expect(pickActiveSection(SECTIONS, 0)).toBe("appearance");
  });

  it("switches to the section whose top has passed the tolerance", () => {
    // 320 − 24 = 296：越过这个位置就算进入「编辑器」。
    expect(pickActiveSection(SECTIONS, 296)).toBe("editor");
    expect(pickActiveSection(SECTIONS, 900)).toBe("index");
  });

  it("keeps the previous section while the next one is still below", () => {
    expect(pickActiveSection(SECTIONS, 290)).toBe("appearance");
    expect(pickActiveSection(SECTIONS, 870)).toBe("editor");
  });

  it("returns null for an empty list instead of throwing", () => {
    expect(pickActiveSection([], 0)).toBeNull();
  });

  it("honours a custom tolerance", () => {
    // 容差 0 时，必须完全越过分区顶部才切换。
    expect(pickActiveSection(SECTIONS, 319, 0)).toBe("appearance");
    expect(pickActiveSection(SECTIONS, 320, 0)).toBe("editor");
  });
});
