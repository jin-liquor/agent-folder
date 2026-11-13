/**
 * 路径与时间描述的单元测试。
 *
 * 重点：界面支持中英双语，相对时间描述必须跟着界面语言走，
 * 英文界面里混进「刚刚」「从未打开」是漏译。
 */
import { describe, expect, it } from "vitest";
import { baseName, shortenPath, timeAgo } from "../path";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("timeAgo", () => {
  it("describes never-opened records", () => {
    expect(timeAgo(0, "zh-CN")).toBe("从未打开");
    expect(timeAgo(0, "en-US")).toBe("Never opened");
  });

  it("describes recent usage in the interface language", () => {
    const now = Date.now();
    expect(timeAgo(now - 30_000, "zh-CN")).toBe("刚刚");
    expect(timeAgo(now - 30_000, "en-US")).toBe("just now");
    expect(timeAgo(now - 5 * MINUTE, "zh-CN")).toBe("5 分钟前");
    expect(timeAgo(now - 5 * MINUTE, "en-US")).toBe("5 min ago");
    expect(timeAgo(now - 3 * HOUR, "zh-CN")).toBe("3 小时前");
    expect(timeAgo(now - 3 * HOUR, "en-US")).toBe("3 h ago");
    expect(timeAgo(now - 2 * DAY, "zh-CN")).toBe("2 天前");
    expect(timeAgo(now - 2 * DAY, "en-US")).toBe("2 d ago");
  });

  it("falls back to an absolute date for old records", () => {
    const old = Date.now() - 30 * DAY;
    const expected = new Date(old);
    const stamp = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(
      expected.getDate(),
    ).padStart(2, "0")}`;
    expect(timeAgo(old, "zh-CN")).toBe(stamp);
    expect(timeAgo(old, "en-US")).toBe(stamp);
  });

  it("defaults to Chinese when no language is given", () => {
    expect(timeAgo(0)).toBe("从未打开");
  });
});

describe("shortenPath", () => {
  it("keeps short paths intact", () => {
    expect(shortenPath("C:\\Projects\\App")).toBe("C:\\Projects\\App");
  });

  it("keeps the drive and the last two segments of long paths", () => {
    const long = "C:\\Users\\someone\\workspace\\project\\apps\\desktop\\src";
    const short = shortenPath(long, 30);
    expect(short.startsWith("C:\\")).toBe(true);
    expect(short).toContain("…");
    expect(short.endsWith("desktop\\src")).toBe(true);
  });
});

describe("baseName", () => {
  it("takes the last segment of a Windows path", () => {
    expect(baseName("C:\\Projects\\App")).toBe("App");
    expect(baseName("App")).toBe("App");
  });
});
