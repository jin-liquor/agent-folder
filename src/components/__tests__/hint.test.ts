/**
 * 设置页悬停提示的位置计算。
 *
 * 重点：气泡在窗口边缘不能被裁掉，靠顶部时还要翻到下方——
 * 设置页的说明文字只有悬停才显示，位置算错等于功能不可用。
 */
import { describe, expect, it } from "vitest";
import { tooltipBox } from "../ui/Hint";

describe("tooltipBox", () => {
  it("places the tooltip above the anchor when there is room", () => {
    const box = tooltipBox({ left: 100, top: 400, bottom: 420 }, 1200);
    expect(box.top).toBe(400 - 8);
    expect(box.left).toBe(100);
    expect(box.width).toBe(260);
  });

  it("flips below when the anchor is close to the top edge", () => {
    // 顶部空间不足时会翻到下方，基准点是 anchor 的底边。
    const box = tooltipBox({ left: 100, top: 30, bottom: 50 }, 1200);
    expect(box.top).toBe(50 + 8);
  });

  it("clamps the tooltip inside the viewport", () => {
    const wide = tooltipBox({ left: 1100, top: 400, bottom: 420 }, 1200);
    expect(wide.left).toBe(1200 - 260 - 8);

    const negative = tooltipBox({ left: -40, top: 400, bottom: 420 }, 1200);
    expect(negative.left).toBe(8);
  });

  it("shrinks the tooltip on a narrow window", () => {
    const box = tooltipBox({ left: 10, top: 400, bottom: 420 }, 200);
    expect(box.width).toBe(200 - 16);
    expect(box.left).toBe(8);
  });
});
