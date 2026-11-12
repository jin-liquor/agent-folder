/**
 * 右键菜单定位的单元测试。
 *
 * 菜单被裁切是纯视觉问题，很难在截图验收里稳定复现，
 * 因此把边界计算抽成纯函数单独覆盖。
 */
import { describe, expect, it } from "vitest";
import { placeMenu } from "../ContextMenu";

describe("placeMenu", () => {
  it("keeps the menu at the pointer when there is room", () => {
    expect(placeMenu(100, 100, 1200, 800, 260)).toEqual({ left: 100, top: 100 });
  });

  it("flips left near the right edge", () => {
    // 1200 - 100 = 1100，距右边界不足 208，应向左翻转。
    const { left } = placeMenu(1100, 100, 1200, 800, 260);
    expect(left).toBeLessThan(1100);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it("lifts the menu near the bottom edge", () => {
    const { top } = placeMenu(100, 700, 1200, 800, 260);
    expect(top).toBeLessThan(700);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it("never produces negative coordinates", () => {
    // 极端小视口：菜单比视口还高，也不能跑到负坐标。
    const { left, top } = placeMenu(10, 10, 120, 100, 400);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
  });
});
